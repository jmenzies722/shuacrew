import Testing
@testable import ShuaCrewCore

@Suite struct EarconSynthTests {
    /// The largest jump in slope between samples: a click shows up as a spike here; a smooth tone keeps it small.
    func spike(_ s: [Float]) -> Float {
        var top: Float = 0
        for i in 2..<s.count { let d: Float = s[i] - 2 * s[i - 1] + s[i - 2]; top = max(top, abs(d)) }
        return top
    }

    @Test func everySoundIsShortCleanAndAtItsLevel() {
        for kind in EarconSynth.Kind.allCases {
            let s = EarconSynth.render(kind)
            let top = s.map(abs).max()!
            let heard = Double(s.lastIndex { abs($0) > top * 0.001 } ?? 0) / 48_000   // until it falls below −60 dB
            #expect(heard <= 0.5, "\(kind) rings \(heard) s")
            #expect(abs(top - EarconSynth.peak[kind]!) < 0.001, "\(kind) peak \(top)")      // normalised, never clipping
            #expect(s.first == 0 && abs(s.last!) < 1e-6, "\(kind) edges")                     // silent at both ends
            #expect(spike(s) < 0.2 * top, "\(kind) spike \(spike(s)) vs peak \(top)")          // no clicks
        }
    }

    @Test func rendersIdenticallyEveryTime() {
        #expect(EarconSynth.render(.listen) == EarconSynth.render(.listen)) // seeded breath: no random differences
    }

    @Test func listenRisesSentSettles() {
        let listen = EarconSynth.notes[.listen]!, sent = EarconSynth.notes[.sent]!
        #expect(listen.last!.f > listen.first!.f)
        #expect(sent.last!.f < sent.first!.f)
    }
}
