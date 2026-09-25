import Foundation
import CryptoKit
import Testing
@testable import ShuaCrewMobile

@Test func checkpointFilePersistsEncryptedStateAcrossStoreInstances() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let url = directory.appendingPathComponent("state.sealed")
    let key = SymmetricKey(size: .bits256), mac = P256.Signing.PrivateKey(), phone = P256.Signing.PrivateKey()
    var state = MobileSyncState(account: "A", installationId: "mac", deviceId: "phone", macPublicKey: mac.publicKey.x963Representation, devicePublicKey: phone.publicKey.x963Representation)
    let payload = #"{"version":1,"installationId":"mac","deviceId":"phone","commandId":"cmd_1","issuedAt":1000,"expiresAt":2000,"action":{"kind":"refresh"}}"#
    try state.enqueue(MobileSigning.sign(payload: payload, key: phone), now: 1000)
    try MobileCheckpointFile(url: url).save(state, key: key)
    var restored = MobileSyncState(account: "A", installationId: "mac", deviceId: "phone", macPublicKey: mac.publicKey.x963Representation, devicePublicKey: phone.publicKey.x963Representation)
    #expect(try MobileCheckpointFile(url: url).restore(into: &restored, key: key, now: 1500))
    #expect(restored.status("cmd_1") == .sending)
    #expect(restored.pending.first?.payload == payload)
    let permissions = try FileManager.default.attributesOfItem(atPath: url.path)[.posixPermissions] as? NSNumber
    #expect(permissions?.intValue == 0o600)
    // A missing checkpoint is different from unreadable/corrupt data, which must fail closed.
    #expect(try !MobileCheckpointFile(url: directory.appendingPathComponent("missing")).restore(into: &restored, key: key, now: 1500))
    try Data("corrupt".utf8).write(to: url)
    #expect(throws: (any Error).self) { try MobileCheckpointFile(url: url).restore(into: &restored, key: key, now: 1500) }
    #expect(restored.pending.count == 1)
}

@Test func encryptedCheckpointRestoresOriginalBytesAndDeliveryState() throws {
    let mac = P256.Signing.PrivateKey(), phone = P256.Signing.PrivateKey()
    let key = SymmetricKey(size: .bits256)
    var state = MobileSyncState(account: "A", installationId: "mac", deviceId: "phone", macPublicKey: mac.publicKey.x963Representation, devicePublicKey: phone.publicKey.x963Representation)
    let payload = #"{"version":1,"installationId":"mac","deviceId":"phone","commandId":"cmd_1","issuedAt":1000,"expiresAt":2000,"action":{"kind":"refresh"}}"#
    let envelope = try MobileSigning.sign(payload: payload, key: phone)
    try state.enqueue(envelope, now: 1000)
    state.markDelivered("cmd_1")
    let bytes = try state.checkpoint(key: key)
    #expect(!String(decoding: bytes, as: UTF8.self).contains("cmd_1"))
    var restored = MobileSyncState(account: "A", installationId: "mac", deviceId: "phone", macPublicKey: mac.publicKey.x963Representation, devicePublicKey: phone.publicKey.x963Representation)
    try restored.restoreCheckpoint(bytes, key: key, now: 1500)
    #expect(restored.status("cmd_1") == .waitingForMac)
    #expect(restored.pending.first?.payload == envelope.payload)
    #expect(restored.pending.first?.signature == envelope.signature)
    try restored.restoreCheckpoint(bytes, key: key, now: 2000)
    #expect(restored.status("cmd_1") == .expired)
    #expect(restored.pending.isEmpty)
}

@Test func checkpointRejectsTamperingWrongKeyAndAccountWithoutChangingState() throws {
    let mac = P256.Signing.PrivateKey(), phone = P256.Signing.PrivateKey()
    let key = SymmetricKey(size: .bits256)
    let original = MobileSyncState(account: "A", installationId: "mac", deviceId: "phone", macPublicKey: mac.publicKey.x963Representation, devicePublicKey: phone.publicKey.x963Representation)
    let bytes = try original.checkpoint(key: key)
    var other = MobileSyncState(account: "B", installationId: "mac", deviceId: "phone", macPublicKey: mac.publicKey.x963Representation, devicePublicKey: phone.publicKey.x963Representation)
    #expect(throws: (any Error).self) { try other.restoreCheckpoint(bytes, key: key, now: 1500) }
    #expect(other.account == "B")
    var same = original
    #expect(throws: (any Error).self) { try same.restoreCheckpoint(bytes, key: SymmetricKey(size: .bits256), now: 1500) }
    var changed = bytes; changed[changed.startIndex] ^= 1
    #expect(throws: (any Error).self) { try same.restoreCheckpoint(changed, key: key, now: 1500) }
    same.changeAccount(to: nil)
    #expect(throws: (any Error).self) { try same.restoreCheckpoint(bytes, key: key, now: 1500) }
    #expect(same.pending.isEmpty)
}
@Test func changedMacPairingUsesAFreshCheckpointNamespace() throws {
    let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false)
    defer { try? FileManager.default.removeItem(at: directory) }
    let firstMac = P256.Signing.PrivateKey(), secondMac = P256.Signing.PrivateKey(), phone = P256.Signing.PrivateKey()
    let first = MacPairingIdentity(installationId: "mac-one", publicKey: MobileCodec.encodeBase64url(firstMac.publicKey.x963Representation))
    let second = MacPairingIdentity(installationId: "mac-two", publicKey: MobileCodec.encodeBase64url(secondMac.publicKey.x963Representation))
    let fileA = try MobileCheckpointFile.forPairing(directory: directory, mac: first, deviceId: "phone")
    let fileB = try MobileCheckpointFile.forPairing(directory: directory, mac: second, deviceId: "phone")
    #expect(fileA.url != fileB.url)
    #expect(try fileA.url == MobileCheckpointFile.forPairing(directory: directory, mac: first, deviceId: "phone").url)
    let key = SymmetricKey(size: .bits256)
    let old = MobileSyncState(account: "A", installationId: "mac-one", deviceId: "phone", macPublicKey: firstMac.publicKey.x963Representation, devicePublicKey: phone.publicKey.x963Representation)
    try fileA.save(old, key: key)
    var fresh = MobileSyncState(account: "A", installationId: "mac-two", deviceId: "phone", macPublicKey: secondMac.publicKey.x963Representation, devicePublicKey: phone.publicKey.x963Representation)
    #expect(throws: (any Error).self) { try fileA.restore(into: &fresh, key: key, now: 1000) }
    #expect(try !fileB.restore(into: &fresh, key: key, now: 1000))
    #expect(fresh.pending.isEmpty)
}
