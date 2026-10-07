import AVFoundation
import Observation
import Speech

/// Shua's voice on the phone: replies read aloud with the best voice installed on this iPhone (Premium or Enhanced
/// when you have one). Off with one switch in Settings. `speaking` drives the character's speaking mood.
@MainActor @Observable final class ShuaVoice: NSObject, AVSpeechSynthesizerDelegate {
    static let shared = ShuaVoice()
    private(set) var speaking = false
    var enabled: Bool {
        get { UserDefaults.standard.object(forKey: "shua.voice") as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: "shua.voice"); if !newValue { stop() } }
    }
    @ObservationIgnored private let synth = AVSpeechSynthesizer()
    /// Clips from ShuaCrew's voice engine (WAV), played back to back as they arrive.
    @ObservationIgnored private var clips: [Data] = []
    @ObservationIgnored private var player: AVAudioPlayer?
    @ObservationIgnored private var generation = 0

    override private init() { super.init(); synth.delegate = self }

    @ObservationIgnored private lazy var voice: AVSpeechSynthesisVoice? = {
        let english = AVSpeechSynthesisVoice.speechVoices().filter { $0.language.hasPrefix("en") }
        let preferred = Locale.current.language.languageCode?.identifier == "en" ? Locale.current.identifier.replacingOccurrences(of: "_", with: "-") : "en-US"
        return english.max { a, b in
            (a.quality.rawValue, a.language == preferred ? 1 : 0) < (b.quality.rawValue, b.language == preferred ? 1 : 0)
        } ?? AVSpeechSynthesisVoice(language: "en-US")
    }()

    func say(_ text: String) {
        guard enabled, !text.isEmpty else { return }
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = voice
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 1.04
        synth.stopSpeaking(at: .immediate)
        synth.speak(utterance)
    }

    func stop() { synth.stopSpeaking(at: .immediate); generation += 1; clips = []; player?.stop(); player = nil; if speaking { done() } }

    /// A new reply in Shua's own voice: returns its generation, so late clips from an older reply are dropped.
    func begin() -> Int { stop(); try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.duckOthers]); try? AVAudioSession.sharedInstance().setActive(true); return generation }
    func enqueue(_ clip: Data, generation g: Int) {
        guard enabled, g == generation else { return }
        clips.append(clip)
        if player == nil { playNext() }
    }
    private func playNext() {
        guard !clips.isEmpty else { player = nil; if speaking { done() }; return }
        let clip = clips.removeFirst()
        guard let p = try? AVAudioPlayer(data: clip) else { playNext(); return }
        p.delegate = clipDelegate
        player = p; speaking = true
        p.play()
    }
    @ObservationIgnored private lazy var clipDelegate = ClipDelegate { [weak self] in self?.playNext() }

    nonisolated func speechSynthesizer(_ s: AVSpeechSynthesizer, didStart u: AVSpeechUtterance) { Task { @MainActor in self.speaking = true } }
    nonisolated func speechSynthesizer(_ s: AVSpeechSynthesizer, didFinish u: AVSpeechUtterance) { Task { @MainActor in self.done() } }
    nonisolated func speechSynthesizer(_ s: AVSpeechSynthesizer, didCancel u: AVSpeechUtterance) { Task { @MainActor in self.done() } }
    private func done() { speaking = false; try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation) }
}

/// Tells ShuaVoice a clip ended (AVAudioPlayer calls back on the main thread).
final class ClipDelegate: NSObject, AVAudioPlayerDelegate {
    let next: @MainActor () -> Void
    init(next: @escaping @MainActor () -> Void) { self.next = next }
    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) { MainActor.assumeIsolated { next() } }
    func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) { MainActor.assumeIsolated { next() } }
}

/// Hold to talk: what you say, transcribed live (on this iPhone when it can), handed to Shua when you let go.
@MainActor @Observable final class ShuaListen {
    private(set) var listening = false
    private(set) var heard = ""
    var problem: String?
    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private let recognizer = SFSpeechRecognizer(locale: Locale.current) ?? SFSpeechRecognizer(locale: Locale(identifier: "en-US"))

    func start() async {
        guard !listening else { return }
        problem = nil; heard = ""
        let speech = await Self.speechPermission()
        guard speech == .authorized else { problem = "Allow Speech Recognition for ShuaCrew in Settings to talk to Shua."; return }
        guard await AVAudioApplication.requestRecordPermission() else { problem = "Allow the microphone for ShuaCrew in Settings to talk to Shua."; return }
        guard let recognizer, recognizer.isAvailable else { problem = "Speech recognition isn't available right now."; return }
        ShuaVoice.shared.stop()
        do {
            try AVAudioSession.sharedInstance().setCategory(.record, mode: .measurement, options: .duckOthers)
            try AVAudioSession.sharedInstance().setActive(true, options: .notifyOthersOnDeactivation)
            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }
            self.request = request
            let input = engine.inputNode
            input.removeTap(onBus: 0)
            input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0), block: Self.feed(request))
            engine.prepare()
            try engine.start()
            listening = true
            task = recognizer.recognitionTask(with: request, resultHandler: Self.transcribe { [weak self] text in Task { @MainActor in self?.heard = text } })
        } catch { problem = "Couldn't start the microphone."; finish() }
    }

    /// Stop listening and return what was said (empty if nothing).
    func stop() async -> String {
        guard listening else { return "" }
        request?.endAudio()
        try? await Task.sleep(for: .milliseconds(350)) // let the last words land
        let text = heard.trimmingCharacters(in: .whitespacesAndNewlines)
        finish()
        return text
    }

    // The microphone and the recognizer call back on their own threads: these closures are made outside the main
    // actor so they never inherit its isolation (Swift 6 would stop the app the moment audio arrived).
    /// Measured on the iPhone: TCC answers on a background queue, so this callback must not be main-actor isolated.
    nonisolated private static func speechPermission() async -> SFSpeechRecognizerAuthorizationStatus {
        await withCheckedContinuation { c in SFSpeechRecognizer.requestAuthorization { c.resume(returning: $0) } }
    }
    nonisolated private static func feed(_ request: SFSpeechAudioBufferRecognitionRequest) -> AVAudioNodeTapBlock { { buffer, _ in request.append(buffer) } }
    nonisolated private static func transcribe(_ heard: @escaping @Sendable (String) -> Void) -> (SFSpeechRecognitionResult?, (any Error)?) -> Void {
        { result, _ in if let text = result?.bestTranscription.formattedString { heard(text) } }
    }

    private func finish() {
        engine.stop(); engine.inputNode.removeTap(onBus: 0)
        task?.cancel(); task = nil; request = nil
        listening = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
