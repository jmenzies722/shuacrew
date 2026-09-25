import Foundation

/// Bounded endpointing after native voice processing, not a claim of speech recognition.
public struct VoiceUtteranceBuffer {
    public struct Result { public var speechStarted = false; public var utterance: [Float]? }
    private let rate: Int
    private let silenceFrames: Int
    private var preRoll: [Float]
    private var preIndex = 0
    private var preCount = 0
    private var speech: [Float] = []
    private var loud = 0
    private var quiet = 0
    private var speaking = false
    public var bufferedCount: Int { speaking ? speech.count : preCount }
    public init(sampleRate: Double, silence: Double) throws {
        guard sampleRate.isFinite, (8_000...48_000).contains(sampleRate), [0.45, 0.75, 1.1].contains(silence) else { throw VoiceAudioCommand.Invalid.message }
        rate = Int(sampleRate); silenceFrames = Int(sampleRate * silence)
        preRoll = Array(repeating: 0, count: Int(sampleRate * 0.5))
        speech.reserveCapacity(rate * 30)
    }
    public mutating func append(_ samples: [Float]) -> Result {
        var result = Result()
        // Endpoint by 50ms RMS windows; individual waveform zero crossings are not silence.
        let window = max(1, rate / 20)
        for offset in stride(from: 0, to: min(samples.count, rate * 38), by: window) {
            let end = min(offset + window, samples.count)
            let part = samples[offset..<end]
            let energy = sqrt(part.reduce(Float(0)) { $0 + ($1.isFinite ? $1 * $1 : 0) } / Float(part.count))
            if energy > 0.018 { loud += part.count; quiet = 0 } else { loud = 0; quiet += part.count }
            if !speaking {
                for raw in part { preRoll[preIndex] = raw.isFinite ? max(-1, min(1, raw)) : 0; preIndex = (preIndex + 1) % preRoll.count; preCount = min(preCount + 1, preRoll.count) }
                if loud >= rate / 4 {
                    speaking = true; result.speechStarted = true
                    let start = (preIndex - preCount + preRoll.count) % preRoll.count
                    for index in 0..<preCount { speech.append(preRoll[(start + index) % preRoll.count]) }
                }
            } else {
                speech.append(contentsOf: part.prefix(max(0, rate * 30 - speech.count)).map { $0.isFinite ? max(-1, min(1, $0)) : 0 })
            }
            if speaking && (quiet >= silenceFrames || speech.count >= rate * 30) {
                result.utterance = finish(); return result
            }
        }
        return result
    }
    public mutating func finish() -> [Float]? {
        let result = speaking && !speech.isEmpty ? speech : nil
        speech.removeAll(keepingCapacity: true); preCount = 0; preIndex = 0; loud = 0; quiet = 0; speaking = false
        return result
    }
    public static func wav(_ samples: [Float], sampleRate: Int) -> Data {
        var bytes = Data()
        func word<T: FixedWidthInteger>(_ value: T) { var n = value.littleEndian; withUnsafeBytes(of: &n) { bytes.append(contentsOf: $0) } }
        bytes.append(contentsOf: "RIFF".utf8); word(UInt32(36 + samples.count * 2)); bytes.append(contentsOf: "WAVEfmt ".utf8)
        word(UInt32(16)); word(UInt16(1)); word(UInt16(1)); word(UInt32(sampleRate)); word(UInt32(sampleRate * 2)); word(UInt16(2)); word(UInt16(16))
        bytes.append(contentsOf: "data".utf8); word(UInt32(samples.count * 2))
        for sample in samples { word(Int16((max(-1, min(1, sample.isFinite ? sample : 0)) * 32767).rounded())) }
        return bytes
    }
}
