import Foundation

/// Spark's sounds, synthesised natively (the same glass tones as apps/web/src/lib/earcons.ts): each note is a
/// fundamental plus overtones that ring out faster than it does, so it sounds struck rather than beeped. Rendered once
/// into a mono buffer; the Mac app places it at the notch with Apple's HRTF renderer and plays it with no web round
/// trip (the page path lagged and landed on top of the Bluetooth headset switch). Pure, so the output is tested.
public enum EarconSynth {
    public enum Kind: String, CaseIterable, Sendable { case listen, sent, off, done, error }
    public struct Note: Sendable { public let f: Double, at: Double, dur: Double, gain: Double, glide: Double?, soft: Bool }
    static func n(_ f: Double, _ at: Double, _ dur: Double, _ gain: Double, glide: Double? = nil, soft: Bool = false) -> Note { Note(f: f, at: at, dur: dur, gain: gain, glide: glide, soft: soft) }

    static let E4 = 329.63, GS4 = 415.3, B4 = 493.88, E5 = 659.25, GS5 = 830.61, B5 = 987.77, E6 = 1318.51

    /// One chord (E major), none longer than ~0.45 s.
    public static let notes: [Kind: [Note]] = [
        .listen: [n(E5, 0, 0.24, 0.6), n(B5, 0.045, 0.26, 0.5), n(E6, 0.09, 0.34, 0.32)],   // rising shimmer: you're live
        .sent: [n(B5, 0, 0.14, 0.42), n(E5, 0.055, 0.26, 0.46)],                             // settling pair: heard you
        .off: [n(B4, 0, 0.12, 0.3), n(GS4, 0.05, 0.3, 0.4, glide: 0.97)],                    // closing note
        .done: [n(E5, 0, 0.2, 0.42), n(GS5, 0.055, 0.2, 0.4), n(B5, 0.11, 0.22, 0.4), n(E6, 0.165, 0.33, 0.32)],
        .error: [n(GS4, 0, 0.2, 0.3, soft: true), n(E4, 0.13, 0.32, 0.33, soft: true)],
    ]
    /// Where each sound sits (metres; x right, y up, z towards you — negative is in front): up at the notch.
    public static let position: [Kind: (x: Float, y: Float, z: Float)] = [
        .listen: (0, 0.6, -0.8), .sent: (0, 1.2, -1.6), .off: (0, 1.1, -1.4), .done: (0, 1.0, -1.2), .error: (0, 1.0, -1.0),
    ]
    /// Overtones: (ratio, level, how much faster it rings out). Soft notes keep only the warm ones.
    static let glass: [(Double, Double, Double)] = [(1, 1, 1), (2, 0.32, 1.8), (3, 0.11, 2.6), (4.16, 0.05, 3.4)]
    static let warm: [(Double, Double, Double)] = [(1, 1, 1), (2, 0.14, 1.6)]
    /// Peak level each sound is normalised to: the cues that matter most a little louder, the error softest.
    static let peak: [Kind: Float] = [.listen: 0.5, .sent: 0.45, .off: 0.4, .done: 0.45, .error: 0.36]

    /// The dry mono sound at `rate`: 4 ms strike, exponential ring-out per overtone, a breath of air under "listen",
    /// normalised, and faded to exact silence at both ends (no click, whatever the tail holds).
    public static func render(_ kind: Kind, rate: Double = 48_000) -> [Float] {
        let cue = notes[kind] ?? []
        let length = Int(((cue.map { $0.at + $0.dur }.max() ?? 0.3) + 0.06) * rate)
        var out = [Float](repeating: 0, count: length)
        for note in cue {
            let start = Int(note.at * rate)
            for (ratio, level, faster) in note.soft ? warm : glass {
                let ring = note.dur / faster, count = min(length - start, Int(ring * rate)), attack = 0.004 * rate
                guard count > 0 else { continue }
                var phase = 0.0
                for i in 0..<count {
                    let t = Double(i) / rate
                    // An exponential glide, integrated as phase so the pitch bends without a click.
                    let f = note.f * ratio * (note.glide.map { pow($0, min(1, t / note.dur)) } ?? 1)
                    phase += 2 * .pi * f / rate
                    let env = Double(i) < attack ? pow(1e-4, 1 - Double(i) / attack) : pow(1e-4, (Double(i) - attack) / max(1, Double(count) - attack))
                    out[start + i] += Float(sin(phase) * note.gain * level * env)
                }
            }
        }
        if kind == .listen { addAir(&out, rate: rate, level: 0.05) }
        let top = out.map(abs).max() ?? 0
        if top > 0 { let k = (peak[kind] ?? 0.45) / top; for i in out.indices { out[i] *= k } }
        let fin = Int(0.002 * rate), fout = Int(0.02 * rate)
        for i in 0..<min(fin, out.count) { out[i] *= Float(i) / Float(fin) }
        for i in 0..<min(fout, out.count) { out[out.count - 1 - i] *= Float(i) / Float(fout) }
        return out
    }

    /// A breath: noise band-passed around 4.2 kHz (RBJ biquad), swelling in and out over 0.22 s. Seeded, so every
    /// render is identical.
    static func addAir(_ out: inout [Float], rate: Double, level: Double) {
        let n = min(out.count, Int(0.22 * rate)), w = 2 * Double.pi * 4200 / rate, q = 1.1, alpha = sin(w) / (2 * q)
        let a0 = 1 + alpha, b0 = alpha / a0, b2 = -alpha / a0, a1 = -2 * cos(w) / a0, a2 = (1 - alpha) / a0
        var x1 = 0.0, x2 = 0.0, y1 = 0.0, y2 = 0.0, seed: UInt64 = 0x5EED
        for i in 0..<n {
            seed = seed &* 6364136223846793005 &+ 1442695040888963407
            let x = Double(Int64(bitPattern: seed >> 11) % 2_000_000) / 1_000_000 - 1
            let y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2
            x2 = x1; x1 = x; y2 = y1; y1 = y
            out[i] += Float(y * level * sin(Double.pi * Double(i) / Double(n)))
        }
    }
}
