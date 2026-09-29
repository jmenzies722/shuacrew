import Foundation
import Security
import Testing
@testable import ShuaCrewMobile

private final class KeychainMemory: MobileKeychainClient {
    var values: [String: Data] = [:]
    func copy(_ query: [String: Any]) -> (OSStatus, Data?) {
        guard query[kSecClass as String] as? String == kSecClassGenericPassword as String,
              query[kSecUseDataProtectionKeychain as String] as? Bool == true,
              query[kSecAttrSynchronizable as String] as? Bool == false,
              let service = query[kSecAttrService as String] as? String,
              let account = query[kSecAttrAccount as String] as? String else { return (errSecParam, nil) }
        guard let data = values[service + account] else { return (errSecItemNotFound, nil) }
        return (errSecSuccess, data)
    }
    func add(_ attributes: [String: Any]) -> OSStatus {
        guard attributes[kSecAttrAccessible as String] as? String == kSecAttrAccessibleWhenUnlockedThisDeviceOnly as String,
              attributes[kSecUseDataProtectionKeychain as String] as? Bool == true,
              attributes[kSecAttrSynchronizable as String] as? Bool == false,
              let service = attributes[kSecAttrService as String] as? String,
              let account = attributes[kSecAttrAccount as String] as? String,
              let data = attributes[kSecValueData as String] as? Data else { return errSecParam }
        guard values[service + account] == nil else { return errSecDuplicateItem }
        values[service + account] = data; return errSecSuccess
    }
}

@Test func nativeIdentityAdapterUsesDeviceOnlySecretsAndStrictLocalMarker() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let marker = directory.appendingPathComponent("installation")
    let keychain = KeychainMemory()
    let storage = DeviceMobileIdentityStorage(markerURL: marker, keychain: keychain)
    let identity = try MobileKeyStore(storage: storage).loadOrCreate()
    let next = try MobileKeyStore(storage: DeviceMobileIdentityStorage(markerURL: marker, keychain: keychain)).loadOrCreate()
    #expect(identity.generation == next.generation)
    #expect(identity.signingKey.rawRepresentation == next.signingKey.rawRepresentation)
    #expect(String(data: try Data(contentsOf: marker), encoding: .utf8) == identity.generation.uuidString.lowercased())
    #expect(throws: (any Error).self) { try storage.writeSecret(Data([0]), generation: identity.generation) }
    try Data("invalid marker".utf8).write(to: marker)
    #expect(throws: (any Error).self) { try MobileKeyStore(storage: storage).loadOrCreate() }
}

private final class IdentityMemory: MobileIdentityStorage {
    var marker: UUID?
    var secrets: [UUID: Data] = [:]
    var rejectMarkerWrite = false
    func readGeneration() throws -> UUID? { marker }
    func writeGeneration(_ value: UUID) throws {
        if rejectMarkerWrite { throw MobileProtocolError.malformed }
        marker = value
    }
    func readSecret(_ generation: UUID) throws -> Data? { secrets[generation] }
    func writeSecret(_ data: Data, generation: UUID) throws { secrets[generation] = data }
}

@Test func identitySurvivesRelaunchButNotMissingInstallationMarker() throws {
    let storage = IdentityMemory()
    let first = try MobileKeyStore(storage: storage).loadOrCreate()
    let relaunched = try MobileKeyStore(storage: storage).loadOrCreate()
    #expect(first.generation == relaunched.generation)
    #expect(first.signingKey.publicKey.x963Representation == relaunched.signingKey.publicKey.x963Representation)
    // Model reinstall: Keychain survives, app-owned marker does not.
    storage.marker = nil
    let reinstalled = try MobileKeyStore(storage: storage).loadOrCreate()
    #expect(reinstalled.generation != first.generation)
    #expect(reinstalled.signingKey.publicKey.x963Representation != first.signingKey.publicKey.x963Representation)
    #expect(first.checkpointKey.withUnsafeBytes { Data($0) } != reinstalled.checkpointKey.withUnsafeBytes { Data($0) })
    let rotated = try MobileKeyStore(storage: storage).loadOrCreate(forceNew: true)
    #expect(rotated.generation != reinstalled.generation)
    #expect(try MobileKeyStore(storage: storage).loadOrCreate().generation == rotated.generation)
}

@Test func missingOrDamagedIdentityFailsInsteadOfSilentlyReplacingPairedKey() throws {
    let storage = IdentityMemory()
    let first = try MobileKeyStore(storage: storage).loadOrCreate()
    storage.secrets[first.generation] = nil
    #expect(throws: (any Error).self) { try MobileKeyStore(storage: storage).loadOrCreate() }
    #expect(storage.marker == first.generation)
    storage.secrets[first.generation] = Data("broken".utf8)
    #expect(throws: (any Error).self) { try MobileKeyStore(storage: storage).loadOrCreate() }
    #expect(storage.marker == first.generation)
}

@Test func installationMarkerFailureNeverReturnsUsableIdentity() throws {
    let storage = IdentityMemory(); storage.rejectMarkerWrite = true
    #expect(throws: (any Error).self) { try MobileKeyStore(storage: storage).loadOrCreate() }
    #expect(storage.marker == nil)
    storage.rejectMarkerWrite = false
    let next = try MobileKeyStore(storage: storage).loadOrCreate()
    #expect(storage.marker == next.generation)
}
