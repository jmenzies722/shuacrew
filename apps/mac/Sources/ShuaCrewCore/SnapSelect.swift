import CoreGraphics
import Foundation

/// From rough to exact: which real things (a paragraph, a button, an image, a table cell) someone means when they
/// point, click or circle. Candidates come from the app itself (accessibility, or the web page's own elements);
/// this only chooses among them, so the boxes drawn match the real edges, not the hand-drawn loop.
public enum SnapSelect {
    public struct Item: Equatable {
        public let rect: CGRect, name: String
        public init(rect: CGRect, name: String) { self.rect = rect; self.name = name }
    }

    /// The smallest real thing under the point (tiny slivers and whole-screen containers don't count).
    public static func at(_ p: CGPoint, among items: [Item], screen: CGRect) -> Item? {
        items.filter { $0.rect.contains(p) && usable($0.rect, screen: screen) }
            .min { $0.rect.width * $0.rect.height < $1.rect.width * $1.rect.height }
    }

    /// Everything mostly inside the drawn area (70% of it or more), keeping the outermost — circling a paragraph
    /// gives the paragraph, not each link in it — largest first, at most `limit`.
    public static func within(_ area: CGRect, among items: [Item], screen: CGRect, limit: Int = 8) -> [Item] {
        let inside = items.filter { i in
            guard usable(i.rect, screen: screen) else { return false }
            let overlap = i.rect.intersection(area)
            return !overlap.isNull && overlap.width * overlap.height >= 0.7 * i.rect.width * i.rect.height
        }
        let outer = inside.filter { i in !inside.contains { o in o != i && o.rect.contains(i.rect) && o.rect != i.rect } }
        var seen = Set<String>(), out: [Item] = []
        for i in outer.sorted(by: { $0.rect.width * $0.rect.height > $1.rect.width * $1.rect.height }) {
            let key = "\(Int(i.rect.minX)),\(Int(i.rect.minY)),\(Int(i.rect.width)),\(Int(i.rect.height))"
            if seen.insert(key).inserted { out.append(i) }
            if out.count == limit { break }
        }
        return out
    }

    static func usable(_ r: CGRect, screen: CGRect) -> Bool {
        r.width >= 6 && r.height >= 6 && r.width * r.height <= 0.6 * screen.width * screen.height
    }
}
