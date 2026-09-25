import Foundation
import CryptoKit
import Testing
@testable import ShuaCrewMobile

@Test func pairingBindsBothKeysAndInstallationAndExpiresAtBoundary() throws {
    let mac = P256.Signing.PrivateKey(), phone = P256.Signing.PrivateKey()
    let bootstrap = MacPairingIdentity(installationId: "mac", publicKey: MobileCodec.encodeBase64url(mac.publicKey.x963Representation))
    let request = try MobilePairing.create(mac: bootstrap, deviceId: "phone", name: "My phone", kind: "phone", key: phone, now: 1000)
    let verified = try MobilePairing.inspect(request, mac: bootstrap, now: 1001)
    #expect(verified.device.id == "phone")
    #expect(verified.device.publicKey == MobileCodec.encodeBase64url(phone.publicKey.x963Representation))
    #expect(verified.fingerprint == MobilePairing.fingerprint(request))
    #expect(throws: (any Error).self) { try MobilePairing.inspect(request, mac: bootstrap, now: 301000) }
    #expect(throws: (any Error).self) { try MobilePairing.inspect(request, mac: MacPairingIdentity(installationId: "other", publicKey: bootstrap.publicKey), now: 1001) }
    let wrong = MacPairingIdentity(installationId: "mac", publicKey: MobileCodec.encodeBase64url(P256.Signing.PrivateKey().publicKey.x963Representation))
    #expect(throws: (any Error).self) { try MobilePairing.inspect(request, mac: wrong, now: 1001) }
    #expect(throws: (any Error).self) { try MobilePairing.inspect(SignedEnvelope(payload: request.payload + " ", signature: request.signature), mac: bootstrap, now: 1001) }
}

@Test func pairingCannotSmuggleAnAlwaysGrantOrUnsupportedDeviceKind() throws {
    let mac = P256.Signing.PrivateKey(), phone = P256.Signing.PrivateKey()
    let bootstrap = MacPairingIdentity(installationId: "mac", publicKey: MobileCodec.encodeBase64url(mac.publicKey.x963Representation))
    #expect(throws: (any Error).self) { try MobilePairing.create(mac: bootstrap, deviceId: "phone", name: "Phone", kind: "admin", key: phone, now: 1000) }
    let request = try MobilePairing.create(mac: bootstrap, deviceId: "phone", name: "Phone", kind: "watch", key: phone, now: 1000)
    var payload = try JSONSerialization.jsonObject(with: Data(request.payload.utf8)) as! [String: Any]
    payload["always"] = true
    let signed = try MobileSigning.sign(payload: String(decoding: JSONSerialization.data(withJSONObject: payload), as: UTF8.self), key: phone)
    #expect(throws: (any Error).self) { try MobilePairing.inspect(signed, mac: bootstrap, now: 1001) }
}
