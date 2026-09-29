import Foundation
import CryptoKit
import Testing
@testable import ShuaCrewMobile

private actor RelayBackend: CloudMailboxBackend {
    var records: [MailboxRecord] = []
    func changes(since: Data?) async throws -> MailboxPage { MailboxPage(records: records, deleted: [], token: Data([1]), moreComing: false) }
    func save(_ value: MailboxRecord) async throws {
        if let old = records.first(where: { $0.id == value.id }) {
            guard old.payload == value.payload, old.expiresAt == value.expiresAt else { throw MobileProtocolError.malformed }; return
        }
        records.append(value)
    }
    func delete(_ ids: [UUID]) async throws { records.removeAll { ids.contains($0.id) } }
}

private actor RelaunchTransport: WatchRelayTransport {
    let relay: PhoneWatchRelay
    let now: Int64
    var sent = 0
    init(relay: PhoneWatchRelay, now: Int64) { self.relay = relay; self.now = now }
    func request(_ data: Data) async throws -> Data { try await relay.handle(data, now: now) }
    func enqueue(_ data: Data) async throws { sent += 1; _ = try await relay.handle(data, now: now) }
}

@Test func watchRestoresExpiredCommandAcknowledgmentAfterRelaunch() async throws {
    let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false)
    defer { try? FileManager.default.removeItem(at: directory) }
    let watch = P256.Signing.PrivateKey(), macKey = P256.Signing.PrivateKey(), checkpointKey = SymmetricKey(size: .bits256)
    let identity = MacPairingIdentity(installationId: "mac", publicKey: MobileCodec.encodeBase64url(macKey.publicKey.x963Representation))
    let device = WatchRelayCodec.deviceId(publicKey: watch.publicKey.x963Representation)
    let backend = RelayBackend(), checkpoint = MobileCheckpointFile(url: directory.appending(path: "state"))
    let phoneMailbox = CloudMailbox(backend: backend); await phoneMailbox.setEnabled(true)
    let relay = PhoneWatchRelay(mac: identity, mailbox: phoneMailbox)
    let earlyWire = RelaunchTransport(relay: relay, now: 1001)
    let earlyMailbox = CloudMailbox(backend: WatchRelayMailbox(mac: identity, key: watch, transport: earlyWire, clock: { 1001 }))
    await earlyMailbox.setEnabled(true)
    let session = try CompanionSession(account: "A", mac: identity, deviceId: device, signingKey: watch, checkpointKey: checkpointKey, checkpoint: checkpoint, mailbox: earlyMailbox, now: 1000)
    let id = try await session.submit(.refresh, now: 1000)
    try await session.reconcile(now: 1001)
    let original = try MobileCodec.decode(#require(await backend.records.first).payload)
    let digest = SHA256.hash(data: Data(original.payload.utf8)).map { String(format: "%02x", $0) }.joined()
    // Mac applied just before expiry; the Watch reconnects after expiry with a fresh transport.
    let ack = MobileAck(version: 1, installationId: "mac", deviceId: device, commandId: id, payloadDigest: digest, state: "applied", reason: "snapshot-requested", at: 86400999)
    let signed = try MobileSigning.sign(payload: String(decoding: JSONEncoder().encode(ack), as: UTF8.self), key: macKey)
    try await backend.save(MailboxRecord(id: UUID(), expiresAt: Date(timeIntervalSince1970: 172801), payload: MobileCodec.transportBytes(signed)))
    let lateWire = RelaunchTransport(relay: relay, now: 86402000)
    let lateMailbox = CloudMailbox(backend: WatchRelayMailbox(mac: identity, key: watch, transport: lateWire, clock: { 86402000 }))
    await lateMailbox.setEnabled(true)
    let restored = try CompanionSession(account: "A", mac: identity, deviceId: device, signingKey: watch, checkpointKey: checkpointKey, checkpoint: checkpoint, mailbox: lateMailbox, now: 86402000)
    #expect(await restored.view(now: 86402000).commands[id] == .expired)
    try await restored.reconcile(now: 86402000)
    #expect(await restored.view(now: 86402000).commands[id] == .applied)
    #expect(await lateWire.sent == 0)
}

@Test func phoneRelaysOriginalWatchSignatureAndRejectsIdentitySpoofing() async throws {
    let key = P256.Signing.PrivateKey(), macKey = P256.Signing.PrivateKey(), backend = RelayBackend()
    let mailbox = CloudMailbox(backend: backend)
    await mailbox.setEnabled(true)
    let mac = MacPairingIdentity(installationId: "mac", publicKey: MobileCodec.encodeBase64url(macKey.publicKey.x963Representation))
    let relay = PhoneWatchRelay(mac: mac, mailbox: mailbox)
    let watchId = WatchRelayCodec.deviceId(publicKey: key.publicKey.x963Representation)
    let payload = "{\"version\":1,\"installationId\":\"mac\",\"deviceId\":\"\(watchId)\",\"commandId\":\"00000000-0000-4000-a000-000000000001\",\"issuedAt\":1000,\"expiresAt\":2000,\"action\":{\"kind\":\"room-pause\",\"roomId\":\"room\",\"paused\":true}}"
    let original = try MobileSigning.sign(payload: payload, key: key)
    let packet = try WatchRelayCodec.command(original, publicKey: key.publicKey.x963Representation)
    _ = try await relay.handle(packet, now: 1500)
    _ = try await relay.handle(packet, now: 1501)
    let stored = try #require(await backend.records.first)
    let forwarded = try MobileCodec.decode(stored.payload)
    #expect(forwarded.payload == original.payload)
    #expect(forwarded.signature == original.signature)
    #expect(await backend.records.count == 1)
    let forged = try MobileSigning.sign(payload: payload.replacingOccurrences(of: watchId, with: "phone"), key: key)
    await #expect(throws: (any Error).self) { try await relay.handle(WatchRelayCodec.command(forged, publicKey: key.publicKey.x963Representation), now: 1500) }
    await #expect(throws: (any Error).self) { try await relay.handle(packet, now: 2000) }
    await relay.close()
    await #expect(throws: (any Error).self) { try await relay.handle(packet, now: 1500) }
}

@Test func watchPullOnlyReturnsMacSignedRecordsForTheKeyOwner() async throws {
    let key = P256.Signing.PrivateKey(), other = P256.Signing.PrivateKey(), macKey = P256.Signing.PrivateKey(), backend = RelayBackend()
    let mac = MacPairingIdentity(installationId: "mac", publicKey: MobileCodec.encodeBase64url(macKey.publicKey.x963Representation))
    let mailbox = CloudMailbox(backend: backend); await mailbox.setEnabled(true)
    let relay = PhoneWatchRelay(mac: mac, mailbox: mailbox)
    let device = WatchRelayCodec.deviceId(publicKey: key.publicKey.x963Representation)
    for (audience, signer) in [(device, macKey), ("phone", macKey), (device, other)] {
        let payload = "{\"version\":1,\"installationId\":\"mac\",\"deviceId\":\"\(audience)\",\"sequence\":1,\"observedAt\":1000,\"rooms\":[],\"runs\":[],\"offers\":[],\"usage\":{\"inputTokens\":12,\"outputTokens\":3,\"cacheTokens\":0,\"records\":1,\"costUsd\":null},\"truncated\":false}"
        let signed = try MobileSigning.signSnapshot(payload: payload, key: signer)
        try await backend.save(MailboxRecord(id: UUID(), expiresAt: Date(timeIntervalSince1970: 5), payload: MobileCodec.transportBytes(signed)))
    }
    let request = try WatchRelayCodec.pull(mac: mac, key: key, pending: [], now: 1500)
    let response = try WatchRelayCodec.response(await relay.handle(request, now: 1500))
    #expect(response.records.count == 1)
    let snapshot = try MobileCodec.snapshot(Data(MobileCodec.decodeSnapshotEnvelope(response.records[0].payload).payload.utf8))
    #expect(snapshot.deviceId == device)
    #expect(snapshot.usage.costUsd == nil)
    #expect(snapshot.usage.inputTokens == 12)
    let otherRequest = try WatchRelayCodec.pull(mac: mac, key: other, pending: [], now: 1500)
    #expect(try WatchRelayCodec.response(await relay.handle(otherRequest, now: 1500)).records.isEmpty)
}
