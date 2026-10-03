import CoreGraphics
import Testing
@testable import ShuaCrewCore

@Suite struct CursorMotionTests {
    @Test func followingIsTheSameAt60And120Hz() {
        let start = CGPoint(x: 0, y: 0), target = CGPoint(x: 300, y: -120)
        let one = CursorMotion.follow(current: start, target: target, dt: 1.0 / 60)
        let two = CursorMotion.follow(current: CursorMotion.follow(current: start, target: target, dt: 1.0 / 120), target: target, dt: 1.0 / 120)
        #expect(abs(one.x - two.x) < 0.001 && abs(one.y - two.y) < 0.001)
    }

    @Test func followingCatchesUpQuicklyWithoutOvershooting() {
        var p = CGPoint.zero
        let target = CGPoint(x: 400, y: 0)
        var frames = 0
        while hypot(target.x - p.x, target.y - p.y) > 1 { p = CursorMotion.follow(current: p, target: target, dt: 1.0 / 120); frames += 1; #expect(p.x <= target.x) }
        #expect(Double(frames) / 120 < 0.5) // within 1 pt in under half a second
    }

    @Test func aFlightStartsAndLandsExactlyAndSwellsMidway() {
        let f = CursorMotion.Flight(from: CGPoint(x: 100, y: 100), to: CGPoint(x: 900, y: 500))
        #expect(f.at(0).point == CGPoint(x: 100, y: 100))
        let end = f.at(f.duration)
        #expect(end.point == CGPoint(x: 900, y: 500) && end.done && abs(end.scale - 1) < 0.001)
        #expect(abs(f.at(f.duration / 2).scale - 1.3) < 0.001)
        #expect(f.control.y > 500) // it arcs up and over
    }

    @Test func flightTimeScalesWithDistanceWithinLimits() {
        #expect(CursorMotion.Flight(from: .zero, to: CGPoint(x: 10, y: 0)).duration == 0.45)
        #expect(CursorMotion.Flight(from: .zero, to: CGPoint(x: 5000, y: 0)).duration == 0.95)
    }

    @Test func theBuddyStaysOnScreenAtEdges() {
        let visible = CGRect(x: 0, y: 0, width: 1000, height: 800)
        let normal = CursorMotion.anchor(cursor: CGPoint(x: 500, y: 400), visible: visible)
        #expect(normal.x > 500 && normal.y < 400)
        let corner = CursorMotion.anchor(cursor: CGPoint(x: 995, y: 5), visible: visible)
        #expect(corner.x < 995 && corner.y > 5)
    }

    @Test func anchorContainsTheWholeCompanionEvenOutsideTheVisibleArea() {
        let visible = CGRect(x: -1200, y: 40, width: 1000, height: 700)
        for cursor in [CGPoint(x: -1300, y: 20), CGPoint(x: -180, y: 800), CGPoint(x: -700, y: 400)] {
            let p = CursorMotion.anchor(cursor: cursor, visible: visible, size: CGSize(width: 44, height: 44))
            #expect(visible.contains(CGRect(x: p.x - 22, y: p.y - 22, width: 44, height: 44)))
        }
    }

    @Test func captionsStayInsideEveryCornerAndOffsetDisplay() {
        let visible = CGRect(x: -1200, y: 40, width: 1000, height: 700)
        for point in [CGPoint(x: -1198, y: 42), CGPoint(x: -202, y: 738), CGPoint(x: -700, y: 400)] {
            let frame = CursorMotion.captionFrame(near: point, size: CGSize(width: 280, height: 100), visible: visible)
            #expect(visible.insetBy(dx: 8, dy: 8).contains(frame))
            #expect(frame.size == CGSize(width: 280, height: 100))
        }
        let oversized = CursorMotion.captionFrame(near: .zero, size: CGSize(width: 2000, height: 2000), visible: visible)
        #expect(visible.contains(oversized))
    }

    @Test func thePenFliesThenTracesEachMarkInTurn() {
        let plan = CursorMotion.penPlan(from: CGPoint(x: 0, y: 0), strokes: [(CGPoint(x: 700, y: 0), 300), (CGPoint(x: 700, y: 10), 2000)])
        #expect(plan.count == 2)
        #expect(plan[0].flyAt == 0 && plan[0].fly == 0.5 && plan[0].traceAt == 0.5)
        #expect(plan[0].trace == 0.4)                    // a small mark: quick
        #expect(plan[1].flyAt > plan[0].traceAt + plan[0].trace) // the next starts only after this one is drawn
        #expect(plan[1].trace == 0.95)                   // a big one: capped, never sluggish
        #expect(CursorMotion.penPlan(from: nil, strokes: [(CGPoint(x: 5, y: 5), 100)])[0].fly == 0) // no start: draw in place
    }

    @Test func thePenTourFliesThenFollowsTheMarkToItsEnd() {
        let line: [CGPoint] = [CGPoint(x: 500, y: 100), CGPoint(x: 700, y: 100)] // an underline, 200 pt
        let plan = CursorMotion.penPlan(from: .zero, strokes: [(line[0], 200)])
        let tour = CursorMotion.PenTour(from: .zero, strokes: [line], plan: plan)
        #expect(tour.at(0).point == .zero)
        let mid = tour.at(plan[0].flyAt + plan[0].fly / 2)
        #expect(mid.scale > 1.25 && mid.point.y > 100)                     // mid-flight: bigger, arcing up and over
        let halfway = tour.at(plan[0].traceAt + plan[0].trace / 2).point  // half the line drawn → half-way along it
        #expect(abs(halfway.x - 600) < 0.5 && abs(halfway.y - 100) < 0.5)
        let end = tour.at(tour.duration + 0.1)
        #expect(end.done && end.point == CGPoint(x: 700, y: 100))
    }

    @Test func flatteningACircleKeepsItsShape() {
        let pts = CursorMotion.flatten(CGPath(ellipseIn: CGRect(x: 0, y: 0, width: 100, height: 100), transform: nil))
        #expect(pts.count > 20)
        #expect(pts.allSatisfy { abs(hypot($0.x - 50, $0.y - 50) - 50) < 1 })
    }

    @Test func theArrowTurnsTheShortWayRound() {
        let a = CursorMotion.turn(current: 170 * .pi / 180, target: -170 * .pi / 180, dt: 1.0 / 120)
        #expect(a > 170 * .pi / 180) // heading on through 180°, not swinging back through 0°
        let b = CursorMotion.turn(current: -170 * .pi / 180, target: 170 * .pi / 180, dt: 1.0 / 120)
        #expect(b < -170 * .pi / 180)
    }

    @Test func turningIsTheSameAt60And120HzAndSettles() {
        let one = CursorMotion.turn(current: 0, target: 2, dt: 1.0 / 60)
        let two = CursorMotion.turn(current: CursorMotion.turn(current: 0, target: 2, dt: 1.0 / 120), target: 2, dt: 1.0 / 120)
        #expect(abs(one - two) < 0.0001 && one > 0 && one < 2)
        var h: CGFloat = 0
        for _ in 0..<60 { h = CursorMotion.turn(current: h, target: 2, dt: 1.0 / 120) } // half a second
        #expect(abs(h - 2) < 0.01)
    }

    @Test func theWaveformFollowsYourVoice() {
        let quiet = CursorMotion.waveBars(level: 0, t: 1.3), loud = CursorMotion.waveBars(level: 1, t: 1.3)
        #expect(quiet.count == 5 && loud.count == 5)
        #expect(quiet.allSatisfy { $0 >= 4 && $0 < 8 })              // silence: a small ripple, never flat, never tall
        #expect(loud.max()! > 18 && loud.allSatisfy { $0 <= 26 })   // talking: tall, within the orb's space
        #expect(loud.reduce(0, +) > quiet.reduce(0, +) * 2.5)
        let mid = CursorMotion.waveBars(level: 0.3, t: 2)
        #expect(mid.reduce(0, +) > quiet.reduce(0, +))              // soft speech still moves it
        // It moves over time on its own (ripple), even at a steady level.
        #expect(CursorMotion.waveBars(level: 0.6, t: 0.5) != CursorMotion.waveBars(level: 0.6, t: 0.62))
    }
}
