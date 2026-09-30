import CoreGraphics
import Foundation

/// How Spark's cursor buddy moves: it trails your pointer like it's attached by a short spring, and when it points at
/// something it swoops there along a gentle arc and comes back. Pure maths, so the feel is tested, not eyeballed.
public enum CursorMotion {
    /// Where the buddy sits relative to the pointer (AppKit coordinates, y up): just below and to the right of the tip,
    /// flipped to the other side near a screen edge so it never hides off-screen.
    public static func anchor(cursor: CGPoint, visible: CGRect, size: CGSize = CGSize(width: 22, height: 22), gap: CGSize = CGSize(width: 14, height: 18)) -> CGPoint {
        var x = cursor.x + gap.width + size.width / 2, y = cursor.y - gap.height - size.height / 2
        if x + size.width / 2 > visible.maxX { x = cursor.x - gap.width - size.width / 2 }
        if y - size.height / 2 < visible.minY { y = cursor.y + gap.height + size.height / 2 }
        return CGPoint(x: x, y: y)
    }

    /// One frame of following, independent of frame rate: `response` is how long it takes to close ~63% of the gap
    /// (0.07 s feels attached but alive). Two 120 Hz frames land exactly where one 60 Hz frame does.
    public static func follow(current: CGPoint, target: CGPoint, dt: Double, response: Double = 0.07) -> CGPoint {
        let a = CGFloat(1 - exp(-max(0, dt) / max(0.001, response)))
        return CGPoint(x: current.x + (target.x - current.x) * a, y: current.y + (target.y - current.y) * a)
    }

    /// A swoop to a target: longer trips take a little longer (0.45–0.95 s), and the arc bows up by a fifth of the
    /// distance (at most 90 pt), like a hand moving a mouse.
    public struct Flight: Equatable {
        public let from: CGPoint, to: CGPoint, control: CGPoint, duration: Double
        public init(from: CGPoint, to: CGPoint) {
            self.from = from; self.to = to
            let d = hypot(to.x - from.x, to.y - from.y)
            duration = min(0.95, max(0.45, Double(d) / 1100))
            let lift = min(90, d * 0.2)
            control = CGPoint(x: (from.x + to.x) / 2, y: max(from.y, to.y) + lift)
        }
        /// Position, heading (radians, direction of travel) and scale at `elapsed` seconds. Eased in and out
        /// (smoothstep); it grows to 1.3× mid-flight and lands at exactly `to`.
        public func at(_ elapsed: Double) -> (point: CGPoint, heading: CGFloat, scale: CGFloat, done: Bool) {
            let raw = min(1, max(0, elapsed / duration)), t = CGFloat(raw * raw * (3 - 2 * raw)), u = 1 - t
            let p = CGPoint(x: u * u * from.x + 2 * u * t * control.x + t * t * to.x, y: u * u * from.y + 2 * u * t * control.y + t * t * to.y)
            let tx = 2 * u * (control.x - from.x) + 2 * t * (to.x - control.x), ty = 2 * u * (control.y - from.y) + 2 * t * (to.y - control.y)
            return (raw >= 1 ? to : p, atan2(ty, tx), 1 + 0.3 * CGFloat(sin(Double.pi * raw)), raw >= 1)
        }
    }

    /// The pen's timeline for drawing several marks: fly to where each mark starts, then trace it (the line appears
    /// under the tip), then on to the next. Times are seconds from the start. Short hops and small marks are quick; a
    /// long flight or a big circle takes a little longer — never sluggish.
    public struct PenStep: Equatable {
        public let flyAt: Double, fly: Double, traceAt: Double, trace: Double
        public init(flyAt: Double, fly: Double, traceAt: Double, trace: Double) { self.flyAt = flyAt; self.fly = fly; self.traceAt = traceAt; self.trace = trace }
    }
    public static func penPlan(from: CGPoint?, strokes: [(start: CGPoint, length: CGFloat)]) -> [PenStep] {
        var t = 0.0, at = from
        return strokes.map { s in
            let d = at.map { Double(hypot(s.start.x - $0.x, s.start.y - $0.y)) } ?? 0
            let fly = d < 8 ? 0 : min(0.7, max(0.28, d / 1400)), trace = min(0.95, max(0.4, Double(s.length) / 900))
            let step = PenStep(flyAt: t, fly: fly, traceAt: t + fly, trace: trace)
            t += fly + trace + 0.08; at = s.start
            return step
        }
    }

    /// A path as a polyline (curves subdivided), so a point can be found at any fraction of its length — the same
    /// fraction a drawn line's strokeEnd uses, which keeps the pen exactly at the tip of the growing line.
    public static func flatten(_ path: CGPath, steps: Int = 12) -> [CGPoint] {
        var out: [CGPoint] = [], last = CGPoint.zero
        path.applyWithBlock { e in
            let p = e.pointee.points
            switch e.pointee.type {
            case .moveToPoint: last = p[0]; out.append(p[0])
            case .addLineToPoint: last = p[0]; out.append(p[0])
            case .addQuadCurveToPoint:
                for i in 1...steps { let t = CGFloat(i) / CGFloat(steps), u = 1 - t; out.append(CGPoint(x: u * u * last.x + 2 * u * t * p[0].x + t * t * p[1].x, y: u * u * last.y + 2 * u * t * p[0].y + t * t * p[1].y)) }
                last = p[1]
            case .addCurveToPoint:
                for i in 1...steps { let t = CGFloat(i) / CGFloat(steps), u = 1 - t
                    out.append(CGPoint(x: u*u*u*last.x + 3*u*u*t*p[0].x + 3*u*t*t*p[1].x + t*t*t*p[2].x, y: u*u*u*last.y + 3*u*u*t*p[0].y + 3*u*t*t*p[1].y + t*t*t*p[2].y)) }
                last = p[2]
            case .closeSubpath: if let first = out.first { out.append(first) }
            @unknown default: break
            }
        }
        return out
    }

    /// Where the pen is during a drawing tour: flying (an arc, eased, swelling 1.3× mid-air) to where each mark
    /// begins, then moving along it at an even pace — the fraction of its length the line has drawn so far.
    public struct PenTour {
        struct Leg { let from: CGPoint, control: CGPoint, begin: CGPoint, points: [CGPoint], cumulative: [CGFloat], step: PenStep }
        let legs: [Leg], origin: CGPoint
        public let duration: Double
        public var end: CGPoint { legs.last.map { $0.points.last ?? $0.begin } ?? origin }

        public init(from: CGPoint, strokes: [[CGPoint]], plan: [PenStep]) {
            origin = from
            var at = from, built: [Leg] = []
            for (pts, step) in zip(strokes, plan) where !pts.isEmpty {
                var cum: [CGFloat] = [0]
                for (a, b) in zip(pts, pts.dropFirst()) { cum.append(cum.last! + hypot(b.x - a.x, b.y - a.y)) }
                let d = hypot(pts[0].x - at.x, pts[0].y - at.y)
                built.append(Leg(from: at, control: CGPoint(x: (at.x + pts[0].x) / 2, y: max(at.y, pts[0].y) + min(90, d * 0.2)), begin: pts[0], points: pts, cumulative: cum, step: step))
                at = pts.last!
            }
            legs = built
            duration = built.last.map { $0.step.traceAt + $0.step.trace } ?? 0
        }

        public func at(_ t: Double) -> (point: CGPoint, scale: CGFloat, done: Bool) {
            var here = origin
            for leg in legs {
                let s = leg.step
                if t < s.flyAt { return (here, 1, false) }
                if s.fly > 0, t < s.flyAt + s.fly {
                    let raw = (t - s.flyAt) / s.fly, e = CGFloat(raw * raw * (3 - 2 * raw)), u = 1 - e
                    let p = CGPoint(x: u * u * leg.from.x + 2 * u * e * leg.control.x + e * e * leg.begin.x, y: u * u * leg.from.y + 2 * u * e * leg.control.y + e * e * leg.begin.y)
                    return (p, 1 + 0.3 * CGFloat(sin(Double.pi * raw)), false)
                }
                if t < s.traceAt + s.trace {
                    return (Self.sample(leg, fraction: max(0, (t - s.traceAt) / max(0.001, s.trace))), 1, false)
                }
                here = leg.points.last ?? leg.begin
            }
            return (here, 1, true)
        }

        static func sample(_ leg: Leg, fraction: Double) -> CGPoint {
            guard let total = leg.cumulative.last, total > 0 else { return leg.begin }
            let want = CGFloat(fraction) * total
            guard let i = leg.cumulative.firstIndex(where: { $0 >= want }), i > 0 else { return leg.points[0] }
            let a = leg.points[i - 1], b = leg.points[i], span = leg.cumulative[i] - leg.cumulative[i - 1]
            let f = span > 0 ? (want - leg.cumulative[i - 1]) / span : 0
            return CGPoint(x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f)
        }
    }
}
