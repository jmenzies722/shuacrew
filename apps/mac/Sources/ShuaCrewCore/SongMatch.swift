import Foundation

/// Picking the song someone meant from Apple's catalog search: "sleepy hollow aint nun" is "Ain't Nun" by Sleepy
/// Hallow, not "it ain't nuthin" by a band called sleepy hollow. Words match by sound (vowels and doubled letters
/// don't matter), and a result has to match the artist too if the ask named one.
public enum SongMatch {
    public struct Candidate: Equatable, Sendable {
        public let title: String, artist: String
        public init(title: String, artist: String) { self.title = title; self.artist = artist }
    }

    /// Lowercase words without punctuation: "Ain't Nun (feat. X)" → ["aint", "nun", "feat", "x"].
    public static func words(_ s: String) -> [String] {
        s.lowercased().replacingOccurrences(of: "'", with: "").replacingOccurrences(of: "’", with: "")
            .components(separatedBy: CharacterSet.alphanumerics.inverted).filter { !$0.isEmpty }
    }
    /// A sound-alike key: "hollow" and "hallow" agree, as do "nun" and "nunn".
    public static func sound(_ w: String) -> String {
        var out = "", last: Character? = nil
        for c in w.lowercased() where c.isLetter || c.isNumber {
            let k: Character = "aeiouy".contains(c) ? "a" : c
            if k != last { out.append(k) }
            last = k
        }
        return out
    }

    /// The title without "(feat. …)" or " - Remastered": what a library search should look for.
    public static func coreTitle(_ title: String) -> String {
        var t = title
        if let r = t.range(of: #"\s*[\(\[](feat|ft|with|from|remaster|live)[^\)\]]*[\)\]]"#, options: [.regularExpression, .caseInsensitive]) { t.removeSubrange(r) }
        if let r = t.range(of: #"\s+-\s+.*(remaster|version|edit|mix).*$"#, options: [.regularExpression, .caseInsensitive]) { t.removeSubrange(r) }
        return t.trimmingCharacters(in: .whitespaces)
    }

    /// The index of the best candidate, or nil when nothing shares enough with the ask. Ties keep the catalog's order.
    public static func best(for query: String, in candidates: [Candidate]) -> Int? {
        let asked = Set(words(query).filter { !["play", "the", "song", "by", "on", "apple", "music", "some"].contains($0) }.map(sound))
        guard !asked.isEmpty else { return nil }
        var top: (index: Int, score: Int)?
        for (i, c) in candidates.enumerated() {
            let title = Set(words(coreTitle(c.title)).map(sound)), artist = Set(words(c.artist).map(sound))
            let hitTitle = asked.intersection(title).count, hitArtist = asked.intersection(artist).count
            // Most of what was asked has to be there; naming the artist right counts extra.
            let score = (hitTitle + hitArtist) * 10 + (hitTitle > 0 && hitArtist > 0 ? 15 : 0) - title.subtracting(asked).count
            if hitTitle + hitArtist >= max(1, (asked.count + 1) / 2), score > (top?.score ?? Int.min) { top = (i, score) }
        }
        return top?.index
    }
}
