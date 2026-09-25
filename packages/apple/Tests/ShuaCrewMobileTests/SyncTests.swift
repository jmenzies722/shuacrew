import Foundation
import CryptoKit
import Testing
@testable import ShuaCrewMobile

@Test func terminalCommandHistoryIsBoundedWithoutDroppingPendingWork() throws {
    let key = P256.Signing.PrivateKey()
    var state = MobileSyncState(account: "A", installationId: "mac", deviceId: "phone", macPublicKey: key.publicKey.x963Representation, devicePublicKey: key.publicKey.x963Representation)
    for index in 0..<230 {
        let now = index * 2 + 1000
        let payload = "{\"version\":1,\"installationId\":\"mac\",\"deviceId\":\"phone\",\"commandId\":\"cmd_\(index)\",\"issuedAt\":\(now),\"expiresAt\":\(now + 1),\"action\":{\"kind\":\"refresh\"}}"
        try state.enqueue(MobileSigning.sign(payload: payload, key: key), now: Int64(now))
        state.expire(now: Int64(now + 1))
    }
    #expect(state.statuses.count == 200)
    #expect(state.status("cmd_229") == .expired)
    #expect(state.status("cmd_0") == nil)
}

private func snapshotEnvelope(_ key: P256.Signing.PrivateKey, sequence: Int = 1, at: Int = 1000, device: String = "phone") throws -> SignedEnvelope {
    let data = try JSONSerialization.data(withJSONObject: ["version": 1, "installationId": "mac", "deviceId": device, "sequence": sequence, "observedAt": at, "rooms": [], "runs": [], "offers": [], "usage": ["inputTokens": 0, "outputTokens": 0, "cacheTokens": 0, "records": 0, "costUsd": NSNull()], "truncated": false])
    return try MobileSigning.signSnapshot(payload: String(decoding: data, as: UTF8.self), key: key)
}
@Test func signedSnapshotsRejectWrongMacAudienceAndRollback() throws {
    let mac = P256.Signing.PrivateKey(), device = P256.Signing.PrivateKey()
    var state = MobileSyncState(account: "A", installationId: "mac", deviceId: "phone", macPublicKey: mac.publicKey.x963Representation, devicePublicKey: device.publicKey.x963Representation)
    #expect(try state.acceptSnapshot(snapshotEnvelope(mac, sequence: 2), account: "A"))
    #expect(try !state.acceptSnapshot(snapshotEnvelope(mac, sequence: 1, at: 2000), account: "A"))
    #expect(try !state.acceptSnapshot(snapshotEnvelope(mac, sequence: 3, device: "other"), account: "A"))
    #expect(try !state.acceptSnapshot(snapshotEnvelope(P256.Signing.PrivateKey(), sequence: 3), account: "A"))
    #expect(state.snapshot?.sequence == 2)
    #expect(!state.isStale(now: 60999))
    #expect(state.isStale(now: 61000))
    // A fresh signed observation can refresh unchanged source sequence.
    #expect(try state.acceptSnapshot(snapshotEnvelope(mac, sequence: 2, at: 5000), account: "A"))
    #expect(!state.isStale(now: 61000))
    state.changeAccount(to: "B")
    #expect(state.snapshot == nil)
    #expect(try !state.acceptSnapshot(snapshotEnvelope(mac, sequence: 3), account: "B"))
}
@Test func deliveryNeverMeansAppliedAndOnlyBoundMacAckSettlesCommand() throws {
    let mac = P256.Signing.PrivateKey(), device = P256.Signing.PrivateKey()
    var state = MobileSyncState(account: "A", installationId: "mac", deviceId: "phone", macPublicKey: mac.publicKey.x963Representation, devicePublicKey: device.publicKey.x963Representation)
    let payload = #"{"version":1,"installationId":"mac","deviceId":"phone","commandId":"cmd_1","issuedAt":1000,"expiresAt":2000,"action":{"kind":"refresh"}}"#
    let envelope = try MobileSigning.sign(payload: payload, key: device)
    try state.enqueue(envelope, now: 1000)
    try state.enqueue(envelope, now: 1001)
    #expect(state.pending.count == 1)
    state.markDelivered("cmd_1")
    #expect(state.status("cmd_1") == .waitingForMac)
    let digest = SHA256.hash(data: Data(payload.utf8)).map { String(format: "%02x", $0) }.joined()
    let ack = #"{"version":1,"installationId":"mac","deviceId":"phone","commandId":"cmd_1","payloadDigest":"DIGEST","state":"applied","reason":"snapshot-requested","at":1500}"#.replacingOccurrences(of: "DIGEST", with: digest)
    #expect(try !state.acceptAck(MobileSigning.sign(payload: ack, key: device), account: "A"))
    #expect(state.status("cmd_1") == .waitingForMac)
    #expect(try state.acceptAck(MobileSigning.sign(payload: ack, key: mac), account: "A"))
    #expect(state.status("cmd_1") == .applied)
    #expect(state.pending.isEmpty)
    let checkpointKey = SymmetricKey(size: .bits256)
    let checkpoint = try state.checkpoint(key: checkpointKey)
    var restarted = MobileSyncState(account: "A", installationId: "mac", deviceId: "phone", macPublicKey: mac.publicKey.x963Representation, devicePublicKey: device.publicKey.x963Representation)
    try restarted.restoreCheckpoint(checkpoint, key: checkpointKey, now: 1600)
    try restarted.enqueue(envelope, now: 1600)
    #expect(restarted.status("cmd_1") == .applied)
    #expect(restarted.pending.isEmpty)
    state.changeAccount(to: nil)
    #expect(state.status("cmd_1") == nil)
}
@Test func expirationNeverRequeuesACommandAndAccountChangeClearsQueuedBytes() throws {
    let mac = P256.Signing.PrivateKey(), device = P256.Signing.PrivateKey()
    var state = MobileSyncState(account: "A", installationId: "mac", deviceId: "phone", macPublicKey: mac.publicKey.x963Representation, devicePublicKey: device.publicKey.x963Representation)
    let payload = #"{"version":1,"installationId":"mac","deviceId":"phone","commandId":"cmd_1","issuedAt":1000,"expiresAt":2000,"action":{"kind":"refresh"}}"#
    let envelope = try MobileSigning.sign(payload: payload, key: device)
    try state.enqueue(envelope, now: 1000)
    state.expire(now: 2000)
    #expect(state.status("cmd_1") == .expired)
    #expect(state.pending.isEmpty)
    #expect(throws: (any Error).self) { try state.enqueue(envelope, now: 2000) }
    state.changeAccount(to: "B")
    #expect(state.pending.isEmpty)
    #expect(throws: (any Error).self) { try state.enqueue(envelope, now: 1000) }
}
