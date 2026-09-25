import Foundation
import CryptoKit

/// Secrets and the app-local installation marker intentionally have separate lifetimes.
/// The native adapter must store secrets in device-only Keychain, never UserDefaults/iCloud.
public protocol MobileIdentityStorage {
    func readGeneration() throws -> UUID?
    func writeGeneration(_ value: UUID) throws
    func readSecret(_ generation: UUID) throws -> Data?
    func writeSecret(_ data: Data, generation: UUID) throws
}

public struct MobileIdentity {
    public let generation: UUID
    public let signingKey: P256.Signing.PrivateKey
    public let checkpointKey: SymmetricKey
}

/// Call only from a serialized, explicitly enabled native owner; initialization has no side effects.
public struct MobileKeyStore {
    private let storage: any MobileIdentityStorage
    public init(storage: any MobileIdentityStorage) { self.storage = storage }
    private struct Secret: Codable {
        let version: Int
        let generation: UUID
        let signingKey, checkpointKey: Data
    }
    public func loadOrCreate(forceNew: Bool = false) throws -> MobileIdentity {
        if !forceNew, let generation = try storage.readGeneration() {
            guard let bytes = try storage.readSecret(generation), bytes.count <= 1024 else { throw MobileProtocolError.malformed }
            let saved = try JSONDecoder().decode(Secret.self, from: bytes)
            guard saved.version == 1, saved.generation == generation, saved.signingKey.count == 32,
                  saved.checkpointKey.count == 32 else { throw MobileProtocolError.malformed }
            return MobileIdentity(generation: generation, signingKey: try P256.Signing.PrivateKey(rawRepresentation: saved.signingKey), checkpointKey: SymmetricKey(data: saved.checkpointKey))
        }
        // Never search Keychain for an older key when the installation marker is absent.
        let generation = UUID(), signingKey = P256.Signing.PrivateKey(), checkpointKey = SymmetricKey(size: .bits256)
        let saved = Secret(version: 1, generation: generation, signingKey: signingKey.rawRepresentation,
                           checkpointKey: checkpointKey.withUnsafeBytes { Data($0) })
        try storage.writeSecret(JSONEncoder().encode(saved), generation: generation)
        // A failed marker write leaves an unreachable secret, not a usable half-created identity.
        try storage.writeGeneration(generation)
        return MobileIdentity(generation: generation, signingKey: signingKey, checkpointKey: checkpointKey)
    }
}
