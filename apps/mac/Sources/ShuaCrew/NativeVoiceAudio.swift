import AppKit
import AVFoundation
import ShuaCrewCore

/// The render callback only copies to a preallocated bounded ring. No dispatch, I/O or UI.
private final class VoiceInputRing: @unchecked Sendable {
    private let lock = NSLock()
    private let storage: UnsafeMutablePointer<Float>
    private let capacity: Int
    private var read = 0, write = 0, count = 0
    private var overflow = false
    init(capacity: Int) { self.capacity = capacity; storage = .allocate(capacity: capacity); storage.initialize(repeating: 0, count: capacity) }
    deinit { storage.deinitialize(count: capacity); storage.deallocate() }
    func offer(_ samples: UnsafePointer<Float>, count incoming: Int) {
        guard lock.try() else { return }
        defer { lock.unlock() }
        guard incoming <= capacity - count else { overflow = true; return }
        for index in 0..<incoming { storage[write] = samples[index]; write = (write + 1) % capacity }
        count += incoming
    }
    func drain() -> (samples: [Float], overflow: Bool) {
        lock.lock(); defer { lock.unlock() }
        var result = [Float](); result.reserveCapacity(count)
        for _ in 0..<count { result.append(storage[read]); read = (read + 1) % capacity }
        count = 0; let lost = overflow; overflow = false
        return (result, lost)
    }
}

/// A single graph owns capture and playback. Creation alone never touches the microphone.
@MainActor final class NativeVoiceAudio {
    var onEvent: (([String: Any]) -> Void)?
    private var state = VoiceAudioState()
    private var sessionId = ""
    private var engine: AVAudioEngine?
    private var player: AVAudioPlayerNode?
    private var ring: VoiceInputRing?
    private var utterance: VoiceUtteranceBuffer?
    private var poll: Timer?
    private var routeObserver: NSObjectProtocol?
    private var sleepObserver: NSObjectProtocol?
    private var rate = 0.0
    private var playbackIDs = Set<String>()
    private var playbackSeconds = 0.0
    private var began = Date()

    init() {
        sleepObserver = NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.willSleepNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.stopForRouteChange("Mac went to sleep. Resume voice when ready.") }
        }
    }
    deinit {
        poll?.invalidate()
        if let routeObserver { NotificationCenter.default.removeObserver(routeObserver) }
        if let sleepObserver { NSWorkspace.shared.notificationCenter.removeObserver(sleepObserver) }
        engine?.stop()
    }
    func handle(_ command: VoiceAudioCommand) {
        if command.action == .cancelStart { if command.sessionId == sessionId { end() }; return }
        if command.action == .start {
            end()
            sessionId = command.sessionId
            let generation = state.start()
            emit("starting", request: command.requestId)
            Task { await start(command, generation: generation) }
            return
        }
        guard command.sessionId == sessionId, let generation = command.generation, state.accepts(generation) else { return }
        switch command.action {
        case .end, .mute: end()
        case .finish: deliver(utterance?.finish())
        case .stopPlayback: stopPlayback()
        case .play:
            do { try play(command) } catch { emit("error", request: command.requestId, extra: ["error": error.localizedDescription]) }
        case .start, .cancelStart: break
        }
    }
    private func start(_ command: VoiceAudioCommand, generation: UInt64) async {
        let allowed: Bool
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized: allowed = true
        case .notDetermined: allowed = await AVCaptureDevice.requestAccess(for: .audio)
        default: allowed = false
        }
        guard state.accepts(generation), command.sessionId == sessionId else { return }
        guard allowed else { emit("error", request: command.requestId, extra: ["error": "Microphone access is off. Enable ShuaCrew in System Settings → Privacy & Security → Microphone."]); end(); return }
        do {
            let graph = AVAudioEngine()
            let input = graph.inputNode
            try input.setVoiceProcessingEnabled(true)
            let format = input.outputFormat(forBus: 0)
            guard input.isVoiceProcessingEnabled, format.channelCount > 0, (8_000...48_000).contains(format.sampleRate), format.commonFormat == .pcmFormatFloat32 else { throw AudioFailure.unavailable }
            rate = format.sampleRate
            let buffer = VoiceInputRing(capacity: Int(rate))
            ring = buffer
            utterance = try VoiceUtteranceBuffer(sampleRate: rate, silence: command.silence)
            let output = AVAudioPlayerNode()
            graph.attach(output)
            guard let mono = AVAudioFormat(standardFormatWithSampleRate: rate, channels: 1) else { throw AudioFailure.unavailable }
            graph.connect(output, to: graph.mainMixerNode, format: mono)
            input.installTap(onBus: 0, bufferSize: 1024, format: format) { pcm, _ in
                if let samples = pcm.floatChannelData?[0] { buffer.offer(samples, count: Int(pcm.frameLength)) }
            }
            engine = graph; player = output
            graph.prepare(); try graph.start(); output.play()
            began = Date()
            routeObserver = NotificationCenter.default.addObserver(forName: .AVAudioEngineConfigurationChange, object: graph, queue: .main) { [weak self] _ in
                Task { @MainActor in guard self?.state.accepts(generation) == true else { return }; self?.stopForRouteChange("Audio device changed. Resume voice to use the new route.") }
            }
            poll = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in Task { @MainActor in self?.drain(generation) } }
            emit("ready", request: command.requestId, extra: ["voiceProcessing": true, "sampleRate": rate, "automaticInterruption": "experimental"])
        } catch {
            emit("error", request: command.requestId, extra: ["error": "Native voice processing is unavailable on this audio route. Choose push-to-talk or reconnect your device."])
            end()
        }
    }
    private func drain(_ generation: UInt64) {
        guard state.accepts(generation), let ring else { return }
        let input = ring.drain()
        if input.overflow { stopForRouteChange("Audio capture fell behind. No partial instruction was sent; resume to retry."); return }
        guard !input.samples.isEmpty else { return }
        let energy = sqrt(input.samples.reduce(Float(0)) { $0 + $1 * $1 } / Float(input.samples.count))
        emit("level", extra: ["level": min(1, energy.isFinite ? energy * 8 : 0)])
        let result = utterance?.append(input.samples)
        if result?.speechStarted == true { emit("speechStarted"); began = Date() }
        if let samples = result?.utterance { deliver(samples); began = Date() }
        if Date().timeIntervalSince(began) > 60 && playbackIDs.isEmpty { stopForRouteChange("Microphone released after inactivity. Resume when ready.") }
    }
    private func deliver(_ samples: [Float]?) {
        guard let samples, state.active else { return }
        let wav = VoiceUtteranceBuffer.wav(samples, sampleRate: Int(rate))
        guard wav.count <= 8 * 1024 * 1024 else { stopForRouteChange("Recording exceeded the safe size. Try a shorter sentence."); return }
        emit("utterance", extra: ["wav": wav.base64EncodedString()])
    }
    private func play(_ command: VoiceAudioCommand) throws {
        guard let pcm = command.pcm, let sourceRate = command.sampleRate, let player,
              playbackIDs.count < 2, !playbackIDs.contains(command.requestId),
              playbackSeconds + Double(pcm.count / 2) / sourceRate <= 20,
              let format = AVAudioFormat(standardFormatWithSampleRate: rate, channels: 1) else { throw AudioFailure.backlog }
        let frames = Int(Double(pcm.count / 2) * rate / sourceRate)
        guard frames > 0, frames <= Int(rate * 20), let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frames)), let target = buffer.floatChannelData?[0] else { throw AudioFailure.unavailable }
        // Bounded mono signed-16 little-endian input; no files or arbitrary decoder paths.
        pcm.withUnsafeBytes { raw in
            let bytes = raw.bindMemory(to: UInt8.self)
            for frame in 0..<frames {
                let index = min(pcm.count / 2 - 1, Int(Double(frame) * sourceRate / rate)) * 2
                target[frame] = Float(Int16(bitPattern: UInt16(bytes[index]) | UInt16(bytes[index + 1]) << 8)) / 32768
            }
        }
        buffer.frameLength = AVAudioFrameCount(frames)
        let seconds = Double(frames) / rate, generation = state.generation, request = command.requestId
        playbackIDs.insert(request); playbackSeconds += seconds
        if !player.isPlaying { player.play() }
        player.scheduleBuffer(buffer, completionCallbackType: .dataPlayedBack) { [weak self] _ in
            Task { @MainActor in
                guard let self, self.state.accepts(generation), self.playbackIDs.remove(request) != nil else { return }
                self.playbackSeconds = max(0, self.playbackSeconds - seconds)
                self.emit("played", request: request)
            }
        }
        emit("playing", request: request)
    }
    private func stopPlayback() { player?.stop(); playbackIDs.removeAll(); playbackSeconds = 0; emit("playbackStopped") }
    func end() {
        let wasActive = state.active
        state.end()
        poll?.invalidate(); poll = nil
        if let routeObserver { NotificationCenter.default.removeObserver(routeObserver) }; routeObserver = nil
        player?.stop(); player = nil
        engine?.stop(); engine?.inputNode.removeTap(onBus: 0); engine = nil
        ring = nil; utterance = nil; playbackIDs.removeAll(); playbackSeconds = 0
        if wasActive { emit("ended") }
    }
    private func stopForRouteChange(_ message: String) { guard state.active else { return }; emit("error", extra: ["error": message]); end() }
    private func emit(_ kind: String, request: String? = nil, extra: [String: Any] = [:]) {
        var body: [String: Any] = ["kind": kind, "sessionId": sessionId, "generation": state.generation]
        if let request { body["requestId"] = request }
        body.merge(extra) { _, new in new }; onEvent?(body)
    }
    private enum AudioFailure: LocalizedError {
        case unavailable, backlog
        var errorDescription: String? { self == .backlog ? "Speech playback is full. Wait for the current sentence." : "This audio format is unavailable." }
    }
}
