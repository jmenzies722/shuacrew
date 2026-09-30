import Foundation

/// Which reminder, event or note someone means by name ("delete my dentist appointment"): an exact title wins, then
/// titles containing every word asked for; a day, if given, narrows it. Several left means ask which one, never guess:
/// these picks decide what gets deleted.
public enum ItemMatch {
    public enum Pick: Equatable { case one(Int), several([Int]), none }

    public static func pick(_ query: String, titles: [String], dates: [Date?] = [], on day: Date? = nil, calendar: Calendar = .current) -> Pick {
        let want = words(query)
        guard !want.isEmpty else { return .none }
        var indices = Array(titles.indices)
        if let day { indices = indices.filter { i in i < dates.count && dates[i].map { calendar.isDate($0, inSameDayAs: day) } == true } }
        let exact = indices.filter { words(titles[$0]) == want }
        if exact.count == 1 { return .one(exact[0]) }
        if exact.count > 1 { return .several(exact) }
        let containing = indices.filter { Set(words(titles[$0])).isSuperset(of: want) }
        switch containing.count {
        case 0: return .none
        case 1: return .one(containing[0])
        default: return .several(containing)
        }
    }

    /// Lowercase words, punctuation and filler dropped: "My Dentist appointment!" → ["dentist", "appointment"].
    static func words(_ s: String) -> [String] {
        let filler: Set<String> = ["my", "the", "a", "an", "reminder", "event", "note", "called", "named", "for"]
        return s.lowercased().replacingOccurrences(of: "'", with: "").replacingOccurrences(of: "’", with: "")
            .components(separatedBy: CharacterSet.alphanumerics.inverted).filter { !$0.isEmpty && !filler.contains($0) }
    }

    /// Several at once ("clear these", "delete everything in Desk Work", "delete all my reminders"), after ONE yes.
    /// `all` takes every item (in `list`, if named). Otherwise each name takes its exact title — every copy, since you
    /// named it — or the one title containing it; a name that fits several different titles is left alone and
    /// reported, like a name that fits none.
    public struct Many: Equatable { public var picked: [Int]; public var missing: [String]; public var unclear: [String] }
    public static func pickMany(_ queries: [String], titles: [String], lists: [String] = [], all: Bool = false, list: String? = nil) -> Many {
        let inList = { (i: Int) -> Bool in guard let list, !list.isEmpty else { return true }; return i < lists.count && lists[i].lowercased() == list.lowercased() }
        if all { return Many(picked: titles.indices.filter(inList), missing: [], unclear: []) }
        var picked: [Int] = [], missing: [String] = [], unclear: [String] = []
        for q in queries {
            let want = words(q)
            guard !want.isEmpty else { continue }
            let pool = titles.indices.filter(inList)
            let exact = pool.filter { words(titles[$0]) == want }
            if !exact.isEmpty { picked += exact; continue }
            let containing = pool.filter { Set(words(titles[$0])).isSuperset(of: want) }
            if containing.count == 1 { picked += containing }
            else if containing.isEmpty { missing.append(q) }
            else if Set(containing.map { words(titles[$0]) }).count == 1 { picked += containing } // copies of one title
            else { unclear.append(q) }
        }
        var seen = Set<Int>()
        return Many(picked: picked.filter { seen.insert($0).inserted }, missing: missing, unclear: unclear)
    }
}
