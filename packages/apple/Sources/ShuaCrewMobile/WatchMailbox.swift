import Foundation
import CryptoKit

public protocol WatchRelayTransport: Sendable {
    func request(_ data: Data) async throws -> Data
    /// Queued delivery can outlive reachability; it never means execution.
    func enqueue(_ data: Data) async throws
}
public actor WatchRelayMailbox: CloudMailboxBackend {
    private let mac: MacPairingIdentity
    private let key: P256.Signing.PrivateKey
    private let transport: any WatchRelayTransport
    private let clock: @Sendable () -> Int64
    private var pending: [String: MobileCommand] = [:]
    private var payloadDigests: [String: String] = [:]
    private var sequence: UInt64 = 0
    private var lookupOffset = 0
    public init(mac: MacPairingIdentity, key: P256.Signing.PrivateKey, transport: any WatchRelayTransport,
                clock: @escaping @Sendable () -> Int64 = { Int64(Date().timeIntervalSince1970 * 1000) }) {
        self.mac = mac; self.key = key; self.transport = transport; self.clock = clock
    }
    private func expire(_ now: Int64) {
        pending = pending.filter { $0.value.expiresAt > now }
    }
    public func trackAcknowledgments(_ envelopes: [SignedEnvelope]) async throws {
        guard envelopes.count <= 220 else { throw MobileProtocolError.tooLarge }
        var restored: [String: String] = [:]
        for envelope in envelopes {
            guard try MobileSigning.verify(envelope, publicKey: key.publicKey.x963Representation) else { throw MobileProtocolError.malformed }
            let command = try MobileCodec.command(Data(envelope.payload.utf8))
            guard command.installationId == mac.installationId,
                  command.deviceId == WatchRelayCodec.deviceId(publicKey: key.publicKey.x963Representation),
                  UUID(uuidString: command.commandId) != nil else { throw MobileProtocolError.malformed }
            let digest = SHA256.hash(data: Data(envelope.payload.utf8)).map { String(format: "%02x", $0) }.joined()
            if let previous = restored[command.commandId], previous != digest { throw MobileProtocolError.malformed }
            restored[command.commandId] = digest
        }
        payloadDigests = restored
        pending = pending.filter { restored[$0.key] != nil }
    }
    public func changes(since: Data?) async throws -> MailboxPage {
        let now = clock(); expire(now)
        let ids = payloadDigests.keys.sorted()
        let start = ids.isEmpty ? 0 : lookupOffset % ids.count
        let end = min(start + 20, ids.count)
        let request = try WatchRelayCodec.pull(mac: mac, key: key, pending: Array(ids[start..<end]), now: now)
        let response = try WatchRelayCodec.response(await transport.request(request))
        let macKey = try MobileCodec.base64url(mac.publicKey)
        let device = WatchRelayCodec.deviceId(publicKey: key.publicKey.x963Representation)
        for record in response.records {
            guard let envelope = try? MobileCodec.decode(record.payload), (try? MobileSigning.verify(envelope, publicKey: macKey)) == true,
                  let ack = try? MobileCodec.ack(Data(envelope.payload.utf8)), ack.installationId == mac.installationId,
                  ack.deviceId == device, payloadDigests[ack.commandId] == ack.payloadDigest else { continue }
            pending[ack.commandId] = nil
        }
        sequence &+= 1
        lookupOffset = end == ids.count ? 0 : end
        return MailboxPage(records: response.records, deleted: [], token: Data(String(sequence).utf8), moreComing: lookupOffset != 0)
    }
    public func save(_ record: MailboxRecord) async throws {
        let now = clock(); expire(now)
        let envelope = try MobileCodec.decode(record.payload)
        guard try MobileSigning.verify(envelope, publicKey: key.publicKey.x963Representation) else { throw MobileProtocolError.malformed }
        let command = try MobileCodec.command(Data(envelope.payload.utf8))
        guard command.deviceId == WatchRelayCodec.deviceId(publicKey: key.publicKey.x963Representation), command.installationId == mac.installationId,
              UUID(uuidString: command.commandId) == record.id, command.expiresAt > now, command.issuedAt <= now,
              command.action.kind != "room-message", command.action.offer?.requiresPhone != true else { throw MobileProtocolError.malformed }
        let digest = SHA256.hash(data: Data(envelope.payload.utf8)).map { String(format: "%02x", $0) }.joined()
        if let previous = payloadDigests[command.commandId], previous != digest { throw MobileProtocolError.malformed }
        guard pending[command.commandId] != nil || pending.count < 20 else { throw MobileProtocolError.tooLarge }
        guard payloadDigests[command.commandId] != nil || payloadDigests.count < 220 else { throw MobileProtocolError.tooLarge }
        pending[command.commandId] = command; payloadDigests[command.commandId] = digest
        try await transport.enqueue(WatchRelayCodec.command(envelope, publicKey: key.publicKey.x963Representation))
    }
    public func delete(_ ids: [UUID]) async throws {
        // Cloud cleanup belongs to the Mac. A Watch never gains an arbitrary delete endpoint.
    }
}
