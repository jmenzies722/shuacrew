import AVFoundation
import CoreImage
import Photos
import SwiftUI
import Vision

// MARK: What Shua can make out

/// One hand as Vision sees it, in the picture as you see yourself: 0…1 each way, top-left origin, mirrored like a selfie.
struct HandShape: Sendable, Equatable {
    enum Finger: CaseIterable, Sendable { case thumb, index, middle, ring, little }
    var wrist: CGPoint
    /// Each finger's tip, its middle joint (PIP; the thumb's IP) and its knuckle (MCP; the thumb's MP).
    var tip: [Finger: CGPoint]
    var mid: [Finger: CGPoint]
    var knuckle: [Finger: CGPoint]

    /// Wrist to the middle knuckle: every test scales with it, so near and far hands read the same.
    var size: CGFloat { max(0.02, wrist.distance(to: knuckle[.middle] ?? wrist)) }
    /// The middle of the palm.
    var palm: CGPoint { let k = knuckle[.middle] ?? wrist; return CGPoint(x: (wrist.x + k.x) / 2, y: (wrist.y + k.y) / 2) }

    func extended(_ f: Finger) -> Bool {
        guard let t = tip[f], let m = mid[f] else { return false }
        if f == .thumb {
            // Out from the palm: well away from the index knuckle, and further from it than its own joint.
            guard let k = knuckle[.index] else { return false }
            return t.distance(to: k) > size * 0.7 && t.distance(to: k) > m.distance(to: k) * 1.15
        }
        // Straight: the tip is further from the wrist than the middle joint. Curled, it folds back in.
        return wrist.distance(to: t) > wrist.distance(to: m) * 1.12
    }

    /// The sign the hand is making, if it's a clear one.
    var sign: HandSign? {
        let up = Set(Finger.allCases.filter(extended))
        let fingers = up.subtracting([.thumb])
        if fingers.count == 4 { return .open }
        if fingers == [.index] { return .point }
        if fingers == [.index, .middle] { return .peace }
        guard fingers.isEmpty else { return nil }
        // A closed hand with the thumb out and pointing up (y grows downward) is a thumbs up.
        if up.contains(.thumb), let t = tip[.thumb], let k = knuckle[.index], k.y - t.y > size * 0.55 { return .thumbsUp }
        return .fist
    }
}

enum HandSign: String, Sendable, CaseIterable {
    case open, fist, thumbsUp, point, peace
    var title: String {
        switch self { case .open: "Open hand"; case .fist: "Fist"; case .thumbsUp: "Thumbs up"; case .point: "Pointing"; case .peace: "Peace" }
    }
    var emoji: String {
        switch self { case .open: "✋"; case .fist: "✊"; case .thumbsUp: "👍"; case .point: "☝️"; case .peace: "✌️" }
    }
}

extension CGPoint {
    func distance(to p: CGPoint) -> CGFloat { hypot(x - p.x, y - p.y) }
}

/// One look through the camera, handed from the camera's queue to the main actor.
struct EyesFrame: Sendable {
    var time: TimeInterval
    /// Your face (the largest one), 0…1, top-left origin.
    var face: CGRect?
    var hand: HandShape?
    /// The picture's size after it's turned upright: maps points onto a preview.
    var size: CGSize
}

// MARK: Moments

/// The moments Shua reacts to, read from frame after frame: a wave, a palm held up (talk), a fist or a dropped hand
/// (send), a thumbs up, a peace sign (snapshot), you coming back to the desk, and a long stretch without a break.
/// Pure: time goes in, moments come out, so every rule is tested without a camera.
struct Moments {
    enum Kind: Equatable, Sendable { case wave, talk, send, thumbsUp, snap, back(away: TimeInterval), stretch(minutes: Int), left }

    /// Away at least this long and coming back is "welcome back"; shorter is the same stretch at the desk.
    var awayLongEnough: TimeInterval = 120
    /// At it this long without a real break: Shua suggests one.
    var stretchAfter: TimeInterval = 50 * 60
    /// Hands-free talk is running (set by `talk`, cleared by `send`).
    var talking = false
    private(set) var present = false

    private var swings: [(t: TimeInterval, x: CGFloat)] = []
    private var held: (sign: HandSign, since: TimeInterval, x: CGFloat)?
    private var last: [String: TimeInterval] = [:]
    private var seen: TimeInterval?
    private var since: TimeInterval?
    private var nudged = false
    private var handAt: TimeInterval?

    mutating func feed(time t: TimeInterval, face: Bool, hand: HandShape?) -> [Kind] {
        var out: [Kind] = []
        // You're here while Shua can see your face or a hand; gone after 10 s of neither.
        if face || hand != nil {
            if !present {
                present = true
                if let s = seen, t - s >= awayLongEnough { out.append(.back(away: t - s)); since = t; nudged = false }
            }
            if since == nil { since = t }
            seen = t
        } else if present, let s = seen, t - s > 10 {
            present = false; out.append(.left)
        }
        if present, let s = since, !nudged, t - s >= stretchAfter { nudged = true; out.append(.stretch(minutes: Int((t - s) / 60))) }

        if hand != nil { handAt = t }
        let sign = hand?.sign
        // A wave: an open hand swinging side to side, turning at least twice within 1.5 s.
        if sign == .open, let hand {
            swings.append((t, hand.palm.x)); swings.removeAll { t - $0.t > 1.5 }
            if Self.turns(swings, swing: hand.size * 0.35) >= 2, ready("wave", t, gap: 3) { out.append(.wave); swings.removeAll(); held = nil }
        } else { swings.removeAll() }
        // A sign held still. Moving the hand more than half its size starts the count again.
        if let sign, let hand {
            if held?.sign != sign || abs((held?.x ?? 0) - hand.palm.x) > hand.size * 0.5 { held = (sign, t, hand.palm.x) }
        } else if hand == nil { held = nil }
        if let h = held {
            let d = t - h.since
            switch h.sign {
            case .open where d >= 1.0 && !talking:
                if ready("talk", t, gap: 2) { talking = true; out.append(.talk) }
            case .fist where talking && d >= 0.3:
                talking = false; out.append(.send)
            case .thumbsUp where d >= 0.4:
                if ready("thumbs", t, gap: 3) { out.append(.thumbsUp) }
            case .peace where d >= 0.7:
                if ready("snap", t, gap: 4) { out.append(.snap) }
            default: break
            }
        }
        // Hands-free talk also ends when your hand drops out of view.
        if talking, let h = handAt, t - h > 1.2 { talking = false; out.append(.send) }
        return out
    }

    /// Once per `gap` seconds per kind of moment.
    private mutating func ready(_ key: String, _ t: TimeInterval, gap: TimeInterval) -> Bool {
        if let l = last[key], t - l < gap { return false }
        last[key] = t; return true
    }

    /// How many times the hand changed direction, counting only swings of at least `swing`.
    static func turns(_ xs: [(t: TimeInterval, x: CGFloat)], swing: CGFloat) -> Int {
        guard var anchor = xs.first?.x else { return 0 }
        var turns = 0, direction: CGFloat = 0
        for p in xs.dropFirst() {
            let d = p.x - anchor
            if abs(d) >= swing {
                let s: CGFloat = d > 0 ? 1 : -1
                if direction != 0, s != direction { turns += 1 }
                direction = s; anchor = p.x
            } else if (direction > 0 && p.x > anchor) || (direction < 0 && p.x < anchor) {
                anchor = p.x // still going the same way: the swing reaches further
            }
        }
        return turns
    }
}

// MARK: Shua's eyes

/// Shua sees you through the front camera: where your face is (its eyes follow you), your hand and the sign it makes
/// (it leans toward it, waves back, listens when you raise a palm), whether you're at the desk, and it records you
/// working as a timelapse or a video. Everything it sees is read on this iPhone and nothing is sent anywhere;
/// recordings go to your Photos only.
@MainActor @Observable final class ShuaEyes {
    static let shared = ShuaEyes()

    enum RecordKind: Equatable, Sendable { case timelapse(every: TimeInterval), video }
    struct Recording: Equatable { let kind: RecordKind; let started: Date }
    struct Moment: Equatable { let id: Int; let kind: Moments.Kind }

    private(set) var on = false
    private(set) var face: CGRect?
    private(set) var hand: HandShape?
    private(set) var sign: HandSign?
    private(set) var present = false
    private(set) var frameSize: CGSize = .zero
    /// The latest moment (a new id each time), for screens to react to.
    private(set) var moment: Moment?
    private(set) var recording: Recording?
    /// "Timelapse saved to Photos…", for a moment after it saves.
    private(set) var saved: String?
    var problem: String?
    /// Where Shua looks: your pointing fingertip, else your hand, else your face; -1…1 each way, smoothed.
    private(set) var gaze: CGVector?
    /// Where Shua leans: toward your hand, smoothed; zero without one.
    private(set) var lean: CGVector = .zero
    /// When you've been at the desk since (this stretch).
    private(set) var deskSince: Date?

    @ObservationIgnored let feed = EyesFeed()
    @ObservationIgnored private var moments = Moments()
    @ObservationIgnored private var count = 0
    @ObservationIgnored private var wanted = false

    func toggle() async { if on { await stop() } else { await start() } }

    func start() async {
        guard !on else { return }
        wanted = true
        #if DEBUG
        if ProcessInfo.processInfo.environment["SHUA_DEMO"] == "1" { demo(); return }
        #endif
        guard EyesFeed.hasCamera else { problem = "This device has no front camera."; wanted = false; return }
        guard await EyesFeed.cameraAllowed() else { problem = "Shua needs the camera to see you: Settings → ShuaCrew → Camera."; wanted = false; return }
        on = true
        moments = Moments()
        feed.start(Self.delivery(to: self))
    }

    /// Off, for good (until you turn it on again). A recording in progress is finished and saved first.
    func stop() async { wanted = false; await pause() }

    /// Off while the app is in the background; `resume` brings it back if you had it on.
    func pause() async {
        if recording != nil { await stopRecording() }
        feed.stop()
        on = false; face = nil; hand = nil; sign = nil; present = false; gaze = nil; lean = .zero; deskSince = nil
    }
    func resume() async { if wanted, !on { await start() } }

    /// The camera's results arrive here. Made outside the main actor: the camera calls it on its own queue.
    nonisolated private static func delivery(to eyes: ShuaEyes) -> @Sendable (EyesFrame) -> Void {
        { frame in Task { @MainActor in eyes.take(frame) } }
    }

    private func take(_ f: EyesFrame) {
        guard on else { return }
        frameSize = f.size
        face = f.face; hand = f.hand; sign = f.hand?.sign
        let target = (sign == .point ? f.hand?.tip[.index] : nil) ?? f.hand?.palm ?? f.face.map { CGPoint(x: $0.midX, y: $0.midY) }
        if let p = target {
            let v = CGVector(dx: (p.x - 0.5) * 2, dy: (p.y - 0.5) * 2)
            gaze = gaze.map { CGVector(dx: $0.dx * 0.6 + v.dx * 0.4, dy: $0.dy * 0.6 + v.dy * 0.4) } ?? v
        } else { gaze = nil }
        let l = f.hand.map { CGVector(dx: ($0.palm.x - 0.5) * 2, dy: ($0.palm.y - 0.5) * 2) } ?? .zero
        lean = CGVector(dx: lean.dx * 0.7 + l.dx * 0.3, dy: lean.dy * 0.7 + l.dy * 0.3)
        for kind in moments.feed(time: f.time, face: f.face != nil, hand: f.hand) {
            count += 1; moment = Moment(id: count, kind: kind)
            if case .back = kind { deskSince = .now }
        }
        if moments.present, deskSince == nil { deskSince = .now }
        if !moments.present { deskSince = nil }
        present = moments.present
    }

    /// Hands-free talk ended some other way (the button, a reply): the next raised palm starts it again.
    func doneTalking() { moments.talking = false }

    // MARK: Recording

    func record(_ kind: RecordKind) {
        guard on, recording == nil else { return }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("shua-\(Int(Date().timeIntervalSince1970)).mov")
        feed.startRecording(kind, to: url)
        recording = Recording(kind: kind, started: .now)
        saved = nil
        UIApplication.shared.isIdleTimerDisabled = true // the screen stays on while it records
    }

    func stopRecording() async {
        guard let r = recording else { return }
        recording = nil
        UIApplication.shared.isIdleTimerDisabled = false
        guard let (url, frames) = await feed.finishRecording() else { problem = "That recording didn't save: nothing was captured."; return }
        do {
            try await Self.saveVideo(url)
            let lasted = Date.now.timeIntervalSince(r.started)
            switch r.kind {
            case .video: saved = "Saved to Photos: \(Plainly.since(lasted)) of you working."
            case .timelapse: saved = "Timelapse saved to Photos: \(Plainly.since(lasted)) in \(max(1, frames / 30)) s."
            }
        } catch { problem = "Shua couldn't save to Photos. Allow it in Settings → ShuaCrew → Photos." }
    }

    /// A photo of you, right now, into Photos.
    func snap() async {
        guard on, let jpeg = await feed.snapshot() else { return }
        do { try await Self.savePhoto(jpeg); saved = "Snapshot saved to Photos." }
        catch { problem = "Shua couldn't save to Photos. Allow it in Settings → ShuaCrew → Photos." }
    }

    nonisolated private static func saveVideo(_ url: URL) async throws {
        guard await PHPhotoLibrary.requestAuthorization(for: .addOnly) == .authorized else { throw CocoaError(.userCancelled) }
        try await PHPhotoLibrary.shared().performChanges { PHAssetCreationRequest.forAsset().addResource(with: .video, fileURL: url, options: nil) }
        try? FileManager.default.removeItem(at: url)
    }
    nonisolated private static func savePhoto(_ jpeg: Data) async throws {
        guard await PHPhotoLibrary.requestAuthorization(for: .addOnly) == .authorized else { throw CocoaError(.userCancelled) }
        try await PHPhotoLibrary.shared().performChanges { PHAssetCreationRequest.forAsset().addResource(with: .photo, data: jpeg, options: nil) }
    }

    #if DEBUG
    /// Screenshots without a camera: an open hand up and to the right, you in the middle.
    private func demo() {
        on = true; present = true; deskSince = .now.addingTimeInterval(-47 * 60); frameSize = CGSize(width: 720, height: 1280)
        face = CGRect(x: 0.3, y: 0.28, width: 0.4, height: 0.24)
        let w = CGPoint(x: 0.68, y: 0.78)
        func f(_ dx: CGFloat, _ dy: CGFloat) -> CGPoint { CGPoint(x: w.x + dx, y: w.y + dy) }
        hand = HandShape(wrist: w,
                         tip: [.thumb: f(-0.17, -0.1), .index: f(-0.09, -0.3), .middle: f(-0.01, -0.33), .ring: f(0.06, -0.3), .little: f(0.12, -0.23)],
                         mid: [.thumb: f(-0.12, -0.07), .index: f(-0.07, -0.21), .middle: f(-0.01, -0.23), .ring: f(0.05, -0.21), .little: f(0.1, -0.17)],
                         knuckle: [.thumb: f(-0.08, -0.04), .index: f(-0.05, -0.14), .middle: f(0, -0.15), .ring: f(0.04, -0.14), .little: f(0.08, -0.12)])
        sign = hand?.sign; gaze = CGVector(dx: 0.3, dy: 0.1); lean = CGVector(dx: 0.36, dy: 0.2)
    }
    #endif
}

// MARK: The camera

/// The camera end: the front camera into Vision (your face and one hand) about 15 times a second, and every frame
/// into the recorder when one is running. Everything here happens on its own queue; results go to `ShuaEyes`.
final class EyesFeed: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate, @unchecked Sendable {
    let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "dev.shuacrew.eyes", qos: .userInitiated)
    private let output = AVCaptureVideoDataOutput()
    private let hands: VNDetectHumanHandPoseRequest = { let r = VNDetectHumanHandPoseRequest(); r.maximumHandCount = 1; return r }()
    private let faces = VNDetectFaceRectanglesRequest()
    private let ci = CIContext()
    private var configured = false
    private var deliver: (@Sendable (EyesFrame) -> Void)?
    private var tick = 0
    private var recorder: EyesRecorder?
    private var snapWaiter: CheckedContinuation<Data?, Never>?
    private var rotation: AVCaptureDevice.RotationCoordinator?
    private var rotationWatch: NSKeyValueObservation?
    private var pendingAngle: CGFloat?

    static var hasCamera: Bool { AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front) != nil }

    static func cameraAllowed() async -> Bool {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: true
        case .notDetermined: await AVCaptureDevice.requestAccess(for: .video)
        default: false
        }
    }

    func start(_ deliver: @escaping @Sendable (EyesFrame) -> Void) {
        queue.async { [self] in
            self.deliver = deliver
            if !configured { configure() }
            if !session.isRunning { session.startRunning() }
        }
    }

    func stop() {
        queue.async { [self] in
            deliver = nil
            recorder?.cancel(); recorder = nil
            snapWaiter?.resume(returning: nil); snapWaiter = nil
            if session.isRunning { session.stopRunning() }
        }
    }

    private func configure() {
        session.beginConfiguration()
        session.sessionPreset = .hd1280x720
        guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front),
              let input = try? AVCaptureDeviceInput(device: camera), session.canAddInput(input) else { session.commitConfiguration(); return }
        session.addInput(input)
        output.alwaysDiscardsLateVideoFrames = true
        output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange]
        output.setSampleBufferDelegate(self, queue: queue)
        if session.canAddOutput(output) { session.addOutput(output) }
        if let c = output.connection(with: .video), c.isVideoMirroringSupported {
            c.automaticallyAdjustsVideoMirroring = false
            c.isVideoMirrored = true // like a mirror: your right hand is on the right, as on the preview
        }
        session.commitConfiguration()
        // Upright however the phone sits: it lies on its side in desk mode.
        let coordinator = AVCaptureDevice.RotationCoordinator(device: camera, previewLayer: nil)
        rotation = coordinator
        turn(to: coordinator.videoRotationAngleForHorizonLevelCapture)
        rotationWatch = coordinator.observe(\.videoRotationAngleForHorizonLevelCapture, options: [.new]) { [weak self] c, _ in
            let angle = c.videoRotationAngleForHorizonLevelCapture
            self?.queue.async { self?.turn(to: angle) }
        }
        configured = true
    }

    /// Turning mid-recording would change the picture's shape: it waits until the recording ends.
    private func turn(to angle: CGFloat) {
        guard recorder == nil else { pendingAngle = angle; return }
        guard let c = output.connection(with: .video), c.isVideoRotationAngleSupported(angle) else { return }
        c.videoRotationAngle = angle
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sample: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard let pixels = CMSampleBufferGetImageBuffer(sample) else { return }
        let time = CMSampleBufferGetPresentationTimeStamp(sample)
        recorder?.append(pixels, at: time)
        if let waiter = snapWaiter { snapWaiter = nil; waiter.resume(returning: jpeg(pixels)) }
        tick += 1
        guard tick % 2 == 0, let deliver else { return } // Vision at about 15 a second is plenty to follow a hand
        try? VNImageRequestHandler(cvPixelBuffer: pixels, orientation: .up).perform([hands, faces])
        let face = faces.results?.max { $0.boundingBox.width * $0.boundingBox.height < $1.boundingBox.width * $1.boundingBox.height }
            .map { b in CGRect(x: b.boundingBox.minX, y: 1 - b.boundingBox.maxY, width: b.boundingBox.width, height: b.boundingBox.height) }
        let hand = hands.results?.first.flatMap(HandShape.init(observation:))
        deliver(EyesFrame(time: time.seconds, face: face, hand: hand, size: CGSize(width: CVPixelBufferGetWidth(pixels), height: CVPixelBufferGetHeight(pixels))))
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
        queue.async { [self] in recorder = EyesRecorder(url: url, kind: kind) }
    }

    func finishRecording() async -> (URL, Int)? {
        let r: EyesRecorder? = await withCheckedContinuation { c in
            queue.async { [self] in
                let r = recorder
                recorder = nil
                if let a = pendingAngle { pendingAngle = nil; turn(to: a) }
                c.resume(returning: r)
            }
        }
        return await r?.finish()
    }
}

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

// MARK: Recording

/// Writes what the camera sees to a movie: every frame (a recording of you working), or one frame every few seconds
/// played back at 30 a second (a timelapse: two hours at a frame every 2 s is two minutes). Used on the camera's queue
/// while it records, then finished once from wherever it was stopped.
final class EyesRecorder: @unchecked Sendable {
    let url: URL
    let kind: ShuaEyes.RecordKind
    private var writer: AVAssetWriter?
    private var input: AVAssetWriterInput?
    private var adaptor: AVAssetWriterInputPixelBufferAdaptor?
    private var size: CGSize = .zero
    private var first: CMTime?
    private var lastTaken: CMTime?
    private(set) var frames = 0
    private var broken = false

    init(url: URL, kind: ShuaEyes.RecordKind) {
        self.url = url; self.kind = kind
        try? FileManager.default.removeItem(at: url)
    }

    func append(_ pixels: CVPixelBuffer, at time: CMTime) {
        guard !broken else { return }
        let w = CVPixelBufferGetWidth(pixels), h = CVPixelBufferGetHeight(pixels)
        if writer == nil { begin(width: w, height: h) }
        guard let input, let adaptor, CGSize(width: w, height: h) == size, input.isReadyForMoreMediaData else { return }
        let at: CMTime
        switch kind {
        case .video:
            if first == nil { first = time }
            at = time - (first ?? time)
        case .timelapse(let every):
            if let l = lastTaken, (time - l).seconds < every { return }
            lastTaken = time
            at = CMTime(value: CMTimeValue(frames), timescale: 30)
        }
        if adaptor.append(pixels, withPresentationTime: at) { frames += 1 }
    }

    private func begin(width: Int, height: Int) {
        guard let writer = try? AVAssetWriter(outputURL: url, fileType: .mov) else { broken = true; return }
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: width, AVVideoHeightKey: height])
        input.expectsMediaDataInRealTime = true
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: nil)
        guard writer.canAdd(input) else { broken = true; return }
        writer.add(input)
        guard writer.startWriting() else { broken = true; return }
        writer.startSession(atSourceTime: .zero)
        self.writer = writer; self.input = input; self.adaptor = adaptor; size = CGSize(width: width, height: height)
    }

    /// The finished movie and how many frames it holds, or nil if nothing was captured.
    func finish() async -> (URL, Int)? {
        guard let writer, let input, frames > 0 else { writer?.cancelWriting(); return nil }
        input.markAsFinished()
        await writer.finishWriting()
        return writer.status == .completed ? (url, frames) : nil
    }

    func cancel() { writer?.cancelWriting() }
}
