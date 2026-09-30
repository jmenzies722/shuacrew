import CoreGraphics

/// Several displays: which one Spark looks at first, and how the others are described to it ("to the right").
/// Frames are AppKit global coordinates (y up), as NSScreen reports them. Pure, so the layout rules are tested.
public enum DisplayLayout {
    /// Where `other` sits relative to `main`, in words: "to the right", "above", "below and to the left"…
    public static func relation(of other: CGRect, to main: CGRect) -> String {
        let dx = other.midX - main.midX, dy = other.midY - main.midY
        let side = other.minX >= main.maxX - 1 ? "to the right" : other.maxX <= main.minX + 1 ? "to the left" : nil
        let level = other.minY >= main.maxY - 1 ? "above" : other.maxY <= main.minY + 1 ? "below" : nil
        switch (level, side) {
        case let (l?, s?): return "\(l) and \(s)"
        case let (l?, nil): return l
        case let (nil, s?): return s
        default: return abs(dx) >= abs(dy) ? (dx >= 0 ? "to the right" : "to the left") : (dy >= 0 ? "above" : "below") // overlapping (mirrored)
        }
    }

    /// The order Spark sees displays in: the one with your pointer first (that's where you're working), then the rest
    /// left to right. Returns indexes into `frames`.
    public static func order(frames: [CGRect], pointer: CGPoint, fallback: Int = 0) -> [Int] {
        guard !frames.isEmpty else { return [] }
        let first = frames.firstIndex { $0.contains(pointer) } ?? min(max(0, fallback), frames.count - 1)
        let rest = frames.indices.filter { $0 != first }.sorted { (frames[$0].minX, -frames[$0].maxY) < (frames[$1].minX, -frames[$1].maxY) }
        return [first] + rest
    }

    /// A side display's look for Spark: small enough to be cheap (it's context), big enough to read and point at.
    public static func sideSize(width: Int, height: Int, longest: Int = 1280) -> (width: Int, height: Int) {
        let long = max(width, height)
        guard long > longest, long > 0 else { return (width, height) }
        let k = Double(longest) / Double(long)
        return (Int((Double(width) * k).rounded()), Int((Double(height) * k).rounded()))
    }
}
