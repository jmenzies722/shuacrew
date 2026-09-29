import Foundation
import Testing
@testable import ShuaCrewMobile

@Test func bridgeProvisioningIsPrivateStableAndRotatesWithInstallation() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
    defer { try? FileManager.default.removeItem(at: directory) }
    let file = NativeBridgeFile(url: directory.appendingPathComponent("bridge.json"))
    let id = UUID().uuidString.lowercased()
    let first = try file.loadOrCreate(installationId: id)
    #expect(first.credential.count == 64)
    #expect(try file.loadOrCreate(installationId: id).credential == first.credential)
    let next = try file.loadOrCreate(installationId: UUID().uuidString.lowercased())
    #expect(next.credential != first.credential)
    let attrs = try FileManager.default.attributesOfItem(atPath: directory.appendingPathComponent("bridge.json").path)
    #expect((attrs[.posixPermissions] as? NSNumber)?.intValue == 0o600)
    try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: directory.path)
    #expect(throws: (any Error).self) { try file.loadOrCreate(installationId: id) }
}
