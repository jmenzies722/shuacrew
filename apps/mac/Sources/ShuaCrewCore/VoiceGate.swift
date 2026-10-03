/// Lets audio through only while there's sound worth hearing, so an always-on listener ("Hey Spark") isn't
/// recognising silence all day. Adaptive: the noise floor follows the room while it's quiet; anything clearly
/// above it opens the gate, which then stays open a little after the sound stops (words have gaps). In a room
/// that's always loud it simply stays open — the listener behaves exactly as before, it just never saves anything.
public struct VoiceGate: Sendable {
    public private(set) var floor: Float
    public private(set) var open = false
    private var hangover = 0.0
    public let hold: Double

    public init(floor: Float = 0.003, hold: Double = 2.0) { self.floor = floor; self.hold = hold }

    /// The level that counts as sound: comfortably above the room, never below a whisper's worth.
    public var threshold: Float { max(0.0025, floor * 2.2) }

    /// One buffer's RMS level and length. `pass`: hand this buffer on; `opened`: the gate just opened, so hand on
    /// what was kept from just before it too (the start of the word).
    public mutating func step(rms: Float, seconds: Double) -> (pass: Bool, opened: Bool) {
        if rms > threshold {
            let opened = !open
            open = true; hangover = hold
            return (true, opened)
        }
        // Quiet: learn the room (slowly, and never from the sound we just let through).
        floor = max(0.0008, floor * 0.98 + rms * 0.02)
        guard open else { return (false, false) }
        hangover -= seconds
        if hangover <= 0 { open = false; return (false, false) }
        return (true, false)
    }
}
