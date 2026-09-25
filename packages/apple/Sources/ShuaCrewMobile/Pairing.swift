import Foundation
import CryptoKit

public struct MacPairingIdentity: Codable, Sendable, Equatable {
    public let installationId, publicKey: String
    public init(installationId: String, publicKey: String) { self.installationId = installationId; self.publicKey = publicKey }
}
public struct VerifiedMobilePairing: Sendable {
    public let device: PairedMobileDevice
    public let fingerprint: String
    public let expiresAt: Int64
}
public enum MobilePairing {
    public static func fingerprint(_ envelope: SignedEnvelope) -> String {
        let digest = SHA256.hash(data: Data(("ShuaCrew/pairing/v1\n" + envelope.payload).utf8)).map { String(format: "%02X", $0) }.joined()
        return stride(from: 0, to: 64, by: 8).map { start in String(digest.dropFirst(start).prefix(8)) }.joined(separator: " ")
    }
    public static func create(mac: MacPairingIdentity, deviceId: String, name: String, kind: String, key: P256.Signing.PrivateKey, now: Int64) throws -> SignedEnvelope {
        guard now >= 0, now <= 9007199254740991 - 300000 else { throw MobileProtocolError.malformed }
        let body: [String: Any] = ["version": 1, "purpose": "pairing", "installationId": mac.installationId,
            "macPublicKey": mac.publicKey, "deviceId": deviceId, "name": name, "kind": kind,
            "publicKey": MobileCodec.encodeBase64url(key.publicKey.x963Representation), "nonce": UUID().uuidString.lowercased(),
            "issuedAt": now, "expiresAt": now + 300000]
        let payload = try JSONSerialization.data(withJSONObject: body, options: [.sortedKeys, .withoutEscapingSlashes])
        let envelope = try MobileSigning.sign(payload: String(decoding: payload, as: UTF8.self), key: key)
        _ = try inspect(envelope, mac: mac, now: now)
        return envelope
    }
    /// A self-signed request is only a proposal. The Mac must show this fingerprint and
    /// require explicit local confirmation against the device; this function grants nothing.
    public static func inspect(_ envelope: SignedEnvelope, mac: MacPairingIdentity, now: Int64) throws -> VerifiedMobilePairing {
        guard let body = try MobileCodec.strictJSON(Data(envelope.payload.utf8)) as? [String: Any] else { throw MobileProtocolError.malformed }
        try MobileCodec.keys(body, ["version", "purpose", "installationId", "macPublicKey", "deviceId", "name", "kind", "publicKey", "nonce", "issuedAt", "expiresAt"])
        try MobileCodec.identity(body); try MobileCodec.identifier(body, "nonce"); try MobileCodec.text(body, "name", max: 80)
        let issued = try MobileCodec.integer(body, "issuedAt"), expires = try MobileCodec.integer(body, "expiresAt")
        guard body["purpose"] as? String == "pairing", body["installationId"] as? String == mac.installationId,
              body["macPublicKey"] as? String == mac.publicKey, issued <= now, expires > now,
              expires > issued, expires - issued <= 300000,
              let publicKey = body["publicKey"] as? String, let deviceId = body["deviceId"] as? String,
              let name = body["name"] as? String, let kind = body["kind"] as? String, ["phone", "watch"].contains(kind) else { throw MobileProtocolError.malformed }
        let macKey = try MobileCodec.base64url(mac.publicKey)
        guard macKey.count == 65, macKey.first == 4 else { throw MobileProtocolError.malformed }
        _ = try P256.Signing.PublicKey(x963Representation: macKey)
        guard try MobileSigning.verify(envelope, publicKey: MobileCodec.base64url(publicKey)) else { throw MobileProtocolError.malformed }
        return VerifiedMobilePairing(device: PairedMobileDevice(id: deviceId, name: name, kind: kind, publicKey: publicKey), fingerprint: fingerprint(envelope), expiresAt: expires)
    }
}
