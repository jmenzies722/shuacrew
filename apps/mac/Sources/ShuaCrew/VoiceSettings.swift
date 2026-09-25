import AVFoundation
import ShuaCrewCore

/// Local-only speech. Merely opening settings never plays audio or requests the mic.
@MainActor
final class VoiceSettings: NSObject, AVSpeechSynthesizerDelegate {
    private let synthesizer = AVSpeechSynthesizer()
    private var current: AVSpeechUtterance?
    var onSnapshot: ((String) -> Void)?

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    private func voices() -> [LocalVoice] {
        AVSpeechSynthesisVoice.speechVoices().map {
            LocalVoice(id: $0.identifier, name: $0.name, language: $0.language,
                       gender: $0.gender == .male ? "male" : $0.gender == .female ? "female" : "unspecified",
                       quality: $0.quality.rawValue)
        }.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
    }

    func handle(_ body: [String: Any]) {
        let requestID = body["requestId"] as? String ?? ""
        do {
            switch body["action"] as? String {
            case "save":
                let data = try JSONSerialization.data(withJSONObject: body["preferences"] ?? [:])
                let preferences = try JSONDecoder().decode(VoicePreferences.self, from: data)
                guard preferences.voiceID.isEmpty || voices().contains(where: { $0.id == preferences.voiceID }) else {
                    throw NSError(domain: "ShuaCrew", code: 1, userInfo: [NSLocalizedDescriptionKey: "This voice is no longer installed. Refresh and choose another voice."])
                }
                try preferences.save()
                stop()
            case "preview":
                let preferences = VoicePreferences.read()
                guard let selected = preferences.resolvedVoice(in: voices()), let voice = AVSpeechSynthesisVoice(identifier: selected.id) else {
                    throw NSError(domain: "ShuaCrew", code: 1, userInfo: [NSLocalizedDescriptionKey: "No installed speech voice is available on this Mac."])
                }
                stop()
                let utterance = AVSpeechUtterance(string: "Hi, I'm Shua. Let's make some room for your next great idea. You choose the direction, and we'll take it one step at a time.")
                utterance.voice = voice
                utterance.rate = AVSpeechUtteranceDefaultSpeechRate * Float(preferences.speed)
                current = utterance
                synthesizer.speak(utterance)
            case "stop": stop()
            default: break
            }
            snapshot(requestID: requestID)
        } catch { snapshot(requestID: requestID, error: error.localizedDescription) }
    }

    func stop() {
        current = nil
        synthesizer.stopSpeaking(at: .immediate)
    }

    private func snapshot(requestID: String = "", error: String? = nil) {
        struct Snapshot: Encodable {
            let requestId: String
            let preferences: VoicePreferences
            let voices: [LocalVoice]
            let selectedID: String?
            let speaking: Bool
            let error: String?
        }
        let available = voices()
        let preferences = VoicePreferences.read()
        let value = Snapshot(requestId: requestID, preferences: preferences, voices: available,
                             selectedID: preferences.resolvedVoice(in: available)?.id, speaking: current != nil, error: error)
        guard let data = try? JSONEncoder().encode(value), let json = String(data: data, encoding: .utf8) else { return }
        onSnapshot?(json)
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in
            guard current === utterance else { return }
            current = nil
            snapshot()
        }
    }
    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        Task { @MainActor in
            guard current === utterance else { return }
            current = nil
            snapshot()
        }
    }
}
