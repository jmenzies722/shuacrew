import Foundation

public struct LocalVoice: Codable, Equatable, Sendable {
    public let id: String
    public let name: String
    public let language: String
    public let gender: String
    public let quality: Int

    public init(id: String, name: String, language: String, gender: String, quality: Int) {
        self.id = id; self.name = name; self.language = language; self.gender = gender; self.quality = quality
    }
}

public struct VoicePreferences: Codable, Equatable, Sendable {
    public var voiceID = ""
    public var speed = 1.0
    private static let key = "voicePreferences.v1"
    public init() {}

    public static func read(from defaults: UserDefaults = .standard) -> Self {
        guard let data = defaults.data(forKey: key), let value = try? JSONDecoder().decode(Self.self, from: data),
              value.speed.isFinite, (0.7...1.3).contains(value.speed) else { return Self() }
        return value
    }

    public func save(to defaults: UserDefaults = .standard) throws {
        guard speed.isFinite, (0.7...1.3).contains(speed) else {
            throw NSError(domain: "ShuaCrew", code: 1, userInfo: [NSLocalizedDescriptionKey: "Choose a speaking speed between 0.7× and 1.3×."])
        }
        defaults.set(try JSONEncoder().encode(self), forKey: Self.key)
    }

    public func resolvedVoice(in voices: [LocalVoice]) -> LocalVoice? {
        if let selected = voices.first(where: { $0.id == voiceID }) { return selected }
        return voices.sorted { a, b in
            func rank(_ v: LocalVoice) -> Int {
                (v.language.hasPrefix("en") ? 1000 : 0) + (v.gender == "male" ? 100 : 0)
                + v.quality * 10 + (v.name == "Daniel" ? 1 : 0)
            }
            return rank(a) == rank(b) ? a.id < b.id : rank(a) > rank(b)
        }.first
    }
}
