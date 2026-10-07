import Foundation
import ShuaCrewCore
import Testing

@Test func holdingTheChordTalksAndLettingGoSends() {
    var c = ChordHold()
    #expect(c.flags(control: true, option: false, others: false, at: 0) == .none)   // Control first: not yet
    #expect(c.flags(control: true, option: true, others: false, at: 0.02) == .press) // the mic warms now
    #expect(c.tick(at: 0.1) == .none)
    #expect(c.tick(at: 0.18) == .holdStart)
    #expect(c.tick(at: 0.5) == .none)                                                 // only once
    #expect(c.flags(control: false, option: true, others: false, at: 2) == .holdEnd)  // either key up sends
    #expect(c.flags(control: false, option: false, others: false, at: 2.01) == .none)
}

@Test func aQuickChordTapNeverTalks() {
    var c = ChordHold()
    _ = c.flags(control: true, option: true, others: false, at: 0)
    #expect(c.flags(control: true, option: false, others: false, at: 0.08) == .cancel) // close the warmed mic
    #expect(c.tick(at: 0.3) == .none)
}

@Test func chordShortcutsAreLeftAlone() {
    var c = ChordHold()
    _ = c.flags(control: true, option: true, others: false, at: 0)
    #expect(c.otherInput() == .cancel)            // ⌃⌥← (or a ⌃⌥-click): it's the app's
    #expect(c.otherInput() == .none)              // only once
    #expect(c.tick(at: 0.5) == .none)             // still held after the shortcut: never becomes a hold
    #expect(c.flags(control: false, option: false, others: false, at: 0.6) == .none)
    // Next time the chord goes down on its own, it works again.
    #expect(c.flags(control: true, option: true, others: false, at: 1) == .press)
}

@Test func addingAModifierIsAShortcutToo() {
    var c = ChordHold()
    _ = c.flags(control: true, option: true, others: false, at: 0)
    #expect(c.flags(control: true, option: true, others: true, at: 0.05) == .cancel) // ⌃⌥⌘…
    #expect(c.tick(at: 0.3) == .none)
    #expect(c.flags(control: true, option: true, others: false, at: 0.4) == .none)    // ⌘ let go, chord still down: still spoiled
}

@Test func aKeyDuringAHoldEndsIt() {
    var c = ChordHold()
    _ = c.flags(control: true, option: true, others: false, at: 0)
    _ = c.tick(at: 0.2)
    #expect(c.otherInput() == .holdEnd)
    #expect(c.flags(control: false, option: false, others: false, at: 1) == .none)
}
