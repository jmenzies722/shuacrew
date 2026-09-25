import Foundation
import CryptoKit
import Darwin

public struct NativeBridgeConfiguration: Codable, Sendable {
    public let version: Int
    public let installationId, credential: String
}
/// Local, never cloud-synced. Parent directory must be private before any bytes are written.
public struct NativeBridgeFile {
    public let url: URL
    public init(url: URL) { self.url = url }
    public func loadOrCreate(installationId: String) throws -> NativeBridgeConfiguration {
        guard UUID(uuidString: installationId) != nil else { throw MobileProtocolError.malformed }
        let directory = url.deletingLastPathComponent()
        let parent = try FileManager.default.attributesOfItem(atPath: directory.path)
        guard parent[.type] as? FileAttributeType == .typeDirectory,
              let mode = parent[.posixPermissions] as? NSNumber, mode.intValue & 0o077 == 0,
              (parent[.ownerAccountID] as? NSNumber)?.uint32Value == geteuid() else { throw MobileProtocolError.malformed }
        do {
            let attrs = try FileManager.default.attributesOfItem(atPath: url.path)
            guard attrs[.type] as? FileAttributeType == .typeRegular,
                  let fileMode = attrs[.posixPermissions] as? NSNumber, fileMode.intValue & 0o077 == 0,
                  (attrs[.ownerAccountID] as? NSNumber)?.uint32Value == geteuid(),
                  let size = attrs[.size] as? NSNumber, size.intValue <= 2048 else { throw MobileProtocolError.malformed }
            let data = try Data(contentsOf: url)
            guard let body = try MobileCodec.strictJSON(data, limit: 2048) as? [String: Any] else { throw MobileProtocolError.malformed }
            try MobileCodec.keys(body, ["version", "installationId", "credential"])
            let existing = try JSONDecoder().decode(NativeBridgeConfiguration.self, from: data)
            guard existing.version == 1, UUID(uuidString: existing.installationId) != nil,
                  existing.credential.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else { throw MobileProtocolError.malformed }
            if existing.installationId == installationId { return existing }
        } catch let error as CocoaError where error.code == .fileReadNoSuchFile { /* first setup */ }
        let key = SymmetricKey(size: .bits256)
        let credential = key.withUnsafeBytes { $0.map { String(format: "%02x", $0) }.joined() }
        let value = NativeBridgeConfiguration(version: 1, installationId: installationId, credential: credential)
        let temporary = directory.appendingPathComponent(".bridge-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: temporary) }
        try JSONEncoder().encode(value).write(to: temporary, options: [.atomic, .completeFileProtection])
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: temporary.path)
        guard rename(temporary.path, url.path) == 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
        return value
    }
}
