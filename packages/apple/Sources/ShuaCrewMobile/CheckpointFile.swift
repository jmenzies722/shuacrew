import Foundation
import CryptoKit

/// Device-local encrypted checkpoint. Serialize callers through the owning sync actor.
/// The key must live separately in device-only Keychain storage, never beside this file.
public struct MobileCheckpointFile: Sendable {
    public let url: URL
    public init(url: URL) { self.url = url }
    public static func forPairing(directory: URL, mac: MacPairingIdentity, deviceId: String) throws -> MobileCheckpointFile {
        // A Mac reinstall/key change is a new pairing, even on the same iCloud account.
        // Keep old encrypted checkpoints separate rather than importing or deleting their work.
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        let identity = try encoder.encode(["ShuaCrew/checkpoint-path/v1", mac.installationId, mac.publicKey, deviceId])
        let digest = SHA256.hash(data: identity).map { String(format: "%02x", $0) }.joined()
        return MobileCheckpointFile(url: directory.appending(path: "checkpoint-" + digest))
    }

    public func save(_ state: MobileSyncState, key: SymmetricKey) throws {
        let sealed = try state.checkpoint(key: key)
        try sealed.write(to: url, options: [.atomic, .completeFileProtection])
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }

    @discardableResult
    public func restore(into state: inout MobileSyncState, key: SymmetricKey, now: Int64) throws -> Bool {
        let attributes: [FileAttributeKey: Any]
        do { attributes = try FileManager.default.attributesOfItem(atPath: url.path) }
        catch let error as CocoaError where error.code == .fileReadNoSuchFile { return false }
        guard attributes[.type] as? FileAttributeType == .typeRegular,
              let size = attributes[.size] as? NSNumber, size.intValue <= 8 * 1024 * 1024 + 28 else { throw MobileProtocolError.tooLarge }
        try state.restoreCheckpoint(Data(contentsOf: url), key: key, now: now)
        return true
    }
}
