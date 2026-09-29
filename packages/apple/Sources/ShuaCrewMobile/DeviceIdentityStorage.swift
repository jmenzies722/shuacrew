import Foundation
import Security

/// The OS boundary is replaceable in tests so tests never access a person's Keychain.
public protocol MobileKeychainClient {
    func copy(_ query: [String: Any]) -> (OSStatus, Data?)
    func add(_ attributes: [String: Any]) -> OSStatus
}
public struct SystemMobileKeychainClient: MobileKeychainClient {
    public init() {}
    public func copy(_ query: [String: Any]) -> (OSStatus, Data?) {
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        return (status, result as? Data)
    }
    public func add(_ attributes: [String: Any]) -> OSStatus { SecItemAdd(attributes as CFDictionary, nil) }
}
public struct MobileKeychainError: Error { public let status: OSStatus }

/// Native adapter: an app-owned marker plus non-synchronizing, device-only Keychain secrets.
/// The caller creates its private Application Support directory only after explicit opt-in.
public struct DeviceMobileIdentityStorage: MobileIdentityStorage {
    private let markerURL: URL
    private let keychain: any MobileKeychainClient
    public init(markerURL: URL, keychain: any MobileKeychainClient = SystemMobileKeychainClient()) {
        self.markerURL = markerURL; self.keychain = keychain
    }
    public func readGeneration() throws -> UUID? {
        let attributes: [FileAttributeKey: Any]
        do { attributes = try FileManager.default.attributesOfItem(atPath: markerURL.path) }
        catch let error as CocoaError where error.code == .fileReadNoSuchFile { return nil }
        guard attributes[.type] as? FileAttributeType == .typeRegular,
              (attributes[.size] as? NSNumber)?.intValue == 36 else { throw MobileProtocolError.malformed }
        let data = try Data(contentsOf: markerURL)
        guard let text = String(data: data, encoding: .utf8), let id = UUID(uuidString: text),
              text == id.uuidString.lowercased() else { throw MobileProtocolError.malformed }
        return id
    }
    public func writeGeneration(_ value: UUID) throws {
        try Data(value.uuidString.lowercased().utf8).write(to: markerURL, options: [.atomic, .completeFileProtection])
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: markerURL.path)
    }
    private func query(_ generation: UUID) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecUseDataProtectionKeychain as String: true,
         kSecAttrService as String: "dev.shuacrew.mobile.identity.v1",
         kSecAttrAccount as String: generation.uuidString.lowercased(),
         kSecAttrSynchronizable as String: false]
    }
    public func readSecret(_ generation: UUID) throws -> Data? {
        var request = query(generation)
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        let (status, data) = keychain.copy(request)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data else { throw MobileKeychainError(status: status) }
        return data
    }
    public func writeSecret(_ data: Data, generation: UUID) throws {
        var attributes = query(generation)
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let status = keychain.add(attributes)
        // Never upsert: duplicate identity storage must not rotate an already-paired key.
        guard status == errSecSuccess else { throw MobileKeychainError(status: status) }
    }
}
