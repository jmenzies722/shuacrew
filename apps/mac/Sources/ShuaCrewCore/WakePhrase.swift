import Foundation

/// What counts as "Hey Spark": a greeting followed by the companion's name, including how speech recognition tends to
/// mishear it ("hey shoe a" for Shua). Anything else — "they sparkle", "spark plug" — doesn't wake it.
public enum WakePhrase {
    static let greetings: Set<String> = ["hey", "hi", "ok", "okay", "yo"]
    static let alike: [String: [String]] = ["shua": ["shua", "shoe", "shoah", "shuah", "shoa", "joshua"], "spark": ["spark", "sparky", "sparks"]]

    public static func matches(_ text: String, names: [String]) -> Bool {
        let words = text.lowercased().replacingOccurrences(of: "[^a-z ]", with: " ", options: .regularExpression).split(separator: " ").map(String.init)
        guard words.count >= 2 else { return false }
        for i in 0..<(words.count - 1) where greetings.contains(words[i]) {
            for name in names where (alike[name.lowercased()] ?? [name.lowercased()]).contains(words[i + 1]) { return true }
        }
        return false
    }
}
