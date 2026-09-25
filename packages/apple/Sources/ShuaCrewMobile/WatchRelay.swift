import Foundation
import CryptoKit

public struct WatchRelayResponse: Codable, Sendable {
    public let identity: MacPairingIdentity?
    public let records: [MailboxRecord]
    /// Transport/proposal acceptance only. Never an execution acknowledgment.
    public let accepted: Bool
}
public enum WatchRelayCodec {
    public static let maximumBytes = 60000
    /// A self-authenticating audience prevents a replacement key claiming an old Watch ID.
    public static func deviceId(publicKey: Data) -> String {
        "watch_" + SHA256.hash(data: publicKey).map { String(format: "%02x", $0) }.joined()
    }
    public static func identityRequest() -> Data { Data(#"{"kind":"identity"}"#.utf8) }
    public static func canQueue(_ data: Data, now: Int64) -> Bool {
        guard let body = try? MobileCodec.strictJSON(data, limit: maximumBytes) as? [String: Any],
              Set(body.keys) == ["kind", "publicKey", "envelope"], body["kind"] as? String == "command",
              let encoded = body["publicKey"] as? String, let key = try? MobileCodec.base64url(encoded),
              let object = body["envelope"], let bytes = try? JSONSerialization.data(withJSONObject: object),
              let envelope = try? MobileCodec.decode(bytes), (try? MobileSigning.verify(envelope, publicKey: key)) == true,
              let command = try? MobileCodec.command(Data(envelope.payload.utf8)) else { return false }
        return command.deviceId == deviceId(publicKey: key) && UUID(uuidString: command.commandId) != nil &&
            command.issuedAt <= now && command.expiresAt > now && command.action.kind != "room-message" && command.action.offer?.requiresPhone != true
    }
    public static func pairing(_ envelope: SignedEnvelope) throws -> Data {
        try packet(kind: "pairing", envelope: envelope, publicKey: nil)
    }
    public static func command(_ envelope: SignedEnvelope, publicKey: Data) throws -> Data {
        try packet(kind: "command", envelope: envelope, publicKey: publicKey)
    }
    public static func pull(mac: MacPairingIdentity, key: P256.Signing.PrivateKey, pending: [String], now: Int64) throws -> Data {
        guard pending.count <= 20, Set(pending).count == pending.count, pending.allSatisfy({ UUID(uuidString: $0) != nil }),
              now >= 0, now <= 9007199254740991 - 60000 else { throw MobileProtocolError.malformed }
        let body: [String: Any] = ["version": 1, "purpose": "watch-pull", "installationId": mac.installationId,
            "deviceId": deviceId(publicKey: key.publicKey.x963Representation), "issuedAt": now, "expiresAt": now + 60000,
            "nonce": UUID().uuidString.lowercased(), "pending": pending]
        let payload = try JSONSerialization.data(withJSONObject: body, options: [.sortedKeys, .withoutEscapingSlashes])
        return try packet(kind: "pull", envelope: MobileSigning.sign(payload: String(decoding: payload, as: UTF8.self), key: key), publicKey: key.publicKey.x963Representation)
    }
    private static func packet(kind: String, envelope: SignedEnvelope, publicKey: Data?) throws -> Data {
        var body: [String: Any] = ["kind": kind, "envelope": try JSONSerialization.jsonObject(with: MobileCodec.transportBytes(envelope))]
        if let publicKey { body["publicKey"] = MobileCodec.encodeBase64url(publicKey) }
        let data = try JSONSerialization.data(withJSONObject: body, options: [.sortedKeys, .withoutEscapingSlashes])
        guard data.count <= maximumBytes else { throw MobileProtocolError.tooLarge }
        return data
    }
    public static func response(_ data: Data) throws -> WatchRelayResponse {
        guard let body = try MobileCodec.strictJSON(data, limit: maximumBytes) as? [String: Any],
              Set(body.keys) == ["records", "accepted"] || Set(body.keys) == ["records", "accepted", "identity"] else { throw MobileProtocolError.malformed }
        let result = try JSONDecoder().decode(WatchRelayResponse.self, from: data)
        guard result.records.count <= 22, result.records.allSatisfy({ !$0.payload.isEmpty && $0.payload.count <= 32768 && $0.expiresAt.timeIntervalSince1970.isFinite }) else { throw MobileProtocolError.tooLarge }
        return result
    }
    static func encode(_ response: WatchRelayResponse) throws -> Data {
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        let data = try encoder.encode(response)
        _ = try self.response(data)
        return data
    }
}

/// Phone-side transport only. No phone signing key is accepted by this type.
public actor PhoneWatchRelay {
    private let mac: MacPairingIdentity
    private let mailbox: CloudMailbox
    private let onPairing: @Sendable (SignedEnvelope) async throws -> Void
    private var closed = false, busy = false
    private var audience: String?
    private var requested = Set<String>()
    private var snapshot: (MobileSnapshot, MailboxRecord)?
    private var acknowledgments: [String: MailboxRecord] = [:]
    private var revocation: MailboxRecord?
    public init(mac: MacPairingIdentity, mailbox: CloudMailbox, onPairing: @escaping @Sendable (SignedEnvelope) async throws -> Void = { _ in }) {
        self.mac = mac; self.mailbox = mailbox; self.onPairing = onPairing
    }
    public func close() async {
        closed = true; snapshot = nil; acknowledgments = [:]; revocation = nil
        await mailbox.setEnabled(false)
    }
    private func check() throws { try Task.checkCancellation(); guard !closed else { throw CompanionError.closed } }
    public func handle(_ data: Data, now: Int64) async throws -> Data {
        try check(); guard !busy else { throw CompanionError.busy }
        busy = true; defer { busy = false }
        guard let body = try MobileCodec.strictJSON(data, limit: WatchRelayCodec.maximumBytes) as? [String: Any], let kind = body["kind"] as? String else { throw MobileProtocolError.malformed }
        if kind == "identity" {
            try MobileCodec.keys(body, ["kind"])
            return try WatchRelayCodec.encode(WatchRelayResponse(identity: mac, records: [], accepted: false))
        }
        guard let object = body["envelope"] else { throw MobileProtocolError.malformed }
        let envelope = try MobileCodec.decode(JSONSerialization.data(withJSONObject: object))
        if kind == "pairing" {
            try MobileCodec.keys(body, ["kind", "envelope"])
            let proposal = try MobilePairing.inspect(envelope, mac: mac, now: now)
            guard proposal.device.kind == "watch", proposal.device.id == WatchRelayCodec.deviceId(publicKey: try MobileCodec.base64url(proposal.device.publicKey)) else { throw MobileProtocolError.malformed }
            try await onPairing(envelope); try check()
            return try WatchRelayCodec.encode(WatchRelayResponse(identity: nil, records: [], accepted: true))
        }
        try MobileCodec.keys(body, ["kind", "envelope", "publicKey"])
        guard let encodedKey = body["publicKey"] as? String else { throw MobileProtocolError.malformed }
        let key = try MobileCodec.base64url(encodedKey)
        guard try MobileSigning.verify(envelope, publicKey: key) else { throw MobileProtocolError.malformed }
        let device = WatchRelayCodec.deviceId(publicKey: key)
        if kind == "command" {
            let command = try MobileCodec.command(Data(envelope.payload.utf8))
            guard command.deviceId == device, command.installationId == mac.installationId,
                  command.issuedAt <= now, command.expiresAt > now, let id = UUID(uuidString: command.commandId),
                  command.action.kind != "room-message", command.action.offer?.requiresPhone != true else { throw MobileProtocolError.malformed }
            try await mailbox.save(MailboxRecord(id: id, expiresAt: Date(timeIntervalSince1970: Double(command.expiresAt) / 1000), payload: MobileCodec.transportBytes(envelope)))
            try check()
            return try WatchRelayCodec.encode(WatchRelayResponse(identity: nil, records: [], accepted: true))
        }
        guard kind == "pull", let pull = try MobileCodec.strictJSON(Data(envelope.payload.utf8)) as? [String: Any] else { throw MobileProtocolError.malformed }
        try MobileCodec.keys(pull, ["version", "purpose", "installationId", "deviceId", "issuedAt", "expiresAt", "nonce", "pending"])
        try MobileCodec.identity(pull); try MobileCodec.identifier(pull, "nonce")
        let issued = try MobileCodec.integer(pull, "issuedAt"), expires = try MobileCodec.integer(pull, "expiresAt")
        guard pull["purpose"] as? String == "watch-pull", pull["installationId"] as? String == mac.installationId, pull["deviceId"] as? String == device,
              Double(issued) <= Double(now) + 30000, expires > now, expires > issued, expires - issued <= 60000,
              let ids = pull["pending"] as? [String], ids.count <= 20, Set(ids).count == ids.count, ids.allSatisfy({ UUID(uuidString: $0) != nil }) else { throw MobileProtocolError.malformed }
        let pending = Set(ids)
        // Re-scan when a relaunched Watch reveals pending IDs we did not previously cache.
        if audience != device || !pending.isSubset(of: requested) {
            await mailbox.setEnabled(false); try check(); await mailbox.setEnabled(true); try check()
            if audience != device { snapshot = nil; acknowledgments = [:]; revocation = nil }
        }
        audience = device; requested = pending
        acknowledgments = acknowledgments.filter { pending.contains($0.key) }
        let date = Date(timeIntervalSince1970: Double(now) / 1000), macKey = try MobileCodec.base64url(mac.publicKey)
        for _ in 0..<4 {
            let page = try await mailbox.fetchChanges(); try check()
            for record in page.records where record.expiresAt > date && record.payload.count <= 32768 {
                guard let signed = try? MobileCodec.decodeSnapshotEnvelope(record.payload), (try? MobileSigning.verifySnapshot(signed, publicKey: macKey)) == true else { continue }
                let bytes = Data(signed.payload.utf8)
                if let value = try? MobileCodec.snapshot(bytes), value.deviceId == device, value.installationId == mac.installationId {
                    if snapshot == nil || (value.sequence >= snapshot!.0.sequence && value.observedAt > snapshot!.0.observedAt) { snapshot = (value, record) }
                } else if let ack = try? MobileCodec.ack(bytes), ack.deviceId == device, ack.installationId == mac.installationId, pending.contains(ack.commandId) {
                    acknowledgments[ack.commandId] = record
                } else if let notice = try? MobileCodec.revocation(bytes), notice.deviceId == device, notice.installationId == mac.installationId, notice.expiresAt > now {
                    revocation = record
                }
            }
            // Cache and cursor have the same in-memory lifetime; restart re-reads the durable cloud.
            try await mailbox.acknowledge(page); try check()
            if !page.moreComing { break }
        }
        let records = ([revocation, snapshot?.1].compactMap { $0 } + ids.compactMap { acknowledgments[$0] }).filter { $0.expiresAt > date }
        return try WatchRelayCodec.encode(WatchRelayResponse(identity: nil, records: records, accepted: false))
    }
}
