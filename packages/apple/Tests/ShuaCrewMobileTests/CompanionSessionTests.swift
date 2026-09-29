import Foundation
import CryptoKit
import Testing
@testable import ShuaCrewMobile

private actor CompanionBackend: CloudMailboxBackend {
    var saved: [MailboxRecord] = []
    var incoming: [MailboxRecord] = []
    func changes(since: Data?) async throws -> MailboxPage {
        MailboxPage(records: incoming, deleted: [], token: Data([1]), moreComing: false)
    }
    func save(_ record: MailboxRecord) async throws {
        if let previous = saved.first(where: { $0.id == record.id }), previous.payload != record.payload || previous.expiresAt != record.expiresAt { throw MobileProtocolError.malformed }
        saved.append(record)
    }
    func delete(_ ids: [UUID]) async throws {}
    func receive(_ envelope: SignedEnvelope) throws {
        incoming = [MailboxRecord(id: UUID(), expiresAt: Date(timeIntervalSince1970: 10000), payload: try JSONEncoder().encode(envelope))]
    }
}

@Test func companionPersistsBeforeDeliveryAndWaitsForBoundMacAck() async throws {
    let folder = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false)
    defer { try? FileManager.default.removeItem(at: folder) }
    let phone = P256.Signing.PrivateKey(), mac = P256.Signing.PrivateKey(), key = SymmetricKey(size: .bits256)
    let backend = CompanionBackend()
    let transport = CloudMailbox(backend: backend)
    await transport.setEnabled(true)
    let checkpoint = MobileCheckpointFile(url: folder.appending(path: "state"))
    let session = try CompanionSession(account: "A", mac: MacPairingIdentity(installationId: "mac", publicKey: MobileCodec.encodeBase64url(mac.publicKey.x963Representation)),
        deviceId: "phone", signingKey: phone, checkpointKey: key, checkpoint: checkpoint, mailbox: transport, now: 1000)
    let id = try await session.submit(.refresh, now: 1000)
    #expect(await backend.saved.isEmpty)
    #expect(await session.view(now: 1000).commands[id] == .sending)
    try await session.reconcile(now: 1001)
    #expect(await session.view(now: 1001).commands[id] == .waitingForMac)
    // The private mailbox has immutable records: retry bytes must be identical,
    // including the envelope's outer JSON, not only its signed payload string.
    for _ in 0..<30 { try await session.reconcile(now: 1001) }
    #expect(Set(await backend.saved.map(\.payload)).count == 1)
    let envelope = try MobileCodec.decode(#require(await backend.saved.first).payload)
    let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    #expect(try String(decoding: MobileCodec.transportBytes(SignedEnvelope(payload: "test", signature: "sig")), as: UTF8.self) == #"{"payload":"test","signature":"sig"}"#)
    #expect(try MobileCodec.transportBytes(envelope) == encoder.encode(envelope))
    let retry = try CompanionSession(account: "A", mac: MacPairingIdentity(installationId: "mac", publicKey: MobileCodec.encodeBase64url(mac.publicKey.x963Representation)),
        deviceId: "phone", signingKey: phone, checkpointKey: key, checkpoint: checkpoint, mailbox: transport, now: 1001)
    try await retry.reconcile(now: 1001)
    #expect(await backend.saved.last?.payload == backend.saved.first?.payload)
    let digest = SHA256.hash(data: Data(envelope.payload.utf8)).map { String(format: "%02x", $0) }.joined()
    let ack = MobileAck(version: 1, installationId: "mac", deviceId: "phone", commandId: id, payloadDigest: digest, state: "applied", reason: "snapshot-requested", at: 1002)
    let signed = try MobileSigning.sign(payload: String(decoding: JSONEncoder().encode(ack), as: UTF8.self), key: mac)
    try await backend.receive(signed)
    try await session.reconcile(now: 1003)
    #expect(await session.view(now: 1003).commands[id] == .applied)
    let restored = try CompanionSession(account: "A", mac: MacPairingIdentity(installationId: "mac", publicKey: MobileCodec.encodeBase64url(mac.publicKey.x963Representation)),
        deviceId: "phone", signingKey: phone, checkpointKey: key, checkpoint: checkpoint, mailbox: transport, now: 1004)
    #expect(await restored.view(now: 1004).commands[id] == .applied)
    let revoked = try MobileSigning.sign(payload: #"{"version":1,"kind":"revoked","installationId":"mac","deviceId":"phone","revokedAt":1004,"issuedAt":1005,"expiresAt":9000}"#, key: mac)
    try await backend.receive(revoked)
    try await session.reconcile(now: 1006)
    #expect(await session.view(now: 1006).revoked)
    #expect(await session.view(now: 1006).commands.isEmpty)
    let afterRevocation = try CompanionSession(account: "A", mac: MacPairingIdentity(installationId: "mac", publicKey: MobileCodec.encodeBase64url(mac.publicKey.x963Representation)),
        deviceId: "phone", signingKey: phone, checkpointKey: key, checkpoint: checkpoint, mailbox: transport, now: 1007)
    #expect(await afterRevocation.view(now: 1007).revoked)
    await session.close()
    await #expect(throws: (any Error).self) { try await session.submit(.refresh, now: 1005) }
    #expect(await session.view(now: 1005).commands.isEmpty)
}

@Test func companionCannotSendIfDurableStorageFails() async throws {
    let missing = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString).appending(path: "state")
    let backend = CompanionBackend()
    let mailbox = CloudMailbox(backend: backend)
    let session = try CompanionSession(account: "A", mac: MacPairingIdentity(installationId: "mac", publicKey: MobileCodec.encodeBase64url(P256.Signing.PrivateKey().publicKey.x963Representation)),
        deviceId: "phone", signingKey: P256.Signing.PrivateKey(), checkpointKey: SymmetricKey(size: .bits256), checkpoint: MobileCheckpointFile(url: missing), mailbox: mailbox, now: 1000)
    await #expect(throws: (any Error).self) { try await session.submit(.refresh, now: 1000) }
    #expect(await session.view(now: 1000).commands.isEmpty)
    #expect(await backend.saved.isEmpty)
}

private struct CancelledAuthentication: CompanionAuthenticator {
    func authenticate() async throws -> Bool { false }
}
private struct DelayedAuthentication: CompanionAuthenticator {
    func authenticate() async throws -> Bool { try await Task.sleep(for: .milliseconds(10)); return true }
}
@Test func cancelledAuthenticationCreatesNoApprovalEnvelope() async throws {
    let folder = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false)
    defer { try? FileManager.default.removeItem(at: folder) }
    let backend = CompanionBackend(), mac = P256.Signing.PrivateKey(), phone = P256.Signing.PrivateKey()
    let mailbox = CloudMailbox(backend: backend)
    await mailbox.setEnabled(true)
    let session = try CompanionSession(account: "A", mac: MacPairingIdentity(installationId: "mac", publicKey: MobileCodec.encodeBase64url(mac.publicKey.x963Representation)),
        deviceId: "phone", signingKey: phone, checkpointKey: SymmetricKey(size: .bits256), checkpoint: MobileCheckpointFile(url: folder.appending(path: "state")), mailbox: mailbox, now: 1000)
    let offer = ApprovalOffer(version: 1, installationId: "mac", deviceId: "phone", offerId: "offer", runId: "run", approvalId: "approval", tool: "read", inputDigest: String(repeating: "a", count: 64), summary: "Read project", nonce: "nonce", issuedAt: 1000, expiresAt: 2000, requiresPhone: true)
    let snapshot = MobileSnapshot(version: 1, installationId: "mac", deviceId: "phone", sequence: 1, observedAt: 1000, rooms: [], runs: [], offers: [offer], usage: MobileUsage(inputTokens: 0, outputTokens: 0, cacheTokens: 0, records: 0, costUsd: nil), truncated: false)
    // JSONEncoder omits nil cost; the strict wire contract requires explicit null.
    var object = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(snapshot)) as? [String: Any])
    object["usage"] = ["inputTokens": 0, "outputTokens": 0, "cacheTokens": 0, "records": 0, "costUsd": NSNull()]
    try await backend.receive(MobileSigning.signSnapshot(payload: String(decoding: JSONSerialization.data(withJSONObject: object), as: UTF8.self), key: mac))
    try await session.reconcile(now: 1000)
    #expect(await session.view(now: 1000).snapshot?.offers.count == 1)
    await #expect(throws: CompanionError.authenticationRequired) {
        try await session.submit(.decide(offerId: "offer", allow: true), now: 1001, authenticator: CancelledAuthentication())
    }
    #expect(await session.view(now: 1001).commands.isEmpty)
    #expect(await backend.saved.isEmpty)
    _ = try await session.submit(.decide(offerId: "offer", allow: false), now: 1002)
    #expect(await session.view(now: 1002).commands.count == 1)
    await #expect(throws: CompanionError.unavailableOffer) {
        try await session.submit(.decide(offerId: "offer", allow: true), now: 1999, authenticator: DelayedAuthentication())
    }
    #expect(await session.view(now: 2010).commands.count == 1)
    #expect(await backend.saved.isEmpty)
}
