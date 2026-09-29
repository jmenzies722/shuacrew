import Foundation
import ShuaCrewCore
import Testing

@Test func endedAudioRejectsLatePlayback() {
    var state = VoiceAudioState()
    let first = state.start()
    state.end()
    #expect(!state.accepts(first))
    let second = state.start()
    #expect(second != first)
    #expect(state.accepts(second))
    state.end()
    state.end()
    #expect(!state.accepts(second))
}

@Test func audioUtteranceRetainsPrerollAndRejectsNoise() throws {
    var capture = try VoiceUtteranceBuffer(sampleRate: 8_000, silence: 0.45)
    for _ in 0..<20 { #expect(capture.append(Array(repeating: 0, count: 400)).utterance == nil) }
    #expect(capture.bufferedCount <= 4_000)
    // A 50ms impact is not a spoken instruction.
    #expect(!capture.append(Array(repeating: 0.1, count: 400)).speechStarted)
    #expect(capture.append(Array(repeating: 0, count: 4_000)).utterance == nil)
    let speech = capture.append(Array(repeating: 0.1, count: 2_400))
    #expect(speech.speechStarted)
    let ended = capture.append(Array(repeating: 0, count: 4_000))
    #expect(ended.utterance != nil)
    #expect(ended.utterance!.count <= 240_000)
    #expect(ended.utterance!.prefix(1).first == 0)
}

@Test func audioUtteranceHasHardThirtySecondBound() throws {
    var capture = try VoiceUtteranceBuffer(sampleRate: 8_000, silence: 0.75)
    let result = capture.append(Array(repeating: 0.1, count: 300_000))
    #expect(result.utterance?.count == 240_000)
    #expect(capture.bufferedCount == 0)
    #expect(throws: (any Error).self) { try VoiceUtteranceBuffer(sampleRate: .infinity, silence: 0.75) }
}

@Test func audioBridgeRejectsUntrustedAndOversizedMessages() throws {
    let origin = URL(string: "http://127.0.0.1:4317")!
    let valid: [String: Any] = ["action": "start", "requestId": "req-1", "sessionId": "session-1"]
    #expect(try VoiceAudioCommand.decode(valid, mainFrame: true, origin: origin, expected: origin).action == .start)
    #expect(throws: (any Error).self) { try VoiceAudioCommand.decode(valid, mainFrame: false, origin: origin, expected: origin) }
    #expect(throws: (any Error).self) { try VoiceAudioCommand.decode(valid, mainFrame: true, origin: URL(string: "https://127.0.0.1:4317")!, expected: origin) }
    #expect(throws: (any Error).self) { try VoiceAudioCommand.decode(["action": "play", "requestId": "a", "sessionId": "s", "generation": 1, "sampleRate": 24000, "pcm": String(repeating: "A", count: 8 * 1024 * 1024 + 1)], mainFrame: true, origin: origin, expected: origin) }
    #expect(throws: (any Error).self) { try VoiceAudioCommand.decode(["action": "play", "requestId": "a", "sessionId": "s", "generation": 1, "url": "file:///private/audio.wav"], mainFrame: true, origin: origin, expected: origin) }
}
