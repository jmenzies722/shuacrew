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
}
