import AppKit
import AudioToolbox
import CoreAudio
import ShuaCrewCore

/// The notch's music bars, live: a private Core Audio tap on Music or Spotify only (never the microphone, never other
/// apps), mixed to mono, measured into five frequency bands, and handed to the notch every display frame — delayed by
/// the output device's own latency, so the bars move with what you hear (AirPods play ~0.2 s after the tap sees it).
/// Levels only: nothing is recorded, stored or sent. Needs macOS's Audio Recording permission (asked once); denied, the
/// tap delivers silence and the meter says so, so the notch can fall back honestly.
@MainActor final class MusicMeter {
    enum State: String { case off, starting, live, denied, unavailable }

    /// Five levels 0…1 (low → high) and the seconds since the last frame, at the display's rate while live.
    var onLevels: (([Float], Float) -> Void)?
    var onState: ((State) -> Void)?
    private(set) var state: State = .off { didSet { if state != oldValue { onState?(state) } } }

    private var app: String?
    private var tap = AudioObjectID(kAudioObjectUnknown)
    private var aggregate = AudioObjectID(kAudioObjectUnknown)
    private var procID: AudioDeviceIOProcID?
    private nonisolated static let ioQueue = DispatchQueue(label: "dev.shuacrew.music-meter.io", qos: .userInteractive)
    private var deniedAt: CFTimeInterval?
    private let setupQueue = DispatchQueue(label: "dev.shuacrew.music-meter.setup", qos: .userInitiated)
    private var ring = SampleRing(capacity: 96_000)
    private var spectrum = MusicSpectrum()
    private var window: [Float] = []
    private var bands: [Float] = []
    private var clock: Timer?
    private var lastTick = CACurrentMediaTime()
    private var startedAt = CACurrentMediaTime()
    private var heardSound = false
    private var delaySamples = 0
    private var lastTotal = 0, lastFresh = CACurrentMediaTime()
    private var generation = 0
    private var retry: DispatchWorkItem?

    private static let bundles: [String: [String]] = ["Music": ["com.apple.Music"], "Spotify": ["com.spotify.client"]]

    /// Start measuring `app` ("Music" / "Spotify"); a different app restarts the tap. Idempotent.
    func start(app: String) {
        guard Self.bundles[app] != nil else { stop(); state = .unavailable; return }
        if self.app == app, state == .starting || state == .live { return }
        // Declined a moment ago: don't ask Core Audio again for every play/pause (a minute later, try again — it may
        // have been a long silent intro rather than a refusal, or you've since allowed it).
        if state == .denied, let at = deniedAt, CACurrentMediaTime() - at < 60 { self.app = app; return }
        stop()
        self.app = app
        state = .starting
        generation += 1
        let gen = generation
        let bundles = Self.bundles[app]!
        setupQueue.async { [weak self] in
            let result = Self.makeTap(bundles: bundles)
            Task { @MainActor in self?.tapReady(result, generation: gen, attempt: 0) }
        }
    }

    func stop() {
        generation += 1
        retry?.cancel(); retry = nil
        clock?.invalidate(); clock = nil
        let (tap, aggregate, proc) = (self.tap, self.aggregate, self.procID)
        self.tap = AudioObjectID(kAudioObjectUnknown); self.aggregate = AudioObjectID(kAudioObjectUnknown); procID = nil
        if aggregate != kAudioObjectUnknown || tap != kAudioObjectUnknown {
            setupQueue.async { Self.teardown(tap: tap, aggregate: aggregate, proc: proc) }
        }
        app = nil
        if state != .denied, state != .unavailable { state = .off }
    }

    // MARK: setup (off the main thread: Core Audio can take tens of ms)

    private struct Tap { var tap: AudioObjectID; var aggregate: AudioObjectID; var proc: AudioDeviceIOProcID; var rate: Double; var latency: Double; var ring: SampleRing }
    private enum Setup { case ready(Tap), notPlaying, failed(String) }

    private func tapReady(_ result: Setup, generation gen: Int, attempt: Int) {
        guard gen == generation else { if case .ready(let t) = result { setupQueue.async { Self.teardown(tap: t.tap, aggregate: t.aggregate, proc: t.proc) } }; return }
        switch result {
        case .ready(let t):
            tap = t.tap; aggregate = t.aggregate; procID = t.proc; ring = t.ring
            spectrum = MusicSpectrum(size: 2048, sampleRate: Float(t.rate))
            delaySamples = Int((t.latency * t.rate).rounded())
            startedAt = CACurrentMediaTime(); lastTick = startedAt; heardSound = false; lastTotal = 0; lastFresh = startedAt
            let timer = Timer(timeInterval: 1.0 / 60, repeats: true) { [weak self] _ in MainActor.assumeIsolated { self?.tick() } }
            timer.tolerance = 0.002
            RunLoop.main.add(timer, forMode: .common)
            clock = timer
            Buddy.appendSelfTest("MUSIC METER tap app=\(app ?? "?") rate=\(Int(t.rate)) latencyMs=\(Int(t.latency * 1000))\n")
        case .notPlaying where attempt < 6:
            // The app hasn't opened its audio output yet (it just started playing): look again shortly.
            let item = DispatchWorkItem { [weak self] in
                guard let self, gen == self.generation, let app = self.app, let bundles = Self.bundles[app] else { return }
                self.setupQueue.async { [weak self] in
                    let r = Self.makeTap(bundles: bundles)
                    Task { @MainActor in self?.tapReady(r, generation: gen, attempt: attempt + 1) }
                }
            }
            retry = item
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5, execute: item)
        case .notPlaying:
            state = .unavailable
        case .failed(let why):
            Buddy.appendSelfTest("MUSIC METER failed \(why)\n")
            state = .unavailable
        }
    }

    private func tick() {
        let now = CACurrentMediaTime()
        let dt = Float(min(0.1, now - lastTick)); lastTick = now
        // No new audio for a moment (the app quit or its output stopped): fall to rest instead of freezing on the
        // last frame. (A paused song keeps arriving as silence, which reads as rest on its own.)
        let total = ring.total
        if total != lastTotal { lastTotal = total; lastFresh = now }
        if now - lastFresh > 0.25 { if heardSound { onLevels?([0, 0, 0, 0, 0], dt) }; return }
        guard ring.read(count: spectrum.size, delay: delaySamples, into: &window) else { return }
        window.withUnsafeBufferPointer { spectrum.bands($0, dt: dt, into: &bands) }
        if spectrum.levelDB > -100 { heardSound = true }
        if heardSound { if state != .live { state = .live } }
        else if now - startedAt > 4 {
            // Playing for 4 s and every sample is digital silence: the Audio Recording permission was declined (macOS
            // hands a denied tap zeros). Say so and stop tapping; the notch shows a labelled "playing" motion.
            Buddy.appendSelfTest("MUSIC METER silent for 4 s → denied\n")
            let keep = app
            stop(); state = .denied; deniedAt = now; app = keep
            return
        }
        onLevels?(bands, dt)
    }

    // MARK: Core Audio

    private nonisolated static func makeTap(bundles: [String]) -> Setup {
        let processes = processObjects(bundlePrefixes: bundles)
        guard !processes.isEmpty else { return .notPlaying }
        guard let clockDevice = clockDevice() else { return .failed("no output device") }
        let description = CATapDescription(stereoMixdownOfProcesses: processes)
        description.uuid = UUID()
        description.name = "ShuaCrew music meter"
        description.isPrivate = true
        description.muteBehavior = .unmuted
        var tap = AudioObjectID(kAudioObjectUnknown)
        var err = AudioHardwareCreateProcessTap(description, &tap)
        guard err == noErr, tap != kAudioObjectUnknown else { return .failed("tap \(err)") }
        var format = AudioStreamBasicDescription()
        var size = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
        var address = AudioObjectPropertyAddress(mSelector: kAudioTapPropertyFormat, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
        err = AudioObjectGetPropertyData(tap, &address, 0, nil, &size, &format)
        guard err == noErr, format.mFormatID == kAudioFormatLinearPCM, format.mFormatFlags & kAudioFormatFlagIsFloat != 0, format.mBitsPerChannel == 32 else {
            AudioHardwareDestroyProcessTap(tap); return .failed("format \(err) \(format.mFormatID) bits=\(format.mBitsPerChannel)")
        }
        // The output device is the aggregate's clock (a tap can't be one). One with a microphone (AirPods, a headset)
        // is never used: running it could switch Bluetooth into its low-quality call mode. clockDevice() picks
        // the default output when it has no input, else the built-in speakers; drift compensation keeps them in step.
        let config: [String: Any] = [
            kAudioAggregateDeviceNameKey: "ShuaCrew Music Meter",
            kAudioAggregateDeviceUIDKey: "dev.shuacrew.music-meter." + UUID().uuidString,
            kAudioAggregateDeviceMainSubDeviceKey: clockDevice.uid,
            kAudioAggregateDeviceIsPrivateKey: true,
            kAudioAggregateDeviceIsStackedKey: false,
            kAudioAggregateDeviceTapAutoStartKey: true,
            kAudioAggregateDeviceSubDeviceListKey: [[kAudioSubDeviceUIDKey: clockDevice.uid]],
            kAudioAggregateDeviceTapListKey: [[kAudioSubTapDriftCompensationKey: true, kAudioSubTapUIDKey: description.uuid.uuidString]],
        ]
        var aggregate = AudioObjectID(kAudioObjectUnknown)
        err = AudioHardwareCreateAggregateDevice(config as CFDictionary, &aggregate)
        guard err == noErr, aggregate != kAudioObjectUnknown else { AudioHardwareDestroyProcessTap(tap); return .failed("aggregate \(err)") }

        let ring = SampleRing(capacity: Int(format.mSampleRate * 2))
        let mix = MonoMix(capacity: 16_384, channels: Int(max(1, format.mChannelsPerFrame)), interleaved: format.mFormatFlags & kAudioFormatFlagIsNonInterleaved == 0)
        var proc: AudioDeviceIOProcID?
        err = AudioDeviceCreateIOProcIDWithBlock(&proc, aggregate, ioQueue) { _, input, _, _, _ in
            mix.push(input, into: ring)
        }
        guard err == noErr, let proc else { teardown(tap: tap, aggregate: aggregate, proc: nil); return .failed("ioproc \(err)") }
        err = AudioDeviceStart(aggregate, proc)
        guard err == noErr else { teardown(tap: tap, aggregate: aggregate, proc: proc); return .failed("start \(err)") }
        // What you hear lags the tap by the real output's latency (the default output, not the clock device).
        let latency = outputLatency(device: defaultOutput() ?? clockDevice.id)
        return .ready(Tap(tap: tap, aggregate: aggregate, proc: proc, rate: format.mSampleRate, latency: latency, ring: ring))
    }

    private nonisolated static func teardown(tap: AudioObjectID, aggregate: AudioObjectID, proc: AudioDeviceIOProcID?) {
        if aggregate != kAudioObjectUnknown {
            if let proc { AudioDeviceStop(aggregate, proc); AudioDeviceDestroyIOProcID(aggregate, proc) }
            AudioHardwareDestroyAggregateDevice(aggregate)
        }
        if tap != kAudioObjectUnknown { AudioHardwareDestroyProcessTap(tap) }
    }

    /// The audio process objects of these apps (an app can have helpers that play its audio, e.g. Spotify's).
    nonisolated static func processObjects(bundlePrefixes: [String]) -> [AudioObjectID] {
        guard let list: [AudioObjectID] = arrayProperty(AudioObjectID(kAudioObjectSystemObject), kAudioHardwarePropertyProcessObjectList) else { return [] }
        return list.filter { id in
            guard let bundle = stringProperty(id, kAudioProcessPropertyBundleID) else { return false }
            return bundlePrefixes.contains { bundle == $0 || bundle.hasPrefix($0 + ".") }
        }
    }

    nonisolated static func defaultOutput() -> AudioObjectID? {
        var id = AudioObjectID(kAudioObjectUnknown), size = UInt32(MemoryLayout<AudioObjectID>.size)
        var address = AudioObjectPropertyAddress(mSelector: kAudioHardwarePropertyDefaultOutputDevice, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
        return AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &id) == noErr && id != kAudioObjectUnknown ? id : nil
    }

    /// An output device with no input streams to clock the tap: the default output if it qualifies, else the built-in speakers.
    nonisolated static func clockDevice() -> (id: AudioObjectID, uid: String)? {
        func hasInput(_ id: AudioObjectID) -> Bool { (arrayProperty(id, kAudioDevicePropertyStreams, scope: kAudioObjectPropertyScopeInput) as [AudioObjectID]?)?.isEmpty == false }
        func hasOutput(_ id: AudioObjectID) -> Bool { (arrayProperty(id, kAudioDevicePropertyStreams, scope: kAudioObjectPropertyScopeOutput) as [AudioObjectID]?)?.isEmpty == false }
        if let id = defaultOutput(), !hasInput(id), let uid = stringProperty(id, kAudioDevicePropertyDeviceUID) { return (id, uid) }
        let devices: [AudioObjectID] = arrayProperty(AudioObjectID(kAudioObjectSystemObject), kAudioHardwarePropertyDevices) ?? []
        let candidates = devices.filter { hasOutput($0) && !hasInput($0) }
        let builtIn = candidates.first { uint32Property($0, kAudioDevicePropertyTransportType) == kAudioDeviceTransportTypeBuiltIn }
        guard let id = builtIn ?? candidates.first, let uid = stringProperty(id, kAudioDevicePropertyDeviceUID) else { return nil }
        return (id, uid)
    }

    /// Seconds between the tap seeing a sample and it leaving the speaker: device + safety offset + buffer + stream.
    nonisolated static func outputLatency(device: AudioObjectID) -> Double {
        let out = kAudioObjectPropertyScopeOutput
        let rate = float64Property(device, kAudioDevicePropertyNominalSampleRate) ?? 48_000
        var frames = Double(uint32Property(device, kAudioDevicePropertyLatency, scope: out) ?? 0)
            + Double(uint32Property(device, kAudioDevicePropertySafetyOffset, scope: out) ?? 0)
            + Double(uint32Property(device, kAudioDevicePropertyBufferFrameSize, scope: out) ?? 0)
        if let stream = (arrayProperty(device, kAudioDevicePropertyStreams, scope: out) as [AudioObjectID]?)?.first {
            frames += Double(uint32Property(stream, kAudioStreamPropertyLatency) ?? 0)
        }
        return min(0.5, max(0, frames / max(1, rate)))
    }

    // MARK: property helpers

    private nonisolated static func address(_ selector: AudioObjectPropertySelector, _ scope: AudioObjectPropertyScope) -> AudioObjectPropertyAddress {
        AudioObjectPropertyAddress(mSelector: selector, mScope: scope, mElement: kAudioObjectPropertyElementMain)
    }
    nonisolated static func arrayProperty<T: FixedWidthInteger>(_ id: AudioObjectID, _ selector: AudioObjectPropertySelector, scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal) -> [T]? {
        var a = address(selector, scope), size: UInt32 = 0
        guard AudioObjectGetPropertyDataSize(id, &a, 0, nil, &size) == noErr else { return nil }
        var list = [T](repeating: 0, count: Int(size) / MemoryLayout<T>.size)
        guard AudioObjectGetPropertyData(id, &a, 0, nil, &size, &list) == noErr else { return nil }
        return list
    }
    nonisolated static func stringProperty(_ id: AudioObjectID, _ selector: AudioObjectPropertySelector) -> String? {
        var a = address(selector, kAudioObjectPropertyScopeGlobal)
        var value: Unmanaged<CFString>?
        var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
        guard AudioObjectGetPropertyData(id, &a, 0, nil, &size, &value) == noErr, let value else { return nil }
        return value.takeRetainedValue() as String
    }
    nonisolated static func uint32Property(_ id: AudioObjectID, _ selector: AudioObjectPropertySelector, scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal) -> UInt32? {
        var a = address(selector, scope), value: UInt32 = 0, size = UInt32(MemoryLayout<UInt32>.size)
        return AudioObjectGetPropertyData(id, &a, 0, nil, &size, &value) == noErr ? value : nil
    }
    nonisolated static func float64Property(_ id: AudioObjectID, _ selector: AudioObjectPropertySelector) -> Double? {
        var a = address(selector, kAudioObjectPropertyScopeGlobal), value: Float64 = 0, size = UInt32(MemoryLayout<Float64>.size)
        return AudioObjectGetPropertyData(id, &a, 0, nil, &size, &value) == noErr ? value : nil
    }
}

/// The IO block's only work: average the tap's channels into one preallocated buffer and hand it to the ring.
/// No allocation, no locks that can wait, no Objective-C.
private final class MonoMix: @unchecked Sendable {
    private let scratch: UnsafeMutablePointer<Float>
    private let capacity: Int, channels: Int, interleaved: Bool
    init(capacity: Int, channels: Int, interleaved: Bool) {
        self.capacity = capacity; self.channels = channels; self.interleaved = interleaved
        scratch = .allocate(capacity: capacity); scratch.initialize(repeating: 0, count: capacity)
    }
    deinit { scratch.deallocate() }
    func push(_ input: UnsafePointer<AudioBufferList>, into ring: SampleRing) {
        let buffers = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: input))
        guard let first = buffers.first, let data = first.mData else { return }
        if interleaved {
            let ch = max(1, Int(first.mNumberChannels))
            let frames = min(capacity, Int(first.mDataByteSize) / (MemoryLayout<Float>.size * ch))
            let samples = data.assumingMemoryBound(to: Float.self)
            let scale = 1 / Float(ch)
            for f in 0..<frames { var sum: Float = 0; for c in 0..<ch { sum += samples[f * ch + c] }; scratch[f] = sum * scale }
            ring.write(scratch, count: frames)
        } else {
            let frames = min(capacity, Int(first.mDataByteSize) / MemoryLayout<Float>.size)
            let count = min(channels, buffers.count)
            for f in 0..<frames { scratch[f] = 0 }
            var used = 0
            for b in 0..<count {
                guard let channel = buffers[b].mData?.assumingMemoryBound(to: Float.self) else { continue }
                for f in 0..<frames { scratch[f] += channel[f] }
                used += 1
            }
            guard used > 0 else { return }
            let scale = 1 / Float(used)
            for f in 0..<frames { scratch[f] *= scale }
            ring.write(scratch, count: frames)
        }
    }
}

/// The music bars at rest, drawn natively right over the page's own (which hide): five Core Animation layers fed
/// straight from the meter. The page re-rendering 60×/s for its bars cost ~14% CPU (measured); this costs the render
/// server a few transforms. The page says where its bars sit and in what colour; hovering hands them back to the page.
final class MusicBarsView: NSView {
    private var bars: [CAGradientLayer] = []
    private var levels: [Float] = [0, 0, 0, 0, 0]
    override func hitTest(_ point: NSPoint) -> NSView? { nil } // never takes a click
    override var isFlipped: Bool { true }                         // page coordinates: top-left origin, like CSS

    override init(frame: NSRect) { super.init(frame: frame); wantsLayer = true; isHidden = true }
    required init?(coder: NSCoder) { nil }

    /// Bar centres and widths (CSS px), their full height, the row's vertical centre, and the tint (0…255 RGB).
    func place(bars specs: [(x: CGFloat, w: CGFloat)], height: CGFloat, centerY: CGFloat, rgb: [CGFloat]) {
        guard let root = layer else { return }
        while bars.count < specs.count { let b = CAGradientLayer(); root.addSublayer(b); bars.append(b) }
        while bars.count > specs.count { bars.removeLast().removeFromSuperlayer() }
        let (r, g, b) = (rgb[safe: 0] ?? 183, rgb[safe: 1] ?? 165, rgb[safe: 2] ?? 255)
        let tint = CGColor(srgbRed: r / 255, green: g / 255, blue: b / 255, alpha: 1)
        // The page's bar: linear-gradient(0deg, tint, color-mix(tint 40%, white)) — tint below, lighter above.
        let light = CGColor(srgbRed: (r * 0.4 + 255 * 0.6) / 255, green: (g * 0.4 + 255 * 0.6) / 255, blue: (b * 0.4 + 255 * 0.6) / 255, alpha: 1)
        CATransaction.begin(); CATransaction.setDisableActions(true)
        for (layer, spec) in zip(bars, specs) {
            layer.bounds = CGRect(x: 0, y: 0, width: spec.w, height: height)
            layer.position = CGPoint(x: spec.x, y: centerY)
            layer.cornerRadius = min(spec.w / 2, 6)
            layer.colors = [light, tint] // flipped view: first colour at the top
            layer.transform = CATransform3DMakeScale(1, 0.12, 1)
        }
        CATransaction.commit()
    }

    /// One meter frame: the same fast-attack / slow-release envelope as the page's bars, then five transforms.
    func show(_ next: [Float], dt: Float) {
        guard !isHidden else { return }
        CATransaction.begin(); CATransaction.setDisableActions(true)
        for i in 0..<min(bars.count, next.count) {
            let target = next[i], current = levels[i]
            levels[i] = current + (target - current) * (1 - exp(-max(0, dt * 1000) / (target > current ? 18 : 110)))
            bars[i].transform = CATransform3DMakeScale(1, CGFloat(0.12 + levels[i] * 0.88), 1)
        }
        CATransaction.commit()
    }

    func reset() { levels = [0, 0, 0, 0, 0] }
}

private extension Array { subscript(safe i: Int) -> Element? { indices.contains(i) ? self[i] : nil } }
