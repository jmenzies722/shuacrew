import Foundation

public struct VoiceAudioState: Sendable {
    public private(set) var generation: UInt64 = 0
    public private(set) var active = false
    public init() {}
    @discardableResult public mutating func start() -> UInt64 {
        generation += 1
        active = true
        return generation
    }
    public mutating func end() { active = false }
    public func accepts(_ generation: UInt64) -> Bool { active && generation == self.generation }
}

public struct VoiceAudioCommand {
    public enum Action: String { case start, cancelStart, mute, end, finish, play, stopPlayback }
    public let action: Action
    public let requestId: String
    public let sessionId: String
    public let generation: UInt64?
    public let pcm: Data?
    public let sampleRate: Double?
    public let silence: Double
    public enum Invalid: Error { case origin, message }

    public static func decode(_ body: [String: Any], mainFrame: Bool, origin: URL, expected: URL) throws -> Self {
        guard mainFrame, origin.scheme == "http", origin.scheme == expected.scheme,
              origin.host == expected.host, ["127.0.0.1", "localhost", "::1"].contains(origin.host ?? ""),
              (origin.port ?? 80) == (expected.port ?? 80) else { throw Invalid.origin }
        guard Set(body.keys).isSubset(of: ["type", "action", "requestId", "sessionId", "generation", "pcm", "sampleRate", "endpoint"]),
              let raw = body["action"] as? String, let action = Action(rawValue: raw),
              let request = body["requestId"] as? String, validID(request),
              let session = body["sessionId"] as? String, validID(session) else { throw Invalid.message }
        var generation: UInt64?
        if action != .start && action != .cancelStart {
            guard let number = body["generation"] as? NSNumber,
                  CFGetTypeID(number) != CFBooleanGetTypeID(),
                  number.doubleValue >= 1, number.doubleValue <= 9_007_199_254_740_991,
                  number.doubleValue.rounded() == number.doubleValue else { throw Invalid.message }
            generation = number.uint64Value
        }
        var pcm: Data?, rate: Double?
        if action == .play {
            guard let encoded = body["pcm"] as? String, encoded.utf8.count <= 8 * 1024 * 1024,
                  let hz = body["sampleRate"] as? Double, hz.isFinite, (8_000...48_000).contains(hz),
                  let bytes = Data(base64Encoded: encoded), !bytes.isEmpty, bytes.count % 2 == 0,
                  Double(bytes.count / 2) / hz <= 20 else { throw Invalid.message }
            pcm = bytes; rate = hz
        } else if body["pcm"] != nil || body["sampleRate"] != nil { throw Invalid.message }
        let endpoint = body["endpoint"] as? String ?? "balanced"
        guard ["quick", "balanced", "patient"].contains(endpoint) else { throw Invalid.message }
        return Self(action: action, requestId: request, sessionId: session, generation: generation, pcm: pcm, sampleRate: rate, silence: endpoint == "quick" ? 0.45 : endpoint == "patient" ? 1.1 : 0.75)
    }
    private static func validID(_ value: String) -> Bool {
        !value.isEmpty && value.utf8.count <= 128 && value.unicodeScalars.allSatisfy { CharacterSet.alphanumerics.contains($0) || $0 == "-" || $0 == "_" }
    }
}
