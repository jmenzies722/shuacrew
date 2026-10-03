import Testing
@testable import ShuaCrewCore

@Suite struct VoiceGateTests {
    let frame = 2048.0 / 48_000 // one tap buffer, ~43 ms

    @Test func silenceStaysClosed() {
        var g = VoiceGate()
        for _ in 0..<200 { #expect(!g.step(rms: 0.001, seconds: frame).pass) }
    }

    @Test func speechOpensAtOnceAndSaysSo() {
        var g = VoiceGate()
        for _ in 0..<50 { _ = g.step(rms: 0.001, seconds: frame) }
        let first = g.step(rms: 0.05, seconds: frame)
        #expect(first.pass && first.opened)
        let next = g.step(rms: 0.05, seconds: frame)
        #expect(next.pass && !next.opened)
    }

    @Test func gapsBetweenWordsDontCloseIt_butSilenceDoes() {
        var g = VoiceGate(hold: 2.0)
        _ = g.step(rms: 0.05, seconds: frame)
        for _ in 0..<20 { #expect(g.step(rms: 0.001, seconds: frame).pass) } // ~0.9 s gap: still open
        for _ in 0..<40 { _ = g.step(rms: 0.001, seconds: frame) }          // past the 2 s hold
        #expect(!g.open)
    }

    @Test func aLoudRoomJustStaysOpen_neverWorseThanBefore() {
        var g = VoiceGate()
        var passed = 0
        for _ in 0..<300 { if g.step(rms: 0.04, seconds: frame).pass { passed += 1 } }
        #expect(passed == 300)
    }

    @Test func aQuietVoiceInAQuietRoomStillOpens() {
        var g = VoiceGate()
        for _ in 0..<100 { _ = g.step(rms: 0.0009, seconds: frame) }
        #expect(g.step(rms: 0.006, seconds: frame).pass) // soft speech, ~6× the room
    }
}
