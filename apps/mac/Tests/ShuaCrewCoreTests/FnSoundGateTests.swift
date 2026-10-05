import Testing
@testable import ShuaCrewCore

@Test func fnOwnsCaptureSoundsFromKeyDown() {
    var gate = FnSoundGate()
    gate.receive(.press)
    for kind: EarconSynth.Kind in [.listen, .off, .sent] { #expect(!gate.allowsWeb(kind)) }
    #expect(gate.allowsWeb(.error))
    #expect(gate.allowsWeb(.done))
    gate.receive(.holdStart)
    gate.receive(.none)
    #expect(!gate.allowsWeb(.listen))
    gate.receive(.holdEnd)
    #expect(gate.allowsWeb(.listen))
}
@Test func cancellingFnRestoresNormalVoiceSounds() {
    for signal: FnGesture.Signal in [.cancel, .tap] {
        var gate = FnSoundGate()
        gate.receive(.press); gate.receive(signal)
        #expect(gate.allowsWeb(.listen))
    }
}
