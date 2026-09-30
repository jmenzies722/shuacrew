import Foundation

/// Which paired Bluetooth device someone means: "my AirPods" → "Shua Airpods", "my headset" → "Yealink WH64".
/// The name itself first (ItemMatch: filler dropped, every word asked for must appear); failing that, the kind of
/// device they said ("headphones", "mouse") against names that look like that kind. Several fits → ask, never guess.
public enum BluetoothMatch {
    static let kinds: [(words: Set<String>, looks: [String])] = [
        (["headphones", "headphone", "earbuds", "earphones", "buds", "headset", "earpods"], ["airpods", "buds", "beats", "headphone", "headset", "wh", "wf", "bose", "sony", "jabra", "yealink", "powerbeats"]),
        (["mouse", "trackpad"], ["mouse", "mx", "trackpad", "master", "anywhere"]),
        (["keyboard"], ["keyboard", "keys", "mx keys"]),
        (["speaker", "speakers"], ["speaker", "homepod", "soundlink", "jbl", "sonos"]),
    ]

    public static func pick(_ query: String, names: [String]) -> ItemMatch.Pick {
        let direct = ItemMatch.pick(query, titles: names)
        if direct != .none { return direct }
        let asked = Set(ItemMatch.words(query))
        guard let kind = kinds.first(where: { !$0.words.isDisjoint(with: asked) }) else { return .none }
        let hits = names.indices.filter { i in
            let n = names[i].lowercased()
            return kind.looks.contains { look in n.range(of: "\\b\(NSRegularExpression.escapedPattern(for: look))", options: .regularExpression) != nil }
        }
        return hits.count == 1 ? .one(hits[0]) : hits.isEmpty ? .none : .several(hits)
    }
}
