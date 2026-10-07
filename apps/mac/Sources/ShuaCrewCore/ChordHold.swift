import Foundation

/// Hold ⌃⌥ (Control + Option) to talk to Shua from any app. The chord going down warms the microphone (`press`), so the
/// first word isn't lost; held a beat with nothing else pressed it becomes a hold (`holdStart`: a pop, and Shua listens);
/// letting either key go sends it (`holdEnd`). ⌃⌥ with another key, another modifier or a click is some app's shortcut
/// (⌃⌥←, a ⌃⌥-click…): that press `cancel`s, silently, and nothing more fires until the chord is let go.
/// Pure state, fed events and a clock (like FnGesture); the tests pin the timing.
public struct ChordHold: Sendable {
    public enum Signal: Equatable, Sendable { case none, press, cancel, holdStart, holdEnd }
    /// Long enough to tell a deliberate hold from the start of a shortcut, short enough that talking feels immediate.
    public static let holdAfter: TimeInterval = 0.15

    private var downAt: TimeInterval?
    private var holding = false
    private var spoiled = false

    public init() {}

    /// The modifiers changed. `others`: any modifier besides Control and Option (caps lock and the keypad bit don't count).
    public mutating func flags(control: Bool, option: Bool, others: Bool, at t: TimeInterval) -> Signal {
        guard control && option else { return up() }
        if others { return otherInput() }
        guard downAt == nil, !spoiled else { return .none }
        downAt = t; holding = false
        return .press
    }
    /// A key or a click while the chord is down: it's a shortcut. During a hold, it ends the hold (what you said is sent).
    public mutating func otherInput() -> Signal {
        guard downAt != nil || holding, !spoiled else { return .none }
        spoiled = true
        if holding { holding = false; return .holdEnd }
        return .cancel
    }
    /// Time passing while the chord is held: past the threshold, a hold begins.
    public mutating func tick(at t: TimeInterval) -> Signal {
        guard let start = downAt, !holding, !spoiled, t - start >= Self.holdAfter else { return .none }
        holding = true
        return .holdStart
    }
    /// Control or Option came up: end a hold, or drop a press that never became one.
    private mutating func up() -> Signal {
        defer { downAt = nil; holding = false; spoiled = false }
        if holding { return .holdEnd }
        if downAt != nil && !spoiled { return .cancel }
        return .none
    }
    /// Whether the chord is down and still Shua's (the app ticks only then).
    public var armed: Bool { downAt != nil && !spoiled }
}
