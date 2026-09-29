import Foundation
import ShuaCrewCore
import Testing

@Test func quickCleanPressIsATap() {
    var g = FnGesture()
    #expect(g.down(at: 0) == .none)
    #expect(g.tick(at: 0.1) == .none)
    #expect(g.up(at: 0.15) == .tap)
}

@Test func holdingStartsAfterTheThresholdAndEndsOnRelease() {
    var g = FnGesture()
    _ = g.down(at: 10)
    #expect(g.tick(at: 10.2) == .none)
    #expect(g.tick(at: 10.31) == .holdStart)
    #expect(g.tick(at: 10.5) == .none)          // only once
    #expect(g.up(at: 12) == .holdEnd)
}

@Test func fnUsedAsAModifierNeverFires() {
    var g = FnGesture()
    _ = g.down(at: 0)
    #expect(g.otherKey() == .none)              // fn+F5, fn+arrow…
    #expect(g.tick(at: 0.5) == .none)
    #expect(g.up(at: 0.6) == .none)
}

@Test func anotherKeyDuringAHoldEndsIt() {
    var g = FnGesture()
    _ = g.down(at: 0)
    #expect(g.tick(at: 0.4) == .holdStart)
    #expect(g.otherKey() == .holdEnd)
    #expect(g.up(at: 1) == .none)
}

@Test func slowPressWithoutHoldTicksIsNotATap() {
    var g = FnGesture()
    _ = g.down(at: 0)
    #expect(g.up(at: 0.8) == .none)
    _ = g.down(at: 5)
    #expect(g.up(at: 5.1) == .tap)              // state resets between presses
}
