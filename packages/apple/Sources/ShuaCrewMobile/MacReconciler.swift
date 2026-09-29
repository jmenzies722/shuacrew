import Foundation
import CryptoKit

/// The Mac transports only verified device commands and signs only audience-bound gateway results.
public actor MacMailboxReconciler {
    private let mailbox: CloudMailbox
    private let gateway: any MacMobileGateway
    private let installationId: String
    private let signingKey: P256.Signing.PrivateKey
    private var busy = false
    public private(set) var rejectedRecords = 0
    private var revocationCursor: Int64 = 0
    private var revocationReplayAfter: Int64?
    public init(mailbox: CloudMailbox, gateway: any MacMobileGateway, installationId: String, signingKey: P256.Signing.PrivateKey) {
        self.mailbox = mailbox; self.gateway = gateway; self.installationId = installationId; self.signingKey = signingKey
    }
    private func encoded(_ envelope: SignedEnvelope) throws -> Data {
        try MobileCodec.transportBytes(envelope)
    }
    public func reconcile(now: Int64) async throws {
        guard !busy else { throw MailboxError.busy }
        busy = true; defer { busy = false }
        guard now >= 0, now <= 9007199254740991 - 86400000 else { throw MobileProtocolError.malformed }
        // Renew notices while this process stays alive, with overlap before their 24h expiry.
        // The durable audit remains authoritative; no unbounded local tombstone cache.
        if now >= (revocationReplayAfter ?? 0) {
            revocationCursor = 0
            revocationReplayAfter = now + 43200000
        }
        // The gateway audit is the durable outbox. Do not advance on upload failure.
        // A restart re-exports revocations in bounded pages rather than losing offline notices.
        for _ in 0..<4 {
            try Task.checkCancellation()
            let revocations = try await gateway.revocations(after: revocationCursor)
            guard revocations.count <= 100 else { throw MobileProtocolError.tooLarge }
            for revoked in revocations {
                guard revoked.sequence > revocationCursor, revoked.sequence <= 9007199254740991,
                      revoked.at >= 0, revoked.at <= now else { throw MobileProtocolError.malformed }
                let notice = MobileRevocationNotice(version: 1, kind: "revoked", installationId: installationId, deviceId: revoked.deviceId,
                    revokedAt: revoked.at, issuedAt: now, expiresAt: now + 86400000)
                let payload = try JSONEncoder().encode(notice)
                _ = try MobileCodec.revocation(payload)
                let envelope = try MobileSigning.sign(payload: String(decoding: payload, as: UTF8.self), key: signingKey)
                try await mailbox.save(MailboxRecord(id: UUID(), expiresAt: Date(timeIntervalSince1970: Double(now + 86400000) / 1000), payload: encoded(envelope)))
                revocationCursor = revoked.sequence
            }
            if revocations.count < 100 { break }
        }
        let devices = try await gateway.devices()
        guard devices.count <= 20 else { throw MobileProtocolError.tooLarge }
        // Bound work per foreground/background turn; unacknowledged pages remain retryable.
        for _ in 0..<4 {
            try Task.checkCancellation()
            let page = try await mailbox.fetchChanges()
            for record in page.records {
                try Task.checkCancellation()
                guard let envelope = try? MobileCodec.decode(record.payload) else { continue }
                // Our own snapshots/acks and unpaired signatures are not commands.
                guard let signer = devices.first(where: { device in
                    guard let key = try? MobileCodec.base64url(device.publicKey) else { return false }
                    return (try? MobileSigning.verify(envelope, publicKey: key)) == true
                }), let command = try? MobileCodec.command(Data(envelope.payload.utf8)),
                      command.installationId == installationId, command.deviceId == signer.id else { continue }
                // A 409 can mean persistence failed after the action. Keep the page and original
                // signed command for receipt recovery; absence of an ack is never a terminal result.
                let response = try await gateway.submit(envelope)
                let ack = try MobileCodec.ack(response)
                let digest = SHA256.hash(data: Data(envelope.payload.utf8)).map { String(format: "%02x", $0) }.joined()
                guard ack.installationId == installationId, ack.deviceId == signer.id,
                      ack.commandId == command.commandId, ack.payloadDigest == digest else { throw MobileProtocolError.malformed }
                let signed = try MobileSigning.sign(payload: String(decoding: response, as: UTF8.self), key: signingKey)
                try await mailbox.save(MailboxRecord(id: UUID(), expiresAt: Date(timeIntervalSince1970: Double(ack.at + 86400000) / 1000), payload: encoded(signed)))
            }
            try await mailbox.acknowledge(page)
            rejectedRecords = min(9999999, rejectedRecords + page.rejectedRecords)
            if !page.moreComing { break }
        }
        try await mailbox.deleteExpired(now: Date(timeIntervalSince1970: Double(now) / 1000))
        for device in devices {
            try Task.checkCancellation()
            let data: Data
            do { data = try await gateway.snapshot(deviceId: device.id) }
            catch let error as MobileGatewayError where error.status == 409 { continue }
            let snapshot = try MobileCodec.snapshot(data)
            guard snapshot.installationId == installationId, snapshot.deviceId == device.id else { throw MobileProtocolError.malformed }
            let envelope = try MobileSigning.signSnapshot(payload: String(decoding: data, as: UTF8.self), key: signingKey)
            try await mailbox.save(MailboxRecord(id: UUID(), expiresAt: Date(timeIntervalSince1970: Double(snapshot.observedAt + 120000) / 1000), payload: encoded(envelope)))
        }
    }
}
