import AVFoundation
import Speech
import ShuaCrewCore

/// "Hey Spark": on-device keyword listening. Uses Apple's speech recognizer with on-device recognition required, so
/// no audio ever leaves the Mac. Opt-in; while it's on macOS shows the microphone indicator.
@MainActor
final class WakeWord {
    static let key = "shuacrew.wakeWord"
    var onWake: (() -> Void)?
    /// Names that wake it, besides "Spark" (your companion's nickname).
    var names: [String] = ["spark"]
    private let engine = AVAudioEngine()
    private var recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var restart: Timer?
    private var cooldownUntil = Date.distantPast
    private(set) var running = false
    var enabled: Bool { UserDefaults.standard.bool(forKey: Self.key) }

    func set(_ on: Bool, completion: @escaping (String?) -> Void) {
        UserDefaults.standard.set(on, forKey: Self.key)
        guard on else { stop(); completion(nil); return }
        SFSpeechRecognizer.requestAuthorization { status in
            Task { @MainActor in
                guard status == .authorized else { UserDefaults.standard.set(false, forKey: Self.key); completion("Turn on Speech Recognition for ShuaCrew in System Settings → Privacy & Security."); return }
                completion(self.start())
            }
        }
    }

    /// Starts listening; returns an error message if it can't.
    @discardableResult func start() -> String? {
        guard !running else { return nil }
        let r = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
        guard let r, r.supportsOnDeviceRecognition else { return "On-device speech recognition isn't available on this Mac." }
        recognizer = r
        let input = engine.inputNode, format = input.outputFormat(forBus: 0)
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 2048, format: format) { [weak self] buffer, _ in self?.request?.append(buffer) }
        engine.prepare()
        do { try engine.start() } catch { input.removeTap(onBus: 0); return "Couldn't open the microphone." }
        running = true
        begin()
        // Recognition tasks are meant to be short; start a fresh one every 50 s so listening never lapses.
        restart = Timer.scheduledTimer(withTimeInterval: 50, repeats: true) { [weak self] _ in Task { @MainActor in self?.begin() } }
        return nil
    }

    func stop() {
        restart?.invalidate(); restart = nil
        task?.cancel(); task = nil; request?.endAudio(); request = nil
        if running { engine.inputNode.removeTap(onBus: 0); engine.stop() }
        running = false
    }

    private func begin() {
        task?.cancel(); request?.endAudio()
        let req = SFSpeechAudioBufferRecognitionRequest()
        req.requiresOnDeviceRecognition = true
        req.shouldReportPartialResults = true
        req.taskHint = .search
        req.contextualStrings = names.map { "hey \($0)" }
        request = req
        task = recognizer?.recognitionTask(with: req) { [weak self] result, _ in
            guard let text = result?.bestTranscription.formattedString else { return }
            Task { @MainActor in self?.heard(text) }
        }
    }

    private func heard(_ text: String) {
        guard Date() > cooldownUntil, WakePhrase.matches(text, names: names) else { return }
        cooldownUntil = Date().addingTimeInterval(4)
        begin() // forget what was said so it doesn't fire twice
        onWake?()
    }
}
