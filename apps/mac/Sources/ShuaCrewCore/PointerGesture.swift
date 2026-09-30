import CoreGraphics
import Foundation

/// What you drew with your cursor while holding fn to talk: circling something, underlining it, or scribbling over
/// an area — so "what's this?" means exactly what you marked. Holding still (or barely moving) is nothing.
public enum PointerGesture: Equatable {
    case none
    case circle(CGRect)
    case underline(CGRect)
    case scribble(CGRect)

    public var kind: String {
        switch self { case .none: "none"; case .circle: "circle"; case .underline: "underline"; case .scribble: "scribble" }
    }
    public var region: CGRect? {
        switch self { case .none: nil; case .circle(let r), .underline(let r), .scribble(let r): r }
    }

    public static func classify(_ points: [CGPoint]) -> PointerGesture {
        guard points.count >= 4 else { return .none }
        var length: CGFloat = 0
        for (a, b) in zip(points, points.dropFirst()) { length += hypot(b.x - a.x, b.y - a.y) }
        let xs = points.map(\.x), ys = points.map(\.y)
        let box = CGRect(x: xs.min()!, y: ys.min()!, width: xs.max()! - xs.min()!, height: ys.max()! - ys.min()!)
        let big = max(box.width, box.height), small = min(box.width, box.height)
        guard length >= 60, big >= 30 else { return .none } // pointing, not drawing
        // A loop anywhere in the stroke is a circle around what it encloses — even with the approach to it before
        // (fn goes down while the cursor is still on its way) or a flick after.
        if let loop = biggestLoop(points) { return .circle(loop) }
        let gap = hypot(points.last!.x - points.first!.x, points.last!.y - points.first!.y)
        // Mostly sideways and flat: an underline (a little wobble is fine).
        if box.height <= 30, box.width >= 50, box.width >= 3 * box.height { return .underline(box) }
        // Went round and came back near the start: a circle (loose ovals count).
        if small >= 20, length >= 2.2 * big, gap <= 0.45 * big { return .circle(box) }
        return .scribble(box)
    }

    /// The largest stretch that comes back to where it started (within 30 pt) after going round at least 150 pt and
    /// enclosing something at least 24 pt across: the bounds of that loop.
    static func biggestLoop(_ points: [CGPoint]) -> CGRect? {
        var cumulative: [CGFloat] = [0]
        for (a, b) in zip(points, points.dropFirst()) { cumulative.append(cumulative.last! + hypot(b.x - a.x, b.y - a.y)) }
        var best: CGRect?
        for j in points.indices {
            for i in 0..<j where cumulative[j] - cumulative[i] >= 150 {
                guard hypot(points[j].x - points[i].x, points[j].y - points[i].y) <= 30 else { continue }
                let seg = points[i...j], xs = seg.map(\.x), ys = seg.map(\.y)
                let r = CGRect(x: xs.min()!, y: ys.min()!, width: xs.max()! - xs.min()!, height: ys.max()! - ys.min()!)
                // It must actually go round: the pen's heading turns ~360° one way on a loop, while a zigzag turns
                // left-right-left and cancels out (it can pass near itself and even enclose area, so neither is enough).
                var turned: Double = 0, last: Double?
                for (a, b) in zip(seg, seg.dropFirst()) where hypot(b.x - a.x, b.y - a.y) > 0.5 {
                    let h = atan2(Double(b.y - a.y), Double(b.x - a.x))
                    if let l = last { var d = h - l; while d > .pi { d -= 2 * .pi }; while d < -.pi { d += 2 * .pi }; turned += d }
                    last = h
                }
                let encloses = abs(turned) >= 1.5 * .pi
                if encloses, min(r.width, r.height) >= 24, r.width * r.height > (best.map { $0.width * $0.height } ?? 0) { best = r }
                break // the earliest start for this end is the widest loop through it
            }
        }
        return best
    }
}
