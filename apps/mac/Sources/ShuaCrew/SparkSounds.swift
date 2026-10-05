import AVFoundation
import CoreAudio
import ShuaCrewCore

/// Spark's sounds, played natively: synthesised once (EarconSynth), placed at the notch by Apple's high-quality HRTF
/// renderer with a small room, and played the instant fn is recognised — no web round trip. The engine is woken when
/// fn goes down (so it's running 0.3 s later when the hold starts) and sleeps after a minute of quiet, so a connected
/// AirPods isn't kept busy. A device change (headphones on/off) restarts it cleanly.
@MainActor
final class SparkSounds {
    static let shared = SparkSounds()
    var fnSoundGate = FnSoundGate()
    /// "spatial", "simple" or "off": the page's Settings → Sounds (it tells us when it changes).
    var style = UserDefaults.standard.string(forKey: "sparkSounds") ?? "spatial" { didSet { UserDefaults.standard.set(style, forKey: "sparkSounds") } }
    /// Which instrument (Settings → Sound): glass, pop, chime, pulse, droplet or felt. Switching re-renders the buffers.
    var pack = EarconSynth.Pack(rawValue: UserDefaults.standard.string(forKey: "sparkSoundPack") ?? "") ?? .glass {
        didSet {
            guard pack != oldValue else { return }
            UserDefaults.standard.set(pack.rawValue, forKey: "sparkSoundPack")
            if built { (buffers, spatialBuffers) = Self.render(pack, format) }
        }
    }

    private let engine = AVAudioEngine(), room = AVAudioEnvironmentNode()
    private var spatial: [EarconSynth.Kind: AVAudioPlayerNode] = [:], plain: [EarconSynth.Kind: AVAudioPlayerNode] = [:]
    private var buffers: [EarconSynth.Kind: AVAudioPCMBuffer] = [:], spatialBuffers: [EarconSynth.Kind: AVAudioPCMBuffer] = [:]
    private var built = false, idle: Timer?
    private let format = AVAudioFormat(standardFormatWithSampleRate: 48_000, channels: 1)!

    private init() {
        NotificationCenter.default.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main) { [weak self] _ in
            // Headphones in or out: the engine stops; it starts again on the next sound (or fn press).
            MainActor.assumeIsolated { self?.engine.stop() }
        }
    }

    private func build() {
        guard !built else { return }
        built = true
        let nodes = Self.wire(engine, room, format, pack: pack)
        spatial = nodes.spatial; plain = nodes.plain; buffers = nodes.buffers; spatialBuffers = nodes.spatialBuffers
    }

    /// The graph, on any engine (live, or offline for the self-test): each sound in mono → Apple's HRTF renderer with a
    /// small room (spatial), or straight to the mixer (simple).
    /// Every sound of a pack, as buffers: plain, and a copy +5 dB for the 3-D renderer (it spreads the sound across
    /// both ears), so both styles sound equally loud.
    private static func render(_ pack: EarconSynth.Pack, _ format: AVAudioFormat) -> ([EarconSynth.Kind: AVAudioPCMBuffer], [EarconSynth.Kind: AVAudioPCMBuffer]) {
        var buffers: [EarconSynth.Kind: AVAudioPCMBuffer] = [:], spatialBuffers: [EarconSynth.Kind: AVAudioPCMBuffer] = [:]
        for kind in EarconSynth.Kind.allCases {
            let samples = EarconSynth.render(kind, pack: pack, rate: 48_000)
            guard let buf = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(samples.count)),
                  let loud = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(samples.count)) else { continue }
            buf.frameLength = buf.frameCapacity; loud.frameLength = loud.frameCapacity
            for i in 0..<samples.count { buf.floatChannelData![0][i] = samples[i]; loud.floatChannelData![0][i] = samples[i] * 1.78 }
            buffers[kind] = buf; spatialBuffers[kind] = loud
        }
        return (buffers, spatialBuffers)
    }

    private static func wire(_ engine: AVAudioEngine, _ room: AVAudioEnvironmentNode, _ format: AVAudioFormat, pack: EarconSynth.Pack) -> (spatial: [EarconSynth.Kind: AVAudioPlayerNode], plain: [EarconSynth.Kind: AVAudioPlayerNode], buffers: [EarconSynth.Kind: AVAudioPCMBuffer], spatialBuffers: [EarconSynth.Kind: AVAudioPCMBuffer]) {
        var spatial: [EarconSynth.Kind: AVAudioPlayerNode] = [:], plain: [EarconSynth.Kind: AVAudioPlayerNode] = [:]
        let (buffers, spatialBuffers) = render(pack, format)
        room.renderingAlgorithm = .HRTFHQ
        room.reverbParameters.enable = true
        room.reverbParameters.loadFactoryReverbPreset(.smallRoom)
        room.reverbParameters.level = -12 // a hint of room, not an echo: clearer
        room.listenerPosition = AVAudio3DPoint(x: 0, y: 0, z: 0)
        // Position gives direction, not distance loss: by default the renderer fades sources with distance, which made
        // spatial 6–11 dB quieter than simple (measured). No roll-off, and the room's level matched to simple.
        room.distanceAttenuationParameters.rolloffFactor = 0
        room.outputVolume = 1
        engine.attach(room)
        engine.connect(room, to: engine.mainMixerNode, format: nil)
        for kind in EarconSynth.Kind.allCases {
            let p3 = AVAudioPlayerNode(), p2 = AVAudioPlayerNode()
            engine.attach(p3); engine.attach(p2)
            engine.connect(p3, to: room, format: format)             // mono into the 3-D renderer
            engine.connect(p2, to: engine.mainMixerNode, format: format)
            let at = EarconSynth.position[kind] ?? (0, 1, -1)
            p3.position = AVAudio3DPoint(x: at.x, y: at.y, z: at.z)
            p3.renderingAlgorithm = .HRTFHQ
            p3.reverbBlend = 0.08
            spatial[kind] = p3; plain[kind] = p2
        }
        return (spatial, plain, buffers, spatialBuffers)
    }

    /// Self-test: every sound through the real chain, rendered offline (manual rendering) — peak, clicks (the largest
    /// jump in slope between samples), silent edges — saved as WAVs to audition; then the live delay from play() to the
    /// first sample out, after a warm-up like fn's.
    func selfTest(log: (String) -> Void) async {
        for style in ["spatial", "simple"] {
            for kind in EarconSynth.Kind.allCases {
                let engine = AVAudioEngine(), room = AVAudioEnvironmentNode()
                let out = AVAudioFormat(standardFormatWithSampleRate: 48_000, channels: 2)!
                do { try engine.enableManualRenderingMode(.offline, format: out, maximumFrameCount: 4096) } catch { log("SOUND \(kind) offline mode failed: \(error)"); continue }
                let nodes = Self.wire(engine, room, format, pack: pack)
                guard let node = (style == "simple" ? nodes.plain : nodes.spatial)[kind], let buf = (style == "simple" ? nodes.buffers : nodes.spatialBuffers)[kind] else { continue }
                node.volume = 0.75
                try? engine.start(); node.scheduleBuffer(buf, at: nil, options: [], completionHandler: nil); node.play()
                let total = AVAudioFrameCount(48_000 * 0.9), chunk = AVAudioPCMBuffer(pcmFormat: engine.manualRenderingFormat, frameCapacity: 4096)!
                var left: [Float] = [], right: [Float] = []
                while left.count < Int(total) {
                    guard (try? engine.renderOffline(4096, to: chunk)) == .success else { break }
                    let n = Int(chunk.frameLength)
                    left += Array(UnsafeBufferPointer(start: chunk.floatChannelData![0], count: n)); right += Array(UnsafeBufferPointer(start: chunk.floatChannelData![1], count: n))
                }
                engine.stop()
                var peak: Float = 0, spike: Float = 0
                for ch in [left, right] where ch.count > 2 { for i in 2..<ch.count { peak = max(peak, abs(ch[i])); spike = max(spike, abs(ch[i] - 2 * ch[i - 1] + ch[i - 2])) } }
                let edge = max(abs(left.first ?? 0), abs(right.first ?? 0), abs(left.last ?? 0), abs(right.last ?? 0))
                let db = { (v: Float) in String(format: "%.1f", 20 * log10(max(v, 1e-9))) }
                log("SOUND \(style) \(kind): peak \(db(peak)) dBFS, clicks \(db(spike)) dB (\(String(format: "%.0f", 100 * spike / max(peak, 1e-9)))% of peak), edges \(db(edge)) dB")
                Self.writeWav(left, right, to: NSHomeDirectory() + "/.shuacrew/selftest-sound-\(style)-\(kind).wav")
            }
        }
        // Live: warm up as fn-down does, then play as the hold does. The buffer's "played back" callback fires once its
        // last sample has left the speakers, so (that time − the sound's length) is the real delay to the first sample.
        style = "spatial"; warm()
        try? await Task.sleep(for: .milliseconds(300))
        guard engine.isRunning, let node = spatial[.listen], let buf = spatialBuffers[.listen] else { log("SOUND live: engine not running"); return }
        let length = Double(buf.frameLength) / buf.format.sampleRate
        let t0 = CACurrentMediaTime()
        let finished: Double? = await withCheckedContinuation { done in
            var answered = false
            node.stop(); node.volume = 0.75
            node.scheduleBuffer(buf, at: nil, options: [], completionCallbackType: .dataPlayedBack) { _ in
                let t = CACurrentMediaTime()
                DispatchQueue.main.async { if !answered { answered = true; done.resume(returning: t) } }
            }
            node.play()
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) { if !answered { answered = true; done.resume(returning: nil) } }
        }
        let delay = finished.map { ($0 - t0 - length) * 1000 }
        log("SOUND live: first sample out after \(delay.map { String(format: "%.0f ms", $0) } ?? "— never played") (sound \(String(format: "%.0f ms", length * 1000)) long); device latency \(String(format: "%.0f ms", engine.outputNode.presentationLatency * 1000)); Bluetooth out \(AudioRoute.bluetoothOut()); built-in mic \(AudioRoute.builtInMic() ?? "none")")
    }

    private static func writeWav(_ l: [Float], _ r: [Float], to path: String) {
        let url = URL(fileURLWithPath: path), fmt = AVAudioFormat(standardFormatWithSampleRate: 48_000, channels: 2)!
        guard let buf = AVAudioPCMBuffer(pcmFormat: fmt, frameCapacity: AVAudioFrameCount(l.count)), let file = try? AVAudioFile(forWriting: url, settings: fmt.settings) else { return }
        buf.frameLength = buf.frameCapacity
        l.withUnsafeBufferPointer { buf.floatChannelData![0].update(from: $0.baseAddress!, count: l.count) }
        r.withUnsafeBufferPointer { buf.floatChannelData![1].update(from: $0.baseAddress!, count: r.count) }
        try? file.write(from: buf)
    }

    /// Get ready to play (fn went down, or voice mode is starting): the engine running, so the sound is instant.
    func warm() {
        guard style != "off" else { return }
        build()
        if !engine.isRunning { engine.prepare(); try? engine.start() }
        idle?.invalidate()
        idle = Timer.scheduledTimer(withTimeInterval: 60, repeats: false) { [weak self] _ in MainActor.assumeIsolated { self?.engine.stop() } }
    }

    /// A new Fn hold replaces any prior capture cue instead of layering over it.
    func stopCaptureCues() {
        for kind: EarconSynth.Kind in [.listen, .sent, .off] {
            spatial[kind]?.stop(); plain[kind]?.stop()
        }
    }

    /// Play one sound now, in the chosen style.
    func play(_ kind: EarconSynth.Kind, volume: Float = 0.75) {
        guard style != "off" else { return }
        warm()
        guard engine.isRunning, let buf = (style == "simple" ? buffers : spatialBuffers)[kind], let node = (style == "simple" ? plain : spatial)[kind] else { return }
        node.stop() // the same sound again restarts cleanly rather than stacking
        node.volume = volume
        node.scheduleBuffer(buf, at: nil, options: [])
        node.play()
    }
}

/// Where sound is going: Bluetooth headphones switch to a low-quality call mode the moment their own microphone is
/// opened, so with Bluetooth out Spark listens through the Mac's built-in mic and the headphones stay high quality.
enum AudioRoute {
    private static func property<T>(_ object: AudioObjectID, _ selector: AudioObjectPropertySelector, scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal, _ value: inout T) -> Bool {
        var address = AudioObjectPropertyAddress(mSelector: selector, mScope: scope, mElement: kAudioObjectPropertyElementMain)
        var size = UInt32(MemoryLayout<T>.size)
        return AudioObjectGetPropertyData(object, &address, 0, nil, &size, &value) == noErr
    }
    private static func transport(_ device: AudioDeviceID) -> UInt32 { var t: UInt32 = 0; _ = property(device, kAudioDevicePropertyTransportType, &t); return t }
    private static func name(_ device: AudioDeviceID) -> String? {
        var name: Unmanaged<CFString>?
        guard property(device, kAudioObjectPropertyName, &name), let value = name?.takeRetainedValue() else { return nil }
        return value as String
    }

    /// Is the default output Bluetooth (AirPods, Beats…)?
    static func bluetoothOut() -> Bool {
        var device = AudioDeviceID(0)
        guard property(AudioObjectID(kAudioObjectSystemObject), kAudioHardwarePropertyDefaultOutputDevice, &device) else { return false }
        let t = transport(device)
        return t == kAudioDeviceTransportTypeBluetooth || t == kAudioDeviceTransportTypeBluetoothLE
    }

    /// The Mac's own microphone, by the name the page sees it under ("MacBook Pro Microphone").
    static func builtInMic() -> String? {
        var address = AudioObjectPropertyAddress(mSelector: kAudioHardwarePropertyDevices, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
        var size: UInt32 = 0
        guard AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size) == noErr else { return nil }
        var ids = [AudioDeviceID](repeating: 0, count: Int(size) / MemoryLayout<AudioDeviceID>.size)
        guard AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &ids) == noErr else { return nil }
        for id in ids where transport(id) == kAudioDeviceTransportTypeBuiltIn {
            var streams = AudioObjectPropertyAddress(mSelector: kAudioDevicePropertyStreams, mScope: kAudioObjectPropertyScopeInput, mElement: kAudioObjectPropertyElementMain)
            var bytes: UInt32 = 0
            if AudioObjectGetPropertyDataSize(id, &streams, 0, nil, &bytes) == noErr, bytes > 0, let n = name(id) { return n }
        }
        return nil
    }
}
