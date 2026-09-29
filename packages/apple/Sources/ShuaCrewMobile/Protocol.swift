import Foundation

public struct SignedEnvelope: Codable, Sendable {
    public let payload: String
    public let signature: String
    public init(payload: String, signature: String) { self.payload = payload; self.signature = signature }
}
public enum MobileProtocolError: Error { case malformed, tooLarge, duplicateKey, tooDeep }
public enum MobileCodec {
    /// Stable outer transport bytes across process restarts. Never reserializes the signed payload.
    public static func transportBytes(_ envelope: SignedEnvelope) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        return try encoder.encode(envelope)
    }
    public static func base64url(_ string: String) throws -> Data {
        guard !string.isEmpty, string.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-" || $0 == "_") }) else { throw MobileProtocolError.malformed }
        let padded = string.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/") + String(repeating: "=", count: (4 - string.count % 4) % 4)
        guard let data = Data(base64Encoded: padded), encodeBase64url(data) == string else { throw MobileProtocolError.malformed }
        return data
    }
    public static func encodeBase64url(_ data: Data) -> String { data.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "") }
    public static func decode(_ data: Data) throws -> SignedEnvelope {
        guard let object = try strictJSON(data, limit: 32768) as? [String: Any], Set(object.keys) == ["payload", "signature"], let payload = object["payload"] as? String, let signature = object["signature"] as? String, !payload.isEmpty, payload.utf8.count <= 16384, try base64url(signature).count == 64 else { throw MobileProtocolError.malformed }
        return SignedEnvelope(payload: payload, signature: signature)
    }
    public static func decodeSnapshotEnvelope(_ data: Data) throws -> SignedEnvelope {
        guard let object = try strictJSON(data, limit: 2 * 524288 + 1024) as? [String: Any], Set(object.keys) == ["payload", "signature"], let payload = object["payload"] as? String, let signature = object["signature"] as? String, !payload.isEmpty, payload.utf8.count <= 524288, try base64url(signature).count == 64 else { throw MobileProtocolError.malformed }
        return SignedEnvelope(payload: payload, signature: signature)
    }
    public static func strictJSON(_ data: Data, limit: Int = 16384) throws -> Any {
        guard data.count <= limit else { throw MobileProtocolError.tooLarge }
        var scanner = JSONScanner(bytes: Array(data)); try scanner.value(depth: 0); scanner.space()
        guard scanner.index == data.count else { throw MobileProtocolError.malformed }
        return try JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
    }
}

private struct JSONScanner {
    let bytes: [UInt8]; var index = 0
    var current: UInt8? { index < bytes.count ? bytes[index] : nil }
    mutating func space() { while let c = current, [9,10,13,32].contains(c) { index += 1 } }
    mutating func string() throws -> String {
        let start = index; index += 1
        while let c = current {
            index += 1
            if c == 92 { index += 1; continue }
            if c == 34 { return try JSONDecoder().decode(String.self, from: Data(bytes[start..<index])) }
        }
        throw MobileProtocolError.malformed
    }
    mutating func value(depth: Int) throws {
        guard depth <= 32 else { throw MobileProtocolError.tooDeep }; space()
        guard let c = current else { throw MobileProtocolError.malformed }
        if c == 34 { _ = try string(); return }
        if c == 123 || c == 91 {
            let object = c == 123, end: UInt8 = object ? 125 : 93; index += 1; space()
            if current == end { index += 1; return }
            var keys = Set<String>()
            while true {
                space()
                if object {
                    guard current == 34 else { throw MobileProtocolError.malformed }
                    let key = try string(); guard keys.insert(key).inserted else { throw MobileProtocolError.duplicateKey }
                    space(); guard current == 58 else { throw MobileProtocolError.malformed }; index += 1
                }
                try value(depth: depth + 1); space()
                if current == end { index += 1; return }
                guard current == 44 else { throw MobileProtocolError.malformed }; index += 1
            }
        }
        let start = index
        while let c = current, ![9,10,13,32,44,93,125].contains(c) { index += 1 }
        guard index > start else { throw MobileProtocolError.malformed }
        _ = try JSONSerialization.jsonObject(with: Data(bytes[start..<index]), options: [.fragmentsAllowed])
    }
}
