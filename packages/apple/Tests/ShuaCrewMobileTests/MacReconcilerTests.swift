import Foundation
import CryptoKit
import Testing
@testable import ShuaCrewMobile

private actor ReconcileMailbox: CloudMailboxBackend {
    let input: MailboxRecord
    var saved: [MailboxRecord] = []
    var failingWrites = false
    var deletionOutputCounts: [Int] = []
    init(_ input: MailboxRecord) { self.input = input }
    func changes(since: Data?) async throws -> MailboxPage { MailboxPage(records: since == nil ? [input] : [], deleted: [], token: Data([1]), moreComing: false) }
    func save(_ record: MailboxRecord) async throws { if failingWrites { throw MobileProtocolError.malformed }; saved.append(record) }
    func rejectWrites(_ value: Bool) { failingWrites = value }
    func delete(_ ids: [UUID]) async throws { deletionOutputCounts.append(saved.count) }
    func outputs() -> [MailboxRecord] { saved }
}
private struct ReconcileGateway: MacMobileGateway {
    let phone: P256.Signing.PrivateKey
    let wrongDigest: Bool
    var failureStatus: Int? = nil
    var notices: [MobileRevocation] = []
    var hasDevice = true
    var expiredAck = false
    func revocations(after: Int64) async throws -> [MobileRevocation] { notices.filter { $0.sequence > after } }
    func devices() async throws -> [PairedMobileDevice] { hasDevice ? [PairedMobileDevice(id: "phone", name: "Phone", kind: "phone", publicKey: MobileCodec.encodeBase64url(phone.publicKey.x963Representation))] : [] }
    func snapshot(deviceId: String) async throws -> Data {
        Data(#"{"version":1,"installationId":"mac","deviceId":"phone","sequence":1,"observedAt":1500,"rooms":[],"runs":[],"offers":[],"usage":{"inputTokens":0,"outputTokens":0,"cacheTokens":0,"records":0,"costUsd":null},"truncated":false}"#.utf8)
    }
    func submit(_ envelope: SignedEnvelope) async throws -> Data {
        if let failureStatus { throw MobileGatewayError(status: failureStatus) }
        let digest = wrongDigest ? String(repeating: "0", count: 64) : SHA256.hash(data: Data(envelope.payload.utf8)).map { String(format: "%02x", $0) }.joined()
        return Data(#"{"version":1,"installationId":"mac","deviceId":"phone","commandId":"cmd_1","payloadDigest":"DIGEST","state":"STATE","reason":"snapshot-requested","at":2500}"#.replacingOccurrences(of: "DIGEST", with: digest).replacingOccurrences(of: "STATE", with: expiredAck ? "expired" : "applied").utf8)
    }
}

@Test func expiredCommandAcknowledgmentIsPublishedBeforeRecordCleanup() async throws {
    let phone = P256.Signing.PrivateKey(), mac = P256.Signing.PrivateKey()
    let command = try MobileSigning.sign(payload: #"{"version":1,"installationId":"mac","deviceId":"phone","commandId":"cmd_1","issuedAt":1000,"expiresAt":2000,"action":{"kind":"refresh"}}"#, key: phone)
    let backend = ReconcileMailbox(MailboxRecord(id: UUID(), expiresAt: Date(timeIntervalSince1970: 2), payload: try MobileCodec.transportBytes(command)))
    let mailbox = CloudMailbox(backend: backend)
    await mailbox.setEnabled(true)
    let reconciler = MacMailboxReconciler(mailbox: mailbox, gateway: ReconcileGateway(phone: phone, wrongDigest: false, expiredAck: true), installationId: "mac", signingKey: mac)
    try await reconciler.reconcile(now: 2500)
    let first = try #require(await backend.outputs().first)
    let envelope = try MobileCodec.decode(first.payload)
    #expect(try MobileCodec.ack(Data(envelope.payload.utf8)).state == "expired")
    #expect(await backend.deletionOutputCounts == [1])
}

@Test func revocationPublicationRetriesFromAuthoritativeHistoryBeforeCleanup() async throws {
    let mac = P256.Signing.PrivateKey(), phone = P256.Signing.PrivateKey()
    let backend = ReconcileMailbox(MailboxRecord(id: UUID(), expiresAt: Date(timeIntervalSince1970: 1), payload: Data([0])))
    let mailbox = CloudMailbox(backend: backend)
    await mailbox.setEnabled(true)
    let gateway = ReconcileGateway(phone: phone, wrongDigest: false, notices: [MobileRevocation(deviceId: "phone", at: 1000, sequence: 3)], hasDevice: false)
    let reconciler = MacMailboxReconciler(mailbox: mailbox, gateway: gateway, installationId: "mac", signingKey: mac)
    await backend.rejectWrites(true)
    await #expect(throws: (any Error).self) { try await reconciler.reconcile(now: 3000) }
    await backend.rejectWrites(false)
    try await reconciler.reconcile(now: 4000)
    let output = try #require(await backend.outputs().first)
    let envelope = try MobileCodec.decode(output.payload)
    #expect(try MobileSigning.verify(envelope, publicKey: mac.publicKey.x963Representation))
    let notice = try MobileCodec.revocation(Data(envelope.payload.utf8))
    #expect(notice.revokedAt == 1000)
    #expect(notice.issuedAt == 4000)
    #expect(notice.deviceId == "phone")
    try await reconciler.reconcile(now: 5000)
    #expect(await backend.outputs().count == 1)
    let nextDay: Int64 = 4000 + 25 * 60 * 60 * 1000
    try await reconciler.reconcile(now: nextDay)
    let renewed = try #require(await backend.outputs().last)
    let renewedEnvelope = try MobileCodec.decode(renewed.payload)
    let renewedNotice = try MobileCodec.revocation(Data(renewedEnvelope.payload.utf8))
    #expect(renewedNotice.expiresAt > nextDay)
    #expect(renewedNotice.revokedAt == 1000)
}

@Test func reconcilerProducesVerifiableMacAckAndNeverSignsMismatchedGatewayResponse() async throws {
    let phone = P256.Signing.PrivateKey(), mac = P256.Signing.PrivateKey()
    let command = try MobileSigning.sign(payload: #"{"version":1,"installationId":"mac","deviceId":"phone","commandId":"cmd_1","issuedAt":1000,"expiresAt":2000,"action":{"kind":"refresh"}}"#, key: phone)
    let record = MailboxRecord(id: UUID(), expiresAt: Date(timeIntervalSince1970: 2), payload: try JSONEncoder().encode(command))
    let backend = ReconcileMailbox(record), mailbox = CloudMailbox(backend: backend)
    await mailbox.setEnabled(true)
    let reconciler = MacMailboxReconciler(mailbox: mailbox, gateway: ReconcileGateway(phone: phone, wrongDigest: false), installationId: "mac", signingKey: mac)
    try await reconciler.reconcile(now: 1500)
    var state = MobileSyncState(account: "A", installationId: "mac", deviceId: "phone", macPublicKey: mac.publicKey.x963Representation, devicePublicKey: phone.publicKey.x963Representation)
    try state.enqueue(command, now: 1000)
    let outputs = await backend.outputs()
    #expect(outputs.count == 2)
    let ack = try MobileCodec.decode(outputs[0].payload)
    #expect(try state.acceptAck(ack, account: "A"))
    #expect(state.status("cmd_1") == .applied)
    #expect(try state.acceptSnapshot(MobileCodec.decodeSnapshotEnvelope(outputs[1].payload), account: "A"))
    let badBackend = ReconcileMailbox(record), badMailbox = CloudMailbox(backend: badBackend)
    await badMailbox.setEnabled(true)
    let bad = MacMailboxReconciler(mailbox: badMailbox, gateway: ReconcileGateway(phone: phone, wrongDigest: true), installationId: "mac", signingKey: mac)
    await #expect(throws: (any Error).self) { try await bad.reconcile(now: 1500) }
    #expect(await badBackend.outputs().isEmpty)
    #expect(try await badMailbox.fetchChanges().records.count == 1)
    let unavailable = MacMailboxReconciler(mailbox: badMailbox, gateway: ReconcileGateway(phone: phone, wrongDigest: false, failureStatus: 409), installationId: "mac", signingKey: mac)
    await #expect(throws: (any Error).self) { try await unavailable.reconcile(now: 1500) }
    #expect(await badBackend.outputs().isEmpty)
    #expect(try await badMailbox.fetchChanges().records.count == 1)
}
