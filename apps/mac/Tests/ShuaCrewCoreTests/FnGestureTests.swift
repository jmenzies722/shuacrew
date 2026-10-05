import Foundation
import ShuaCrewCore
import Testing

@Test func quickCleanPressIsATap() {
    var g = FnGesture()
    #expect(g.down(at: 0) == .press)             // the mic opens now
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
    #expect(g.otherKey() == .cancel)            // fn+F5, fn+arrow…: close the mic
    #expect(g.otherKey() == .none)              // only once
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
    #expect(g.up(at: 0.8) == .cancel)           // neither tap nor hold: close the mic
    _ = g.down(at: 5)
    #expect(g.up(at: 5.1) == .tap)              // state resets between presses
}

@Test func fnFeedbackAcknowledgesPressWithoutClaimingCapture() {
    #expect(FnFeedback.phase(for: .press) == .preparing)
    #expect(FnFeedback.phase(for: .holdStart) == .hidden)
    #expect(FnFeedback.phase(for: .cancel) == .hidden)
    #expect(FnFeedback.phase(for: .tap) == .hidden)
    #expect(FnFeedback.phase(for: .holdEnd) == .hidden)
}

@Test func captureConsistencyRejectsAppWindowAndTimeChanges() {
    #expect(CaptureConsistency.valid(startPID: 1, currentPID: 1, startWindow: "Music", currentWindow: "Music", observedAt: 10, now: 11))
    #expect(!CaptureConsistency.valid(startPID: 1, currentPID: 2, startWindow: "Music", currentWindow: "Music", observedAt: 10, now: 11))
    #expect(!CaptureConsistency.valid(startPID: 1, currentPID: 1, startWindow: "Music", currentWindow: "Settings", observedAt: 10, now: 11))
    #expect(!CaptureConsistency.valid(startPID: 1, currentPID: 1, startWindow: "Music", currentWindow: "Music", observedAt: 10, now: 19))
}

@Test func delayedHoldTimerCannotTurnASelectionHoldIntoVoiceTap() {
    var gesture = FnGesture()
    _ = gesture.down(at: 0)
    #expect(gesture.up(at: 0.4) == .cancel)
}
