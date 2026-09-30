import AVFoundation
import Foundation
import Speech

/// Your words as you say them, on this Mac, with Apple's streaming recognizer (SpeechAnalyzer, macOS 26+).
///
/// The page streams the mic frames it already captures; this turns them into live captions and, the moment you stop,
/// a final transcript ~0.1 s later (Whisper takes ~0.85 s). Measured on 20 real Spark asks: Apple made more mistakes
/// (7.9% vs Whisper's 2.8% words wrong) but its confidence flags them — every result at ≥ 0.85 was right — so the page
/// uses this final only when it's confident and falls back to Whisper otherwise. Nothing leaves the Mac.
@MainActor
final class LiveTranscriber {
    /// Live words of the turn in progress (`final` = the finished transcript and its lowest word confidence).
    var onText: ((_ turn: Int, _ text: String) -> Void)?
    private var sessions: [Int: AnyObject] = [:]
    private(set) var ready = false

    /// Load (and, the first time, download) the on-device English model, so the first turn doesn't wait for it.
    func prepare() {
        guard #available(macOS 26, *) else { return }
        Task {
            let module = SpeechTranscriber(locale: Locale(identifier: "en-US"), transcriptionOptions: [], reportingOptions: [.volatileResults, .fastResults], attributeOptions: [.transcriptionConfidence])
            do {
                if let request = try await AssetInventory.assetInstallationRequest(supporting: [module]) { try await request.downloadAndInstall() }
                ready = true
            } catch { ready = false }
        }
    }

    func begin(turn: Int, rate: Double, names: [String]) {
        guard #available(macOS 26, *), ready else { return }
        cancel(turn: turn)
        let s = Session(turn: turn, rate: rate, names: names) { [weak self] text in self?.onText?(turn, text) }
        sessions[turn] = s
    }

    /// 16-bit little-endian mono PCM at the rate given in `begin`.
    func push(turn: Int, pcm: Data) {
        guard #available(macOS 26, *) else { return }
        (sessions[turn] as? Session)?.push(pcm)
    }

    /// Finish the turn: its transcript and the lowest confidence of any word in it (nil if there was no session).
    func end(turn: Int) async -> (text: String, confidence: Double, ms: Int)? {
        guard #available(macOS 26, *), let s = sessions.removeValue(forKey: turn) as? Session else { return nil }
        return await s.finish()
    }

    func cancel(turn: Int) {
        guard #available(macOS 26, *), let s = sessions.removeValue(forKey: turn) as? Session else { return }
        s.cancel()
    }

    /// One line per real turn while calibrating: what Apple heard (and how sure), what Whisper heard, which was used.
    static func log(_ entry: [String: Any]) {
        var e = entry; e["at"] = ISO8601DateFormatter().string(from: Date())
        guard let data = try? JSONSerialization.data(withJSONObject: e), var line = String(data: data, encoding: .utf8) else { return }
        line += "\n"
        let url = URL(fileURLWithPath: NSHomeDirectory() + "/.shuacrew/voice-compare.jsonl")
        if let h = try? FileHandle(forWritingTo: url) { h.seekToEndOfFile(); h.write(line.data(using: .utf8)!); try? h.close() }
        else { try? line.write(to: url, atomically: true, encoding: .utf8) }
    }
}

@available(macOS 26, *)
@MainActor
private final class Session {
    private let module: SpeechTranscriber
    private let analyzer: SpeechAnalyzer
    private let input: AsyncStream<AnalyzerInput>.Continuation
    private let source: AVAudioFormat
    private var converter: AVAudioConverter?
    private var target: AVAudioFormat?
    private var pending: [Data] = []
    private var collector: Task<(String, Double), Never>?
    private var started = false

    init(turn: Int, rate: Double, names: [String], onVolatile: @escaping (String) -> Void) {
        module = SpeechTranscriber(locale: Locale(identifier: "en-US"), transcriptionOptions: [], reportingOptions: [.volatileResults, .fastResults], attributeOptions: [.transcriptionConfidence])
        analyzer = SpeechAnalyzer(modules: [module])
        source = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: rate, channels: 1, interleaved: true)!
        let (stream, continuation) = AsyncStream<AnalyzerInput>.makeStream()
        input = continuation
        let module = self.module, analyzer = self.analyzer
        Task { @MainActor [weak self] in
            // Names it should expect ("Shua", your crew, your ventures), then start listening.
            let context = AnalysisContext()
            context.contextualStrings = [AnalysisContext.ContextualStringsTag("general"): Array((["Shua", "Spark", "ShuaCrew"] + names).prefix(60))]
            try? await analyzer.setContext(context)
            guard let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [module]) else { return }
            guard let self else { return }
            self.target = format
            self.converter = AVAudioConverter(from: self.source, to: format)
            try? await analyzer.start(inputSequence: stream)
            self.started = true
            for chunk in self.pending { self.feed(chunk) }
            self.pending = []
        }
        collector = Task {
            var final = "", lowest = 1.0, volatile = ""
            do {
                for try await r in module.results {
                    let text = String(r.text.characters)
                    if r.isFinal {
                        final += text; volatile = ""
                        for run in r.text.runs { if let c = run.transcriptionConfidence { lowest = min(lowest, c) } }
                    } else { volatile = text }
                    let live = (final + volatile).trimmingCharacters(in: .whitespaces)
                    if !live.isEmpty { await MainActor.run { onVolatile(live) } }
                }
            } catch {}
            return (final.trimmingCharacters(in: .whitespaces), final.isEmpty ? 0 : lowest)
        }
    }

    func push(_ pcm: Data) { if started { feed(pcm) } else { pending.append(pcm) } }

    private func feed(_ pcm: Data) {
        guard let converter, let target, pcm.count >= 2 else { return }
        let frames = AVAudioFrameCount(pcm.count / 2)
        guard let buffer = AVAudioPCMBuffer(pcmFormat: source, frameCapacity: frames) else { return }
        buffer.frameLength = frames
        pcm.withUnsafeBytes { raw in if let dst = buffer.int16ChannelData?[0], let src = raw.baseAddress { memcpy(dst, src, Int(frames) * 2) } }
        let out = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: AVAudioFrameCount(Double(frames) * target.sampleRate / source.sampleRate) + 64)!
        var given = false
        _ = converter.convert(to: out, error: nil) { _, status in
            if given { status.pointee = .noDataNow; return nil }
            given = true; status.pointee = .haveData; return buffer
        }
        if out.frameLength > 0 { input.yield(AnalyzerInput(buffer: out)) }
    }

    func finish() async -> (text: String, confidence: Double, ms: Int) {
        let t0 = Date()
        input.finish()
        if started { try? await analyzer.finalizeAndFinishThroughEndOfInput() } else { await analyzer.cancelAndFinishNow() }
        let (text, conf) = await collector?.value ?? ("", 0)
        return (text, conf, Int(Date().timeIntervalSince(t0) * 1000))
    }

    func cancel() {
        input.finish()
        Task { await analyzer.cancelAndFinishNow() }
        collector?.cancel()
    }
}
