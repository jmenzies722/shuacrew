import Testing
@testable import ShuaCrewCore

@Suite struct EarconSynthTests {
    /// The largest jump in slope between samples: a click shows up as a spike here; a smooth tone keeps it small.
    func spike(_ s: [Float]) -> Float {
        var top: Float = 0
        for i in 2..<s.count { let d: Float = s[i] - 2 * s[i - 1] + s[i - 2]; top = max(top, abs(d)) }
        return top
    }

    @Test func everySoundInEveryPackIsShortCleanAndAtItsLevel() {
        for pack in EarconSynth.Pack.allCases {
            for kind in EarconSynth.Kind.allCases {
                let s = EarconSynth.render(kind, pack: pack)
                let top = s.map(abs).max()!
                let heard = Double(s.lastIndex { abs($0) > top * 0.001 } ?? 0) / 48_000   // until it falls below −60 dB
                #expect(heard <= 0.5, "\(pack) \(kind) rings \(heard) s")
                #expect(abs(top - EarconSynth.peak[kind]!) < 0.001, "\(pack) \(kind) peak \(top)")      // normalised, never clipping
                #expect(s.first == 0 && abs(s.last!) < 1e-6, "\(pack) \(kind) edges")                     // silent at both ends
                #expect(spike(s) < 0.2 * top, "\(pack) \(kind) spike \(spike(s)) vs peak \(top)")          // no clicks
            }
        }
    }

    @Test func packsReallyDiffer() {
        // Totally different sounds, not the same one re-pitched: no two packs render the same listen cue.
        let listens = EarconSynth.Pack.allCases.map { EarconSynth.render(.listen, pack: $0) }
        for i in listens.indices { for j in listens.indices where j > i { #expect(listens[i] != listens[j]) } }
    }

    @Test func rendersIdenticallyEveryTime() {
        #expect(EarconSynth.render(.listen) == EarconSynth.render(.listen)) // seeded breath: no random differences
    }

    @Test func inEveryPackListenRisesAndSentSettles() {
        // Where a note's pitch ends up (a droplet is one note that glides).
        let end = { (n: EarconSynth.Note) in n.f * (n.glide ?? 1) }
        for pack in EarconSynth.Pack.allCases {
            let listen = EarconSynth.packs[pack]![.listen]!, sent = EarconSynth.packs[pack]![.sent]!
            #expect(end(listen.last!) > listen.first!.f, "\(pack) listen")
            #expect(end(sent.last!) < sent.first!.f, "\(pack) sent")
        }
    }
}
