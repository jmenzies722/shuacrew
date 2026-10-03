import Foundation

/// Spark's sounds, synthesised natively (the same glass tones as apps/web/src/lib/earcons.ts): each note is a
/// fundamental plus overtones that ring out faster than it does, so it sounds struck rather than beeped. Rendered once
/// into a mono buffer; the Mac app places it at the notch with Apple's HRTF renderer and plays it with no web round
/// trip (the page path lagged and landed on top of the Bluetooth headset switch). Pure, so the output is tested.
public enum EarconSynth {
    public enum Kind: String, CaseIterable, Sendable { case listen, sent, off, done, error }
    /// Sound packs, each a different instrument, all clean tones (no noise, no wobble). Glass is the original.
    public enum Pack: String, CaseIterable, Sendable { case glass, pop, chime, pulse, droplet, felt }
    /// How a pack's notes sound: overtones (ratio, level, how much faster each rings out) and the strike time.
    struct Timbre { let partials: [(Double, Double, Double)]; let attack: Double }
    public struct Note: Sendable { public let f: Double, at: Double, dur: Double, gain: Double, glide: Double?, soft: Bool }
    static func n(_ f: Double, _ at: Double, _ dur: Double, _ gain: Double, glide: Double? = nil, soft: Bool = false) -> Note { Note(f: f, at: at, dur: dur, gain: gain, glide: glide, soft: soft) }

    static let E4 = 329.63, GS4 = 415.3, B4 = 493.88, E5 = 659.25, GS5 = 830.61, B5 = 987.77, E6 = 1318.51
    static let C4 = 261.63, G4 = 392.0, A4 = 440.0, C5 = 523.25, D5 = 587.33, G5 = 783.99, A5 = 880.0, C6 = 1046.5, E7 = 2637.0

    /// Every pack's cues. Listen always rises (you're live), sent settles (heard you), done resolves, error sinks.
    public static let packs: [Pack: [Kind: [Note]]] = [
        .glass: glassNotes,
        // Soft bubbles: short sine pops that drop a little in pitch as they burst.
        .pop: [.listen: [n(A5, 0, 0.09, 0.6, glide: 0.82), n(E6, 0.07, 0.11, 0.5, glide: 0.85)],
               .sent: [n(E6, 0, 0.08, 0.5, glide: 0.85), n(A5, 0.06, 0.11, 0.55, glide: 0.8)],
               .off: [n(A5, 0, 0.12, 0.45, glide: 0.7)],
               .done: [n(A5, 0, 0.07, 0.45, glide: 0.85), n(C6 * 1.26, 0.06, 0.07, 0.45, glide: 0.85), n(E6, 0.12, 0.12, 0.45, glide: 0.85)],
               .error: [n(E5, 0, 0.1, 0.45, glide: 0.75), n(C5, 0.09, 0.14, 0.45, glide: 0.7)]],
        // A kalimba: plucked tines, bright attack with a quick-fading upper partial, pentatonic.
        .chime: [.listen: [n(C5, 0, 0.32, 0.55), n(G5, 0.06, 0.34, 0.5)],
                 .sent: [n(G5, 0, 0.26, 0.5), n(D5, 0.07, 0.34, 0.5)],
                 .off: [n(D5, 0, 0.36, 0.45)],
                 .done: [n(C5, 0, 0.28, 0.45), n(E5, 0.06, 0.28, 0.45), n(G5, 0.12, 0.3, 0.45), n(C6, 0.18, 0.4, 0.4)],
                 .error: [n(A4, 0, 0.3, 0.45, soft: true), n(E4, 0.1, 0.4, 0.45, soft: true)]],
        // Pure digital taps: plain sine blips, nothing else. The most neutral.
        .pulse: [.listen: [n(A5, 0, 0.07, 0.55), n(E6, 0.08, 0.09, 0.55)],
                 .sent: [n(E6, 0, 0.07, 0.5), n(A5, 0.08, 0.09, 0.5)],
                 .off: [n(A5, 0, 0.08, 0.45)],
                 .done: [n(A5, 0, 0.06, 0.45), n(E6, 0.07, 0.06, 0.45), n(A5 * 2, 0.14, 0.1, 0.45)],
                 .error: [n(E5, 0, 0.09, 0.45), n(E5, 0.13, 0.09, 0.45)]],
        // Water drops: one tone that glides up (or down), like a drip landing.
        .droplet: [.listen: [n(G5, 0, 0.13, 0.6, glide: 1.7)],
                   .sent: [n(E6, 0, 0.13, 0.55, glide: 0.62)],
                   .off: [n(D5, 0, 0.14, 0.45, glide: 0.75)],
                   .done: [n(G5, 0, 0.1, 0.5, glide: 1.5), n(C6, 0.1, 0.13, 0.5, glide: 1.4)],
                   .error: [n(D5, 0, 0.16, 0.45, glide: 0.6)]],
        // Felt piano: low, rounded and muted, with a slower strike. The gentlest.
        .felt: [.listen: [n(C4, 0, 0.36, 0.55), n(G4, 0.07, 0.4, 0.5)],
                .sent: [n(G4, 0, 0.3, 0.5), n(C4, 0.08, 0.4, 0.5)],
                .off: [n(E4, 0, 0.4, 0.45)],
                .done: [n(C4, 0, 0.32, 0.45), n(E4, 0.07, 0.32, 0.45), n(G4, 0.14, 0.4, 0.45)],
                .error: [n(E4, 0, 0.32, 0.45, soft: true), n(C4, 0.12, 0.4, 0.45, soft: true)]],
    ]
    static let timbres: [Pack: Timbre] = [
        .glass: Timbre(partials: [(1, 1, 1), (2, 0.32, 1.8), (3, 0.11, 2.6), (4.16, 0.05, 3.4)], attack: 0.004),
        .pop: Timbre(partials: [(1, 1, 1), (2, 0.06, 2)], attack: 0.003),
        .chime: Timbre(partials: [(1, 1, 1), (4.07, 0.22, 7), (6.26, 0.06, 10)], attack: 0.003),
        .pulse: Timbre(partials: [(1, 1, 1)], attack: 0.003),
        .droplet: Timbre(partials: [(1, 1, 1), (2, 0.04, 2.5)], attack: 0.003),
        .felt: Timbre(partials: [(1, 1, 1), (2, 0.18, 1.5), (3, 0.04, 2.2)], attack: 0.012),
    ]

    /// The original glass pack (also `notes`, for older callers): one chord (E major), none longer than ~0.45 s.
    public static var notes: [Kind: [Note]] { glassNotes }
    static let glassNotes: [Kind: [Note]] = [
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
    /// Soft notes (errors) keep only the warm overtones, whatever the pack.
    static let warm: [(Double, Double, Double)] = [(1, 1, 1), (2, 0.14, 1.6)]
    /// Peak level each sound is normalised to: the cues that matter most a little louder, the error softest.
    static let peak: [Kind: Float] = [.listen: 0.5, .sent: 0.45, .off: 0.4, .done: 0.45, .error: 0.36]

    /// The dry mono sound at `rate`: 4 ms strike, exponential ring-out per overtone, a breath of air under "listen",
    /// normalised, and faded to exact silence at both ends (no click, whatever the tail holds).
    public static func render(_ kind: Kind, pack: Pack = .glass, rate: Double = 48_000) -> [Float] {
        let cue = packs[pack]?[kind] ?? [], timbre = timbres[pack] ?? timbres[.glass]!
        let length = Int(((cue.map { $0.at + $0.dur }.max() ?? 0.3) + 0.06) * rate)
        var out = [Float](repeating: 0, count: length)
        for note in cue {
            let start = Int(note.at * rate)
            for (ratio, level, faster) in note.soft ? warm : timbre.partials {
                let ring = note.dur / faster, count = min(length - start, Int(ring * rate)), attack = timbre.attack * rate
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
        if kind == .listen && pack == .glass { addAir(&out, rate: rate, level: 0.05) } // only glass breathes
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
