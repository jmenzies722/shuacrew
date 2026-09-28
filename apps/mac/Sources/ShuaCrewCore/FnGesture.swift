import Foundation

/// The fn (Globe) key on its own: a quick tap, or a hold. fn is also a modifier (fn+F-keys, fn+arrows), so any
/// other key while it's down means "not for Spark" and nothing fires. Pure state: the Mac app feeds it events
/// and a clock; the tests pin the timing.
public struct FnGesture: Sendable {
    public enum Signal: Equatable, Sendable { case none, tap, holdStart, holdEnd }
    public static let holdAfter: TimeInterval = 0.3
    public static let tapWithin: TimeInterval = 0.5

    private var downAt: TimeInterval?
    private var holding = false
    private var spoiled = false

    public init() {}

    /// fn went down (alone).
    public mutating func down(at t: TimeInterval) -> Signal {
        if downAt == nil { downAt = t; holding = false; spoiled = false }
        return .none
    }
    /// Another key (or modifier) while fn is down: it's being used as a modifier, so this press isn't Spark's.
    public mutating func otherKey() -> Signal {
        guard downAt != nil else { return .none }
        if holding { holding = false; spoiled = true; return .holdEnd }
        spoiled = true
        return .none
    }
    /// Time passing while fn is held: past the threshold, a hold begins.
    public mutating func tick(at t: TimeInterval) -> Signal {
        guard let start = downAt, !holding, !spoiled, t - start >= Self.holdAfter else { return .none }
        holding = true
        return .holdStart
    }
    /// fn came up: end a hold, or count a quick clean press as a tap.
    public mutating func up(at t: TimeInterval) -> Signal {
        guard let start = downAt else { return .none }
        defer { downAt = nil; holding = false; spoiled = false }
        if holding { return .holdEnd }
        return !spoiled && t - start < Self.tapWithin ? .tap : .none
    }
}
