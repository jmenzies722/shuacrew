import Foundation
import CryptoKit
import Testing
@testable import ShuaCrewMobile

@Test func signedRevocationClearsStateAndSurvivesRelaunch() throws {
    let mac = P256.Signing.PrivateKey(), phone = P256.Signing.PrivateKey(), checkpointKey = SymmetricKey(size: .bits256)
    var state = MobileSyncState(account: "A", installationId: "mac", deviceId: "phone", macPublicKey: mac.publicKey.x963Representation, devicePublicKey: phone.publicKey.x963Representation)
    let command = try MobileSigning.sign(payload: #"{"version":1,"installationId":"mac","deviceId":"phone","commandId":"queued","issuedAt":1000,"expiresAt":9000,"action":{"kind":"refresh"}}"#, key: phone)
    try state.enqueue(command, now: 1000)
    let payload = #"{"version":1,"kind":"revoked","installationId":"mac","deviceId":"phone","revokedAt":1000,"issuedAt":1500,"expiresAt":9000}"#
    #expect(try !state.acceptRevocation(MobileSigning.sign(payload: payload, key: phone), account: "A", now: 1600))
    #expect(try !state.acceptRevocation(MobileSigning.sign(payload: payload.replacingOccurrences(of: "\"phone\"", with: "\"other\""), key: mac), account: "A", now: 1600))
    #expect(state.pending.count == 1)
    let signed = try MobileSigning.sign(payload: payload, key: mac)
    #expect(try !state.acceptRevocation(signed, account: "A", now: 9000))
    #expect(state.pending.count == 1)
    #expect(try state.acceptRevocation(signed, account: "A", now: 1600))
    #expect(state.isRevoked)
    #expect(state.pending.isEmpty)
    #expect(state.snapshot == nil)
    let sealed = try state.checkpoint(key: checkpointKey)
    var restored = MobileSyncState(account: "A", installationId: "mac", deviceId: "phone", macPublicKey: mac.publicKey.x963Representation, devicePublicKey: phone.publicKey.x963Representation)
    try restored.restoreCheckpoint(sealed, key: checkpointKey, now: 1600)
    #expect(restored.isRevoked)
    #expect(throws: (any Error).self) { try restored.enqueue(command, now: 1700) }
}
