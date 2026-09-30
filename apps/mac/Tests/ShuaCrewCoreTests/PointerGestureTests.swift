import CoreGraphics
import Foundation
import Testing
@testable import ShuaCrewCore

@Suite struct PointerGestureTests {
    func loop(cx: CGFloat, cy: CGFloat, rx: CGFloat, ry: CGFloat, turns: Double = 1.05, wobble: CGFloat = 0) -> [CGPoint] {
        (0...60).map { i in
            let a = Double(i) / 60 * turns * 2 * .pi
            return CGPoint(x: cx + rx * CGFloat(cos(a)) + (i % 2 == 0 ? wobble : -wobble), y: cy + ry * CGFloat(sin(a)))
        }
    }

    @Test func aRoughCircleIsACircleAroundWhatItEncloses() {
        let g = PointerGesture.classify(loop(cx: 400, cy: 300, rx: 60, ry: 40, wobble: 3))
        #expect(g.kind == "circle")
        #expect(g.region!.contains(CGPoint(x: 400, y: 300)))
    }

    @Test func aSidewaysStrokeIsAnUnderline() {
        let stroke = (0...30).map { CGPoint(x: 100 + CGFloat($0) * 8, y: 500 + CGFloat($0 % 3)) }
        #expect(PointerGesture.classify(stroke).kind == "underline")
    }

    @Test func zigzagOverAnAreaIsAScribble() {
        let zig = (0...40).map { CGPoint(x: 200 + CGFloat($0) * 6, y: $0 % 2 == 0 ? 200 : 300) }
        #expect(PointerGesture.classify(zig).kind == "scribble")
    }

    @Test func holdingStillOrNudgingIsNothing() {
        #expect(PointerGesture.classify([]) == .none)
        #expect(PointerGesture.classify((0...20).map { CGPoint(x: 300 + CGFloat($0 % 2), y: 300) }) == .none)
        #expect(PointerGesture.classify((0...10).map { CGPoint(x: 300 + CGFloat($0) * 2, y: 300) }) == .none) // a 20-pt nudge
    }

    @Test func aCircleAfterTheCursorsApproachIsStillJustTheCircle() {
        // fn went down while the cursor was still travelling from (0,0): a long approach, then a loop at (400,300).
        let approach = (0...40).map { CGPoint(x: CGFloat($0) * 8.5, y: CGFloat($0) * 6.5) }
        let g = PointerGesture.classify(approach + loop(cx: 400, cy: 300, rx: 60, ry: 40, wobble: 2) + [CGPoint(x: 470, y: 280)])
        #expect(g.kind == "circle")
        #expect(g.region!.width < 140 && g.region!.contains(CGPoint(x: 400, y: 300))) // the loop, not the whole trip
    }
}
