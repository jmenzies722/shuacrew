import Foundation
import CryptoKit
public enum MobileSigning {
    public static func bytes(_ payload: String) -> Data { Data(("ShuaCrew/mobile/v1\n" + payload).utf8) }
    public static func sign(payload: String, key: P256.Signing.PrivateKey) throws -> SignedEnvelope {
        guard !payload.isEmpty, payload.utf8.count <= 16384 else { throw MobileProtocolError.tooLarge }
        return SignedEnvelope(payload: payload, signature: MobileCodec.encodeBase64url(try key.signature(for: bytes(payload)).rawRepresentation))
    }
    public static func verify(_ envelope: SignedEnvelope, publicKey: Data) throws -> Bool {
        guard envelope.payload.utf8.count <= 16384, publicKey.count == 65, publicKey.first == 4 else { return false }
        let key = try P256.Signing.PublicKey(x963Representation: publicKey)
        let signature = try P256.Signing.ECDSASignature(rawRepresentation: MobileCodec.base64url(envelope.signature))
        return key.isValidSignature(signature, for: bytes(envelope.payload))
    }
    public static func signSnapshot(payload: String, key: P256.Signing.PrivateKey) throws -> SignedEnvelope {
        guard !payload.isEmpty, payload.utf8.count <= 524288 else { throw MobileProtocolError.tooLarge }
        return SignedEnvelope(payload: payload, signature: MobileCodec.encodeBase64url(try key.signature(for: bytes(payload)).rawRepresentation))
    }
    public static func verifySnapshot(_ envelope: SignedEnvelope, publicKey: Data) throws -> Bool {
        guard !envelope.payload.isEmpty, envelope.payload.utf8.count <= 524288, publicKey.count == 65, publicKey.first == 4 else { return false }
        let key = try P256.Signing.PublicKey(x963Representation: publicKey)
        let signature = try P256.Signing.ECDSASignature(rawRepresentation: MobileCodec.base64url(envelope.signature))
        return key.isValidSignature(signature, for: bytes(envelope.payload))
    }
}
