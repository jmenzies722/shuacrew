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
        let halfW = min(size.width / 2, visible.width / 2), halfH = min(size.height / 2, visible.height / 2)
        return CGPoint(x: min(visible.maxX - halfW, max(visible.minX + halfW, x)),
                       y: min(visible.maxY - halfH, max(visible.minY + halfH, y)))
    }

    /// Fit a caption beside its target, including offset displays and targets in the menu bar or dock.
    public static func captionFrame(near point: CGPoint, size: CGSize, visible: CGRect) -> CGRect {
        let safe = visible.insetBy(dx: min(8, visible.width / 4), dy: min(8, visible.height / 4))
        let width = min(max(0, size.width), safe.width), height = min(max(0, size.height), safe.height)
        var x = point.x + 22, y = point.y + 22
        if x + width > safe.maxX { x = point.x - 22 - width }
        if y + height > safe.maxY { y = point.y - 22 - height }
        return CGRect(x: min(safe.maxX - width, max(safe.minX, x)),
                      y: min(safe.maxY - height, max(safe.minY, y)), width: width, height: height)
    }

    /// The waveform the buddy becomes while you talk: bar heights (points) for your live mic level (0–1) at time `t`.
    /// The middle bars reach highest, each bar ripples at its own pace so it reads as a voice rather than a meter, and
    /// silence leaves a small, calm ripple — still listening, never a flat line.
    public static func waveBars(level: Double, t: Double, count: Int = 5, minHeight: CGFloat = 4, maxHeight: CGFloat = 26) -> [CGFloat] {
        let lv = min(1, max(0, level)), mid = Double(count - 1) / 2
        return (0..<count).map { i in
            let d = mid == 0 ? 0 : abs(Double(i) - mid) / mid          // 0 at the centre, 1 at the edges
            let envelope = 1 - 0.45 * d * d
            let ripple = 0.72 + 0.28 * sin(t * (7.3 + 1.9 * Double(i)) + Double(i) * 1.7)
            let idle = 0.12 * (0.5 + 0.5 * sin(t * 2.4 + Double(i) * 0.9))
            let k = min(1, idle + pow(lv, 0.7) * envelope * ripple)  // pow: quiet speech still moves the bars
            return minHeight + (maxHeight - minHeight) * CGFloat(k)
        }
    }

    /// One frame of following, independent of frame rate: `response` is how long it takes to close ~63% of the gap
    /// (0.07 s feels attached but alive). Two 120 Hz frames land exactly where one 60 Hz frame does.
    public static func follow(current: CGPoint, target: CGPoint, dt: Double, response: Double = 0.07) -> CGPoint {
        let a = CGFloat(1 - exp(-max(0, dt) / max(0.001, response)))
        return CGPoint(x: current.x + (target.x - current.x) * a, y: current.y + (target.y - current.y) * a)
    }

    /// One frame of turning the arrow toward `target` (radians), independent of frame rate like `follow`: `response`
    /// is how long it takes to close ~63% of the gap. It always turns the short way round (from 170° to −170° is a
    /// 20° turn, not 340°), so the arrow never spins a full lap when its heading crosses ±π.
    public static func turn(current: CGFloat, target: CGFloat, dt: Double, response: Double = 0.08) -> CGFloat {
        let gap = target - current, short = atan2(sin(gap), cos(gap)) // the same gap, wrapped into −π…π
        let a = CGFloat(1 - exp(-max(0, dt) / max(0.001, response)))
        return current + short * a
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
