import Foundation
import Testing
import CryptoKit
@testable import ShuaCrewMobile

@Test func duplicateKeysAndBounds() throws {
    for text in [#"{"a":1,"a":2}"#, #"{"a":1,"\u0061":2}"#, #"{"nested":{"x":1,"x":2}}"#] {
        #expect(throws: (any Error).self) { try MobileCodec.strictJSON(Data(text.utf8)) }
    }
    #expect(throws: (any Error).self) { try MobileCodec.strictJSON(Data(String(repeating: "[", count: 40).utf8)) }
    #expect(throws: (any Error).self) { try MobileCodec.decode(Data(String(repeating: "x", count: 32769).utf8)) }
}

@Test func signaturesBindExactBytes() throws {
    let key = P256.Signing.PrivateKey(), payload = #"{"version":1}"#
    let envelope = try MobileSigning.sign(payload: payload, key: key)
    #expect(try MobileSigning.verify(envelope, publicKey: key.publicKey.x963Representation))
    #expect(try !MobileSigning.verify(SignedEnvelope(payload: payload + " ", signature: envelope.signature), publicKey: key.publicKey.x963Representation))
    #expect(try !MobileSigning.verify(envelope, publicKey: P256.Signing.PrivateKey().publicKey.x963Representation))
}

@Test func strictCommandValidation() throws {
    let command = #"{"version":1,"installationId":"mac_1","deviceId":"phone_1","commandId":"cmd_1","issuedAt":1000,"expiresAt":2000,"action":{"kind":"refresh"}}"#
    #expect(try MobileCodec.command(Data(command.utf8)).commandId == "cmd_1")
    #expect(throws: (any Error).self) { try MobileCodec.command(Data(command.replacingOccurrences(of: "cmd_1", with: "cmd_1\\n").utf8)) }
    for bad in [command.replacingOccurrences(of: "\"version\":1", with: "\"version\":true"), command.replacingOccurrences(of: "\"refresh\"", with: "\"shell\""), command.replacingOccurrences(of: "2000", with: "999"), command.replacingOccurrences(of: "\"kind\":\"refresh\"", with: "\"kind\":\"refresh\",\"always\":true")] {
        #expect(throws: (any Error).self) { try MobileCodec.command(Data(bad.utf8)) }
    }
}

@Test func nodeSignatureVector() throws {
    let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    let data = try Data(contentsOf: root.appendingPathComponent("fixtures/mobile/envelopes.json"))
    let fixture = try JSONDecoder().decode(SignatureFixture.self, from: data)
    let envelope = try MobileCodec.decode(JSONEncoder().encode(fixture.envelope))
    #expect(try MobileSigning.verify(envelope, publicKey: MobileCodec.base64url(fixture.publicKey)))
}
private struct SignatureFixture: Decodable { let envelope: SignedEnvelope; let publicKey: String }

@Test func snapshotAndAcknowledgmentValidation() throws {
    let snapshot = #"{"version":1,"installationId":"mac_1","deviceId":"phone_1","sequence":7,"observedAt":1000,"rooms":[],"runs":[],"offers":[],"usage":{"inputTokens":12,"outputTokens":3,"cacheTokens":0,"records":1,"costUsd":null},"truncated":false}"#
    let decoded = try MobileCodec.snapshot(Data(snapshot.utf8))
    #expect(decoded.sequence == 7)
    #expect(decoded.usage.costUsd == nil)
    for bad in [snapshot.replacingOccurrences(of: "\"sequence\":7", with: "\"sequence\":true"), snapshot.replacingOccurrences(of: "\"costUsd\":null", with: "\"costUsd\":-1"), snapshot.replacingOccurrences(of: "\"truncated\":false", with: "\"truncated\":false,\"rawLog\":[]")] {
        #expect(throws: (any Error).self) { try MobileCodec.snapshot(Data(bad.utf8)) }
    }
    let ack = #"{"version":1,"installationId":"mac_1","deviceId":"phone_1","commandId":"cmd_1","payloadDigest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","state":"uncertain","reason":"inspect-on-mac","at":1000}"#
    #expect(try MobileCodec.ack(Data(ack.utf8)).state == "uncertain")
    #expect(throws: (any Error).self) { try MobileCodec.ack(Data(ack.replacingOccurrences(of: "uncertain", with: "delivered").utf8)) }
}

@Test func largeSnapshotsDoNotExpandCommandLimits() throws {
    let key = P256.Signing.PrivateKey(), payload = String(repeating: "x", count: 20000)
    #expect(throws: (any Error).self) { try MobileSigning.sign(payload: payload, key: key) }
    let envelope = try MobileSigning.signSnapshot(payload: payload, key: key)
    #expect(try MobileSigning.verifySnapshot(envelope, publicKey: key.publicKey.x963Representation))
    #expect(try !MobileSigning.verify(envelope, publicKey: key.publicKey.x963Representation))
    #expect(throws: (any Error).self) { try MobileCodec.decode(JSONEncoder().encode(envelope)) }
    #expect(try MobileCodec.decodeSnapshotEnvelope(JSONEncoder().encode(envelope)).payload == payload)
    #expect(throws: (any Error).self) { try MobileSigning.signSnapshot(payload: String(repeating: "x", count: 524289), key: key) }
}
