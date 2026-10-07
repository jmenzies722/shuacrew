import AVFoundation
import CoreImage
import Vision

/// The camera end: every frame — with the microphone, for videos — into the recorder when one is running, and up to
/// 15 a second into Vision (your face, one hand, your whole body) on a queue of its own, so reading you never holds up
/// what's being recorded. Results go to `ShuaEyes` on the main actor; so does anything that stops the camera.
final class EyesFeed: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate, AVCaptureAudioDataOutputSampleBufferDelegate, @unchecked Sendable {
    let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "dev.shuacrew.eyes", qos: .userInitiated)
    private let visionQueue = DispatchQueue(label: "dev.shuacrew.eyes.vision", qos: .userInitiated)
    /// Vision is reading a frame: the next ones go straight past it.
    private var reading = false
    /// Vision's own count and last answers (used only on Vision's queue).
    private var reads = 0
    private var lastFace: CGRect?
    private var lastBody: BodyShape?
    private var trouble: (@Sendable (String?) -> Void)?
    private var watching = false
    private let output = AVCaptureVideoDataOutput()
    private let audioOutput = AVCaptureAudioDataOutput()
    private var videoInput: AVCaptureDeviceInput?
    private var audioInput: AVCaptureDeviceInput?
    private var outputsAdded = false
    private let hands: VNDetectHumanHandPoseRequest = { let r = VNDetectHumanHandPoseRequest(); r.maximumHandCount = 1; return r }()
    private let faces = VNDetectFaceRectanglesRequest()
    private let bodies = VNDetectHumanBodyPoseRequest()
    private let ci = CIContext()
    private var setup = EyesSetup()
    private var deliver: (@Sendable (EyesFrame) -> Void)?
    private var switched: (@Sendable () -> Void)?
    private var tick = 0
    private var recorder: EyesRecorder?
    private var snapWaiter: CheckedContinuation<Data?, Never>?
    private var rotation: AVCaptureDevice.RotationCoordinator?
    private var rotationWatch: NSKeyValueObservation?
    private var pendingAngle: CGFloat?

    static var hasCamera: Bool { AVCaptureDevice.default(for: .video) != nil }

    static func camera(for lens: EyesLens) -> AVCaptureDevice? {
        switch lens {
        case .front: AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front)
        case .back: AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)
        case .backWide: AVCaptureDevice.default(.builtInUltraWideCamera, for: .video, position: .back)
        }
    }

    static func allowed(_ media: AVMediaType) async -> Bool {
        switch AVCaptureDevice.authorizationStatus(for: media) {
        case .authorized: true
        case .notDetermined: await AVCaptureDevice.requestAccess(for: media)
        default: false
        }
    }

    func start(_ setup: EyesSetup, _ deliver: @escaping @Sendable (EyesFrame) -> Void, _ switched: @escaping @Sendable () -> Void,
               _ trouble: @escaping @Sendable (String?) -> Void) {
        queue.async { [self] in
            self.deliver = deliver; self.switched = switched; self.trouble = trouble
            configure(setup)
            watch()
            if !session.isRunning { session.startRunning() }
            if videoInput == nil { trouble("Shua couldn't open that camera.") }
        }
    }

    /// Say what stopped the camera, and start it again when it can.
    private func watch() {
        guard !watching else { return }
        watching = true
        let center = NotificationCenter.default
        center.addObserver(forName: AVCaptureSession.runtimeErrorNotification, object: session, queue: nil) { [weak self] note in
            let error = note.userInfo?[AVCaptureSessionErrorKey] as? AVError
            self?.queue.async {
                guard let self, self.deliver != nil else { return }
                if error?.code != .mediaServicesWereReset { self.trouble?("The camera stopped: \(error?.localizedDescription ?? "unknown error"). Starting it again…") }
                if !self.session.isRunning { self.session.startRunning() }
            }
        }
        center.addObserver(forName: AVCaptureSession.wasInterruptedNotification, object: session, queue: nil) { [weak self] note in
            let reason = (note.userInfo?[AVCaptureSessionInterruptionReasonKey] as? Int).flatMap(AVCaptureSession.InterruptionReason.init(rawValue:))
            self?.trouble?(Self.words(reason))
        }
        center.addObserver(forName: AVCaptureSession.interruptionEndedNotification, object: session, queue: nil) { [weak self] _ in self?.trouble?(nil) }
    }

    static func words(_ reason: AVCaptureSession.InterruptionReason?) -> String? {
        switch reason {
        case .videoDeviceNotAvailableInBackground: nil
        case .videoDeviceInUseByAnotherClient: "Another app is using the camera."
        case .audioDeviceInUseByAnotherClient: "Another app is using the microphone."
        case .videoDeviceNotAvailableWithMultipleForegroundApps: "The camera pauses while another app is on screen with this one."
        case .videoDeviceNotAvailableDueToSystemPressure: "The iPhone is too warm for the camera right now."
        default: "The camera paused."
        }
    }

    /// Another camera or quality. Never mid-recording (the screen doesn't offer it then).
    func apply(_ setup: EyesSetup, _ switched: @escaping @Sendable () -> Void) {
        queue.async { [self] in self.switched = switched; if recorder == nil { configure(setup) } }
    }

    func stop() {
        queue.async { [self] in
            deliver = nil
            recorder?.cancel(); recorder = nil
            snapWaiter?.resume(returning: nil); snapWaiter = nil
            if session.isRunning { session.stopRunning() }
            removeSound()
        }
    }

    private func configure(_ new: EyesSetup) {
        if videoInput != nil, new == setup { return }
        session.beginConfiguration()
        if let v = videoInput { session.removeInput(v); videoInput = nil }
        let camera = Self.camera(for: new.lens) ?? Self.camera(for: .front)
        if let camera, let input = try? AVCaptureDeviceInput(device: camera), session.canAddInput(input) { session.addInput(input); videoInput = input }
        let preset: AVCaptureSession.Preset = new.fourK && session.canSetSessionPreset(.hd4K3840x2160) ? .hd4K3840x2160 : .hd1920x1080
        session.sessionPreset = session.canSetSessionPreset(preset) ? preset : .high
        if !outputsAdded {
            output.alwaysDiscardsLateVideoFrames = true
            output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange]
            output.setSampleBufferDelegate(self, queue: queue)
            if session.canAddOutput(output) { session.addOutput(output) }
            audioOutput.setSampleBufferDelegate(self, queue: queue)
            if session.canAddOutput(audioOutput) { session.addOutput(audioOutput) }
            outputsAdded = true
        }
        if let c = output.connection(with: .video), c.isVideoMirroringSupported {
            c.automaticallyAdjustsVideoMirroring = false
            c.isVideoMirrored = new.lens.mirrored // the front camera reads like a mirror, as on the preview
        }
        session.commitConfiguration()
        setup = new
        if let camera {
            // The lens's widest view: more of you in the shot.
            if (try? camera.lockForConfiguration()) != nil { camera.videoZoomFactor = camera.minAvailableVideoZoomFactor; camera.unlockForConfiguration() }
            // Upright however the phone sits: on its side in desk mode, propped up for filming.
            let coordinator = AVCaptureDevice.RotationCoordinator(device: camera, previewLayer: nil)
            rotation = coordinator
            turn(to: coordinator.videoRotationAngleForHorizonLevelCapture)
            rotationWatch = coordinator.observe(\.videoRotationAngleForHorizonLevelCapture, options: [.new]) { [weak self] c, _ in
                let angle = c.videoRotationAngleForHorizonLevelCapture
                self?.queue.async { self?.turn(to: angle) }
            }
        }
        switched?()
    }

    /// Turning mid-recording would change the picture's shape: it waits until the recording ends.
    private func turn(to angle: CGFloat) {
        guard recorder == nil else { pendingAngle = angle; return }
        guard let c = output.connection(with: .video), c.isVideoRotationAngleSupported(angle) else { return }
        c.videoRotationAngle = angle
    }

    /// The microphone joins for a video (during the 3-2-1, so it's settled when recording starts).
    func withSound() {
        queue.async { [self] in
            guard audioInput == nil, let mic = AVCaptureDevice.default(for: .audio), let input = try? AVCaptureDeviceInput(device: mic) else { return }
            session.beginConfiguration()
            if session.canAddInput(input) { session.addInput(input); audioInput = input }
            session.commitConfiguration()
        }
    }
    /// And leaves after, so talking to Shua has the microphone back.
    func endSound() { queue.async { [self] in if recorder == nil { removeSound() } } }
    private func removeSound() {
        guard let a = audioInput else { return }
        session.beginConfiguration(); session.removeInput(a); session.commitConfiguration()
        audioInput = nil
    }

    func captureOutput(_ from: AVCaptureOutput, didOutput sample: CMSampleBuffer, from connection: AVCaptureConnection) {
        if from === audioOutput { recorder?.appendAudio(sample); return }
        guard let pixels = CMSampleBufferGetImageBuffer(sample) else { return }
        let time = CMSampleBufferGetPresentationTimeStamp(sample)
        recorder?.append(pixels, at: time)
        if let waiter = snapWaiter { snapWaiter = nil; waiter.resume(returning: jpeg(pixels)) }
        tick += 1
        // Up to 15 reads a second, on Vision's own queue; frames that arrive while it's busy just go by.
        guard tick % 2 == 0, !reading, let deliver else { return }
        reading = true
        let frame = Pixels(buffer: pixels), desk = setup.lens == .front // read here, on the camera's queue, where it's set
        visionQueue.async { [self] in
            let seen = read(frame.buffer, at: time.seconds, desk: desk)
            queue.async { self.reading = false }
            deliver(seen)
        }
    }

    /// One frame through Vision. Your hand every time (signs need it); at the desk your face every time and your body
    /// every third read, filming all of you the other way round — about a third less work than reading everything,
    /// with the last answer standing in between.
    private func read(_ pixels: CVPixelBuffer, at time: TimeInterval, desk: Bool) -> EyesFrame {
        reads += 1
        let wantFace = desk || reads % 3 == 0, wantBody = !desk || reads % 3 == 0
        try? VNImageRequestHandler(cvPixelBuffer: pixels, orientation: .up).perform([hands] + (wantFace ? [faces] : []) + (wantBody ? [bodies] : []))
        if wantFace {
            lastFace = faces.results?.max { $0.boundingBox.width * $0.boundingBox.height < $1.boundingBox.width * $1.boundingBox.height }
                .map { b in CGRect(x: b.boundingBox.minX, y: 1 - b.boundingBox.maxY, width: b.boundingBox.width, height: b.boundingBox.height) }
        }
        if wantBody { lastBody = bodies.results?.first.flatMap(BodyShape.init(observation:)) }
        let hand = hands.results?.first.flatMap(HandShape.init(observation:))
        return EyesFrame(time: time, face: lastFace, hand: hand, body: lastBody, size: CGSize(width: CVPixelBufferGetWidth(pixels), height: CVPixelBufferGetHeight(pixels)))
    }

    private func jpeg(_ pixels: CVPixelBuffer) -> Data? {
        ci.jpegRepresentation(of: CIImage(cvPixelBuffer: pixels), colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!, options: [:])
    }

    /// The next frame, as a JPEG.
    func snapshot() async -> Data? {
        await withCheckedContinuation { (c: CheckedContinuation<Data?, Never>) in
            queue.async { [self] in
                guard session.isRunning else { c.resume(returning: nil); return }
                snapWaiter?.resume(returning: nil)
                snapWaiter = c
            }
        }
    }

    func startRecording(_ kind: ShuaEyes.RecordKind, to url: URL) {
        queue.async { [self] in
            let video = output.recommendedVideoSettingsForAssetWriter(writingTo: .mov)
            let audio = kind == .video && audioInput != nil ? audioOutput.recommendedAudioSettingsForAssetWriter(writingTo: .mov) : nil
            recorder = EyesRecorder(url: url, kind: kind, video: video, audio: audio)
        }
    }

    /// The movie and its frame count, or why there isn't one.
    func finishRecording() async -> Result<(URL, Int), RecordingFailed> {
        let r: EyesRecorder? = await withCheckedContinuation { c in
            queue.async { [self] in
                let r = recorder
                recorder = nil
                if let a = pendingAngle { pendingAngle = nil; turn(to: a) }
                c.resume(returning: r)
            }
        }
        guard let r else { return .failure(RecordingFailed(reason: "it never started")) }
        if let done = await r.finish() { return .success(done) }
        return .failure(RecordingFailed(reason: r.failure ?? "no frames came from the camera"))
    }
}

/// A camera frame handed to Vision's queue (the camera won't reuse it while it's held).
private struct Pixels: @unchecked Sendable { let buffer: CVPixelBuffer }

struct RecordingFailed: Error { let reason: String }

extension HandShape {
    init?(observation o: VNHumanHandPoseObservation) {
        guard let all = try? o.recognizedPoints(.all) else { return nil }
        func p(_ j: VNHumanHandPoseObservation.JointName) -> CGPoint? {
            guard let r = all[j], r.confidence > 0.3 else { return nil }
            return CGPoint(x: r.location.x, y: 1 - r.location.y)
        }
        guard let wrist = p(.wrist) else { return nil }
        let tips: [Finger: CGPoint?] = [.thumb: p(.thumbTip), .index: p(.indexTip), .middle: p(.middleTip), .ring: p(.ringTip), .little: p(.littleTip)]
        let mids: [Finger: CGPoint?] = [.thumb: p(.thumbIP), .index: p(.indexPIP), .middle: p(.middlePIP), .ring: p(.ringPIP), .little: p(.littlePIP)]
        let knuckles: [Finger: CGPoint?] = [.thumb: p(.thumbMP), .index: p(.indexMCP), .middle: p(.middleMCP), .ring: p(.ringMCP), .little: p(.littleMCP)]
        self.init(wrist: wrist, tip: tips.compactMapValues { $0 }, mid: mids.compactMapValues { $0 }, knuckle: knuckles.compactMapValues { $0 })
        guard knuckle[.middle] != nil else { return nil }
    }
}

extension BodyShape {
    init?(observation o: VNHumanBodyPoseObservation) {
        guard let all = try? o.recognizedPoints(.all) else { return nil }
        let names: [Joint: VNHumanBodyPoseObservation.JointName] = [
            .nose: .nose, .neck: .neck, .leftShoulder: .leftShoulder, .rightShoulder: .rightShoulder, .leftElbow: .leftElbow,
            .rightElbow: .rightElbow, .leftWrist: .leftWrist, .rightWrist: .rightWrist, .root: .root, .leftHip: .leftHip,
            .rightHip: .rightHip, .leftKnee: .leftKnee, .rightKnee: .rightKnee, .leftAnkle: .leftAnkle, .rightAnkle: .rightAnkle,
        ]
        var joints: [Joint: CGPoint] = [:]
        for (joint, name) in names { if let r = all[name], r.confidence > 0.3 { joints[joint] = CGPoint(x: r.location.x, y: 1 - r.location.y) } }
        guard joints.count >= 4 else { return nil }
        self.init(joints: joints)
    }
}

// MARK: Recording

/// Writes what the camera sees to a movie: a video at its real pace with your voice, or a timelapse — one frame every
/// few seconds played at 30 a second (two hours at a frame every 2 s is two minutes). Used on the camera's queue
/// while it records, then finished once from wherever it was stopped.
final class EyesRecorder: @unchecked Sendable {
    let url: URL
    let kind: ShuaEyes.RecordKind
    private let videoSettings: [String: Any]?
    private let audioSettings: [String: Any]?
    private var writer: AVAssetWriter?
    private var input: AVAssetWriterInput?
    private var audio: AVAssetWriterInput?
    private var adaptor: AVAssetWriterInputPixelBufferAdaptor?
    private var size: CGSize = .zero
    private var start: CMTime?
    private var lastTaken: CMTime?
    private(set) var frames = 0
    private var broken = false
    /// What went wrong, in words, if the movie couldn't be written.
    private(set) var failure: String?

    init(url: URL, kind: ShuaEyes.RecordKind, video: [String: Any]? = nil, audio: [String: Any]? = nil) {
        self.url = url; self.kind = kind; videoSettings = video; audioSettings = kind == .video ? audio : nil
        try? FileManager.default.removeItem(at: url)
    }

    func append(_ pixels: CVPixelBuffer, at time: CMTime) {
        guard !broken else { return }
        let w = CVPixelBufferGetWidth(pixels), h = CVPixelBufferGetHeight(pixels)
        if writer == nil { begin(width: w, height: h, at: time) }
        guard let input, let adaptor, CGSize(width: w, height: h) == size, input.isReadyForMoreMediaData else { return }
        let at: CMTime
        switch kind {
        case .video: at = time // the camera's own clock, shared with the microphone: picture and sound stay in sync
        case .timelapse(let every):
            if let l = lastTaken, (time - l).seconds < every { return }
            lastTaken = time
            at = CMTime(value: CMTimeValue(frames), timescale: 30)
        }
        if adaptor.append(pixels, withPresentationTime: at) { frames += 1 } else if writer?.status == .failed { fail(writer?.error?.localizedDescription ?? "writing failed") }
    }

    private func fail(_ reason: String) { broken = true; if failure == nil { failure = reason } }

    /// Sound from the moment the first frame is in; nothing before it.
    func appendAudio(_ sample: CMSampleBuffer) {
        guard !broken, let audio, let start, CMSampleBufferGetPresentationTimeStamp(sample) >= start, audio.isReadyForMoreMediaData else { return }
        audio.append(sample)
    }

    private func begin(width: Int, height: Int, at time: CMTime) {
        let writer: AVAssetWriter
        do { writer = try AVAssetWriter(outputURL: url, fileType: .mov) } catch { fail(error.localizedDescription); return }
        var settings = videoSettings ?? [AVVideoCodecKey: AVVideoCodecType.h264]
        settings[AVVideoWidthKey] = width; settings[AVVideoHeightKey] = height // the picture as turned upright
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
        input.expectsMediaDataInRealTime = true
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: nil)
        guard writer.canAdd(input) else { fail("the video format wasn't accepted"); return }
        writer.add(input)
        if let audioSettings {
            let a = AVAssetWriterInput(mediaType: .audio, outputSettings: audioSettings)
            a.expectsMediaDataInRealTime = true
            if writer.canAdd(a) { writer.add(a); audio = a }
        }
        guard writer.startWriting() else { fail(writer.error?.localizedDescription ?? "the movie couldn't start"); return }
        let start = kind == .video ? time : .zero
        writer.startSession(atSourceTime: start)
        self.writer = writer; self.input = input; self.adaptor = adaptor; self.start = start; size = CGSize(width: width, height: height)
    }

    /// The finished movie and how many frames it holds, or nil if nothing was captured.
    func finish() async -> (URL, Int)? {
        guard let writer, let input, frames > 0 else { writer?.cancelWriting(); return nil }
        input.markAsFinished(); audio?.markAsFinished()
        await writer.finishWriting()
        if writer.status != .completed { fail(writer.error?.localizedDescription ?? "the movie couldn't be finished") }
        return writer.status == .completed ? (url, frames) : nil
    }

    func cancel() { writer?.cancelWriting() }
}
