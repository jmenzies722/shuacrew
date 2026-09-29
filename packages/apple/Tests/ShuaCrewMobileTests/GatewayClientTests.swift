import Foundation
import Testing
@testable import ShuaCrewMobile

@Test func nativeGatewayCredentialCannotBeAttachedToRemoteOrAmbiguousURLs() throws {
    for raw in ["https://example.com", "http://localhost:7420", "http://127.0.0.1:7420/path", "http://user@127.0.0.1:7420", "http://127.0.0.1:7420?x=1"] {
        #expect(throws: (any Error).self) { try NativeMobileGateway(base: URL(string: raw)!, credential: String(repeating: "a", count: 64)) }
    }
    let gateway = try NativeMobileGateway(base: URL(string: "http://127.0.0.1:7420")!, credential: String(repeating: "a", count: 64))
    let read = try gateway.request(path: "config", method: "GET")
    #expect(read.url?.absoluteString == "http://127.0.0.1:7420/api/mobile/config")
    #expect(read.value(forHTTPHeaderField: "X-ShuaCrew-Mobile-Bridge") == String(repeating: "a", count: 64))
    #expect(read.value(forHTTPHeaderField: "X-ShuaCrew-Mobile-Local-Action") == nil)
    let write = try gateway.request(path: "config", method: "POST", body: Data("{}".utf8), localAction: true)
    #expect(write.value(forHTTPHeaderField: "X-ShuaCrew-Mobile-Local-Action") == "1")
    #expect(throws: (any Error).self) { try gateway.request(path: "../other", method: "GET") }
    #expect(throws: (any Error).self) { try gateway.request(path: "commands", method: "POST", body: Data(repeating: 0, count: 32769)) }
}
