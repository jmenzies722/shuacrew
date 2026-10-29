// Apple speech worker: the Mac's own voices (Premium, Enhanced and Siri) through AVSpeechSynthesizer, rendered to WAV
// rather than played, so Spark's queue keeps one timeline (barge-in, captions and echo metering all still work).
// Same JSON-line protocol as worker.py; stdout carries protocol only. Compiled on first use by apple-speech.ts.
import AVFoundation
import Foundation

let output = FileHandle.standardOutput
func send(_ value: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: value) else { return }
    output.write(data + Data("\n".utf8))
}

/// English voices above the default quality: the ones worth a conversation.
func voices() -> [[String: Any]] {
    AVSpeechSynthesisVoice.speechVoices()
        .filter { $0.language.hasPrefix("en") && $0.quality != .default }
        .map { ["identifier": $0.identifier, "name": $0.name, "language": $0.language, "quality": $0.quality == .premium ? "premium" : "enhanced",
                "gender": $0.gender == .male ? "male" : $0.gender == .female ? "female" : "unspecified"] }
}

/// 16-bit mono PCM in a WAV container, whatever format the voice renders in.
func wav(_ buffers: [AVAudioPCMBuffer]) -> Data? {
    guard let format = buffers.first?.format else { return nil }
    var pcm = Data()
    for buffer in buffers where buffer.frameLength > 0 {
        let frames = Int(buffer.frameLength)
        if let floats = buffer.floatChannelData?[0] {
            for i in 0..<frames { var s = Int16(max(-1, min(1, floats[i])) * 32767).littleEndian; pcm.append(Data(bytes: &s, count: 2)) }
        } else if let ints = buffer.int16ChannelData?[0] {
            pcm.append(Data(bytes: ints, count: frames * 2))
        } else if let ints = buffer.int32ChannelData?[0] {
            for i in 0..<frames { var s = Int16(truncatingIfNeeded: ints[i] >> 16).littleEndian; pcm.append(Data(bytes: &s, count: 2)) }
        }
    }
    guard !pcm.isEmpty else { return nil }
    let rate = UInt32(format.sampleRate)
    var header = Data()
    func u32(_ v: UInt32) { var x = v.littleEndian; header.append(Data(bytes: &x, count: 4)) }
    func u16(_ v: UInt16) { var x = v.littleEndian; header.append(Data(bytes: &x, count: 2)) }
    header.append(Data("RIFF".utf8)); u32(UInt32(36 + pcm.count)); header.append(Data("WAVEfmt ".utf8))
    u32(16); u16(1); u16(1); u32(rate); u32(rate * 2); u16(2); u16(16)
    header.append(Data("data".utf8)); u32(UInt32(pcm.count))
    return header + pcm
}

let synthesizer = AVSpeechSynthesizer()

func speak(_ request: [String: Any]) {
    let id = request["id"] as? String ?? ""
    guard let identifier = request["voiceId"] as? String, let voice = AVSpeechSynthesisVoice(identifier: identifier) else {
        return send(["id": id, "type": "error", "error": "That Apple voice isn't installed."])
    }
    let text = (request["text"] as? String) ?? ""
    let speed = (request["speed"] as? Double) ?? 1
    // A warmup loads the voice without sending audio back.
    let warmup = request["warmup"] as? Bool ?? false
    let utterance = AVSpeechUtterance(string: warmup ? "Hi." : text)
    utterance.voice = voice
    utterance.rate = min(AVSpeechUtteranceMaximumSpeechRate, AVSpeechUtteranceDefaultSpeechRate * Float(speed))
    var buffers: [AVAudioPCMBuffer] = []
    synthesizer.write(utterance) { buffer in
        guard let pcm = buffer as? AVAudioPCMBuffer else { return }
        if pcm.frameLength > 0 { buffers.append(pcm); return }
        // A zero-length buffer marks the end of the utterance.
        if !warmup, let data = wav(buffers) { send(["id": id, "type": "audio", "data": data.base64EncodedString()]) }
        send(["id": id, "type": "done"])
    }
}

send(["type": "ready"])
DispatchQueue.global().async {
    while let line = readLine() {
        guard let data = line.data(using: .utf8), let request = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { continue }
        DispatchQueue.main.async {
            if request["type"] as? String == "list" { send(["type": "voices", "voices": voices()]) } else { speak(request) }
        }
    }
    // Behind the work already queued on main, so a listing asked just before stdin closed still gets its answer.
    DispatchQueue.main.async { exit(0) }
}
RunLoop.main.run()
