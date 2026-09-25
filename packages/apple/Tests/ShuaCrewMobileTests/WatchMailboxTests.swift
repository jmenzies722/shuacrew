import Foundation
import CryptoKit
import Testing
@testable import ShuaCrewMobile

private actor RelayCapture: WatchRelayTransport {
    var queued: [Data] = []
    var requested: [[String]] = []
    func request(_ data: Data) async throws -> Data {
        let packet = try #require(MobileCodec.strictJSON(data, limit: 60000) as? [String: Any])
        let envelope = try MobileCodec.decode(JSONSerialization.data(withJSONObject: #require(packet["envelope"])))
        let body = try #require(MobileCodec.strictJSON(Data(envelope.payload.utf8)) as? [String: Any])
        requested.append(try #require(body["pending"] as? [String]))
        return Data(#"{"records":[],"accepted":false}"#.utf8)
    }
    func enqueue(_ data: Data) async throws { queued.append(data) }
}

@Test func watchAcknowledgmentLookupPaginatesExpiredHistoryWithoutResending() async throws {
    let key = P256.Signing.PrivateKey(), wire = RelayCapture()
    let mac = MacPairingIdentity(installationId: "mac", publicKey: MobileCodec.encodeBase64url(P256.Signing.PrivateKey().publicKey.x963Representation))
    let backend = WatchRelayMailbox(mac: mac, key: key, transport: wire, clock: { 3000 })
    let device = WatchRelayCodec.deviceId(publicKey: key.publicKey.x963Representation)
    var envelopes: [SignedEnvelope] = []
    for _ in 0..<45 {
        let payload = "{\"version\":1,\"installationId\":\"mac\",\"deviceId\":\"\(device)\",\"commandId\":\"\(UUID().uuidString.lowercased())\",\"issuedAt\":1000,\"expiresAt\":2000,\"action\":{\"kind\":\"refresh\"}}"
        envelopes.append(try MobileSigning.sign(payload: payload, key: key))
    }
    try await backend.trackAcknowledgments(envelopes)
    #expect(try await backend.changes(since: nil).moreComing)
    #expect(try await backend.changes(since: nil).moreComing)
    #expect(try await !backend.changes(since: nil).moreComing)
    #expect(await wire.requested.map(\.count) == [20, 20, 5])
    #expect(Set(await wire.requested.flatMap { $0 }).count == 45)
    #expect(await wire.queued.isEmpty)
}
@Test func watchMailboxRetainsOriginalIdentityAndRejectsExpiredQueueing() async throws {
    let watch = P256.Signing.PrivateKey(), mac = P256.Signing.PrivateKey(), wire = RelayCapture()
    let identity = MacPairingIdentity(installationId: "mac", publicKey: MobileCodec.encodeBase64url(mac.publicKey.x963Representation))
    let backend = WatchRelayMailbox(mac: identity, key: watch, transport: wire, clock: { 1500 })
    let id = UUID(), device = WatchRelayCodec.deviceId(publicKey: watch.publicKey.x963Representation)
    let payload = "{\"version\":1,\"installationId\":\"mac\",\"deviceId\":\"\(device)\",\"commandId\":\"\(id.uuidString.lowercased())\",\"issuedAt\":1000,\"expiresAt\":2000,\"action\":{\"kind\":\"refresh\"}}"
    let signed = try MobileSigning.sign(payload: payload, key: watch)
    try await backend.save(MailboxRecord(id: id, expiresAt: Date(timeIntervalSince1970: 2), payload: MobileCodec.transportBytes(signed)))
    let packet = try #require(await wire.queued.first)
    let body = try #require(MobileCodec.strictJSON(packet, limit: 60000) as? [String: Any])
    let forwarded = try MobileCodec.decode(JSONSerialization.data(withJSONObject: #require(body["envelope"])))
    #expect(forwarded.payload == payload)
    #expect(forwarded.signature == signed.signature)
    #expect(WatchRelayCodec.canQueue(packet, now: 1500))
    #expect(!WatchRelayCodec.canQueue(packet, now: 2000))
    #expect(!WatchRelayCodec.canQueue(WatchRelayCodec.identityRequest(), now: 1500))
    #expect(!WatchRelayCodec.canQueue(Data("malformed".utf8), now: 1500))
    let expired = WatchRelayMailbox(mac: identity, key: watch, transport: wire, clock: { 2000 })
    await #expect(throws: (any Error).self) { try await expired.save(MailboxRecord(id: id, expiresAt: Date(timeIntervalSince1970: 2), payload: MobileCodec.transportBytes(signed))) }
    #expect(await wire.queued.count == 1)
}
