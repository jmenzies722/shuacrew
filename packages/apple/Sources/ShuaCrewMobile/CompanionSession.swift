import Foundation
import CryptoKit

public enum CompanionIntent: Sendable {
    case refresh
    case message(roomId: String, text: String)
    case pause(roomId: String, paused: Bool)
    case stop(runId: String)
    case decide(offerId: String, allow: Bool)
}
public struct CompanionViewState: Sendable {
    public let snapshot: MobileSnapshot?
    public let stale: Bool
    public let commands: [String: MobileCommandStatus]
    public let rejectedRecords: Int
    public let revoked: Bool
}
public enum CompanionError: Error { case closed, busy, stale, authenticationRequired, unavailableOffer }
public protocol CompanionAuthenticator: Sendable {
    func authenticate() async throws -> Bool
}

/// One account/device session. Durable storage always precedes cloud delivery or visible settlement.
public actor CompanionSession {
    private var state: MobileSyncState
    private let account: String
    private let mac: MacPairingIdentity
    private let deviceId: String
    private let signingKey: P256.Signing.PrivateKey
    private let checkpointKey: SymmetricKey
    private let checkpoint: MobileCheckpointFile
    private let mailbox: CloudMailbox
    private var closed = false
    private var busy = false
    private var rejectedRecords = 0
    public init(account: String, mac: MacPairingIdentity, deviceId: String,
                signingKey: P256.Signing.PrivateKey, checkpointKey: SymmetricKey,
                checkpoint: MobileCheckpointFile, mailbox: CloudMailbox, now: Int64) throws {
        self.account = account; self.mac = mac; self.deviceId = deviceId; self.signingKey = signingKey
        self.checkpointKey = checkpointKey; self.checkpoint = checkpoint; self.mailbox = mailbox
        state = MobileSyncState(account: account, installationId: mac.installationId, deviceId: deviceId,
            macPublicKey: try MobileCodec.base64url(mac.publicKey), devicePublicKey: signingKey.publicKey.x963Representation)
        try checkpoint.restore(into: &state, key: checkpointKey, now: now)
    }
    public func view(now: Int64) -> CompanionViewState {
        CompanionViewState(snapshot: state.snapshot, stale: state.isStale(now: now), commands: state.statuses, rejectedRecords: rejectedRecords, revoked: state.isRevoked)
    }
    private func begin() throws {
        try Task.checkCancellation()
        guard !closed else { throw CompanionError.closed }
        guard !busy else { throw CompanionError.busy }
        busy = true
    }
    private func check() throws {
        try Task.checkCancellation()
        guard !closed else { throw CompanionError.closed }
    }
    private func persist(_ next: MobileSyncState) throws {
        try check()
        try checkpoint.save(next, key: checkpointKey)
        state = next
    }
    /// Closing is irreversible; a changed iCloud account must create a new paired identity/session.
    public func close() async {
        closed = true; state.changeAccount(to: nil)
        await mailbox.setEnabled(false)
    }
    /// No cloud I/O here. The command is created only after any required authentication succeeds.
    public func submit(_ intent: CompanionIntent, now: Int64, authenticator: (any CompanionAuthenticator)? = nil) async throws -> String {
        try begin(); defer { busy = false }
        guard now >= 0, now <= 9007199254740991 - 86400000 else { throw MobileProtocolError.malformed }
        let started = ContinuousClock.now
        var issuedAt = now
        var action: [String: Any] = [:]
        var expires = now + 86400000
        switch intent {
        case .refresh: action = ["kind": "refresh"]
        case let .message(roomId, text): action = ["kind": "room-message", "roomId": roomId, "text": text]
        case let .pause(roomId, paused): action = ["kind": "room-pause", "roomId": roomId, "paused": paused]
        case let .stop(runId): action = ["kind": "run-stop", "runId": runId]
        case let .decide(offerId, allow):
            guard !state.isStale(now: now) else { throw CompanionError.stale }
            guard let offer = state.snapshot?.offers.first(where: { $0.offerId == offerId }), offer.issuedAt <= now, offer.expiresAt > now else { throw CompanionError.unavailableOffer }
            if allow {
                guard let authenticator, try await authenticator.authenticate() else { throw CompanionError.authenticationRequired }
                try check()
                let elapsed = started.duration(to: .now).components
                guard elapsed.seconds < 86400 else { throw CompanionError.unavailableOffer }
                issuedAt += elapsed.seconds * 1000 + elapsed.attoseconds / 1_000_000_000_000_000
                guard offer.expiresAt > issuedAt, !state.isStale(now: issuedAt) else { throw CompanionError.unavailableOffer }
            }
            action = ["kind": "approval", "offer": try JSONSerialization.jsonObject(with: JSONEncoder().encode(offer)), "allow": allow]
            expires = offer.expiresAt
        }
        try check()
        let id = UUID().uuidString.lowercased()
        let bytes = try JSONSerialization.data(withJSONObject: ["version": 1, "installationId": mac.installationId,
            "deviceId": deviceId, "commandId": id, "issuedAt": issuedAt, "expiresAt": expires, "action": action], options: [.sortedKeys, .withoutEscapingSlashes])
        _ = try MobileCodec.command(bytes)
        let envelope = try MobileSigning.sign(payload: String(decoding: bytes, as: UTF8.self), key: signingKey)
        var next = state; next.expire(now: issuedAt)
        try next.enqueue(envelope, now: issuedAt)
        try persist(next)
        return id
    }
    public func reconcile(now: Int64) async throws {
        try begin(); defer { busy = false }
        var next = state; next.expire(now: now); try persist(next)
        try await mailbox.trackAcknowledgments(state.acknowledgmentCandidates); try check()
        // Read outcomes first: a lost upload response must not resend a now-settled command.
        for _ in 0..<4 {
            let page = try await mailbox.fetchChanges(); try check()
            next = state
            for record in page.records where record.expiresAt > Date(timeIntervalSince1970: Double(now) / 1000) {
                guard let envelope = try? MobileCodec.decodeSnapshotEnvelope(record.payload) else { continue }
                if (try? next.acceptRevocation(envelope, account: account, now: now)) == true { continue }
                // Each decoder independently verifies the Mac signature before interpreting its schema.
                if (try? next.acceptSnapshot(envelope, account: account)) == true { continue }
                _ = try? next.acceptAck(envelope, account: account)
            }
            try persist(next)
            try await mailbox.acknowledge(page); try check()
            rejectedRecords = min(9999999, rejectedRecords + page.rejectedRecords)
            if !page.moreComing { break }
        }
        for envelope in state.pending {
            let command = try MobileCodec.command(Data(envelope.payload.utf8))
            guard let recordId = UUID(uuidString: command.commandId) else { throw MobileProtocolError.malformed }
            try await mailbox.save(MailboxRecord(id: recordId, expiresAt: Date(timeIntervalSince1970: Double(command.expiresAt) / 1000), payload: MobileCodec.transportBytes(envelope)))
            try check()
            next = state; next.markDelivered(command.commandId); try persist(next)
        }
    }
}
