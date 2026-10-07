import AVFoundation
import AudioToolbox
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

/// Your whole body as Vision sees it, in the same picture space as the hand: head to ankles, whatever's in view.
struct BodyShape: Sendable, Equatable {
    enum Joint: CaseIterable, Sendable {
        case nose, neck, leftShoulder, rightShoulder, leftElbow, rightElbow, leftWrist, rightWrist
        case root, leftHip, rightHip, leftKnee, rightKnee, leftAnkle, rightAnkle
    }
    var joints: [Joint: CGPoint]

    static let bones: [(Joint, Joint)] = [
        (.nose, .neck), (.neck, .leftShoulder), (.neck, .rightShoulder), (.leftShoulder, .leftElbow), (.leftElbow, .leftWrist),
        (.rightShoulder, .rightElbow), (.rightElbow, .rightWrist), (.neck, .root), (.root, .leftHip), (.root, .rightHip),
        (.leftHip, .leftKnee), (.leftKnee, .leftAnkle), (.rightHip, .rightKnee), (.rightKnee, .rightAnkle),
    ]

    /// Shoulder to shoulder (or a guess from the neck): swings and margins scale with it.
    var span: CGFloat {
        if let l = joints[.leftShoulder], let r = joints[.rightShoulder] { return max(0.03, l.distance(to: r)) }
        return 0.1
    }
    /// Both hands up above your head: the sign to start or stop recording from across the room.
    var handsUp: Bool {
        guard let top = joints[.nose] ?? joints[.neck], let l = joints[.leftWrist], let r = joints[.rightWrist] else { return false }
        return l.y < top.y && r.y < top.y
    }
    /// A hand raised above its shoulder (waving from a distance), if exactly one is.
    var raisedHand: CGPoint? {
        let l = joints[.leftWrist].flatMap { w in joints[.leftShoulder].flatMap { w.y < $0.y ? w : nil } }
        let r = joints[.rightWrist].flatMap { w in joints[.rightShoulder].flatMap { w.y < $0.y ? w : nil } }
        return l != nil && r != nil ? nil : l ?? r
    }
    /// Where you are in the picture, for Shua's eyes.
    var center: CGPoint? { joints[.neck] ?? joints[.nose] ?? joints[.root] }

    /// How you sit in the picture, for filming yourself head to toe.
    var framing: Framing {
        let ys = joints.values.map(\.y), xs = joints.values.map(\.x)
        guard let top = (joints[.nose] ?? joints[.neck])?.y, let minX = xs.min(), let maxX = xs.max() else { return .lost }
        if top < 0.06 { return .headroom }
        let feet = [joints[.leftAnkle], joints[.rightAnkle]].compactMap { $0 }
        if feet.isEmpty || (ys.max() ?? 1) > 0.97 { return .stepBack }
        if minX < 0.04 || maxX > 0.96 || abs((minX + maxX) / 2 - 0.5) > 0.22 { return .offCenter }
        return .whole
    }
}

/// Whether all of you is in the shot, and what to do if not. Never left/right: the mirror makes those confusing.
enum Framing: Equatable, Sendable {
    case whole, stepBack, headroom, offCenter, lost
    var advice: String {
        switch self {
        case .whole: "You're all in the shot"
        case .stepBack: "Step back so I can see your feet"
        case .headroom: "Tilt the phone up a little: your head's cut off"
        case .offCenter: "Step toward the middle"
        case .lost: "Step into the shot"
        }
    }
}

/// One look through the camera, handed from the camera's queue to the main actor.
struct EyesFrame: Sendable {
    var time: TimeInterval
    /// Your face (the largest one), 0…1, top-left origin.
    var face: CGRect?
    var hand: HandShape?
    var body: BodyShape?
    /// The picture's size after it's turned upright: maps points onto a preview.
    var size: CGSize
}

// MARK: Moments

/// The moments Shua reacts to, read from frame after frame: a wave (a hand close up, or an arm from across the room),
/// a palm held up (talk), a fist or a dropped hand (send), a thumbs up, a peace sign (snapshot), both hands up (start
/// or stop recording), you coming back to the desk, and a long stretch without a break. Pure: time goes in, moments
/// come out, so every rule is tested without a camera.
struct Moments {
    enum Kind: Equatable, Sendable { case wave, talk, send, thumbsUp, snap, handsUp, back(away: TimeInterval), stretch(minutes: Int), left }

    /// Away at least this long and coming back is "welcome back"; shorter is the same stretch at the desk.
    var awayLongEnough: TimeInterval = 120
    /// At it this long without a real break: Shua suggests one.
    var stretchAfter: TimeInterval = 50 * 60
    /// Hands-free talk is running (set by `talk`, cleared by `send`).
    var talking = false
    private(set) var present = false

    private var swings: [(t: TimeInterval, x: CGFloat)] = []
    private var armSwings: [(t: TimeInterval, x: CGFloat)] = []
    private var held: (sign: HandSign, since: TimeInterval, x: CGFloat)?
    private var upSince: TimeInterval?
    private var last: [String: TimeInterval] = [:]
    private var seen: TimeInterval?
    private var since: TimeInterval?
    private var nudged = false
    private var handAt: TimeInterval?

    mutating func feed(time t: TimeInterval, face: Bool, hand: HandShape?, body: BodyShape? = nil) -> [Kind] {
        var out: [Kind] = []
        // You're here while Shua can see your face, a hand or your body; gone after 10 s of none.
        if face || hand != nil || body != nil {
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

        // Both hands up, held a moment: start or stop recording (the camera screen decides which).
        if body?.handsUp == true {
            if upSince == nil { upSince = t }
            if let u = upSince, t - u >= 0.6, ready("up", t, gap: 3) { out.append(.handsUp) }
        } else { upSince = nil }

        if hand != nil { handAt = t }
        let sign = hand?.sign
        // A wave close up: an open hand swinging side to side, turning at least twice within 1.5 s.
        if sign == .open, let hand {
            swings.append((t, hand.palm.x)); swings.removeAll { t - $0.t > 1.5 }
            if Self.turns(swings, swing: hand.size * 0.35) >= 2, ready("wave", t, gap: 3) { out.append(.wave); swings.removeAll(); held = nil }
        } else { swings.removeAll() }
        // A wave from across the room: one arm up, swinging.
        if hand == nil, let body, let w = body.raisedHand {
            armSwings.append((t, w.x)); armSwings.removeAll { t - $0.t > 1.6 }
            if Self.turns(armSwings, swing: body.span * 0.3) >= 2, ready("wave", t, gap: 3) { out.append(.wave); armSwings.removeAll() }
        } else { armSwings.removeAll() }

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

/// Which camera Shua looks through. The back cameras film better; the 0.5× fits all of you from a step or two away.
enum EyesLens: String, CaseIterable, Sendable, Identifiable {
    case front, back, backWide
    var id: String { rawValue }
    var title: String { switch self { case .front: "Front"; case .back: "1×"; case .backWide: "0.5×" } }
    var mirrored: Bool { self == .front }
}

/// What the camera is set to: the lens and 1080p or 4K.
struct EyesSetup: Equatable, Sendable, Codable {
    var lens: EyesLens = .front
    var fourK = false
}
extension EyesLens: Codable {}

/// What a press of the shutter makes.
enum EyesMode: String, CaseIterable, Identifiable, Sendable {
    case video, timelapse, photo
    var id: String { rawValue }
    var title: String { switch self { case .video: "Video"; case .timelapse: "Timelapse"; case .photo: "Photo" } }
}

/// Shua sees you through the camera: where your face and body are (its eyes follow you), your hand and the sign it
/// makes (it leans toward it, waves back, listens when you raise a palm), whether you're at the desk and in the shot,
/// and it films you: videos with sound for content, timelapses of you working, photos. Everything it sees is read on
/// this iPhone and nothing is sent anywhere; what it records goes to your Photos only.
@MainActor @Observable final class ShuaEyes {
    static let shared = ShuaEyes()

    enum RecordKind: Equatable, Sendable { case timelapse(every: TimeInterval), video }
    struct Recording: Equatable { let kind: RecordKind; let started: Date }
    struct Moment: Equatable { let id: Int; let kind: Moments.Kind }

    private(set) var on = false
    private(set) var face: CGRect?
    private(set) var hand: HandShape?
    private(set) var body: BodyShape?
    private(set) var sign: HandSign?
    private(set) var present = false
    private(set) var frameSize: CGSize = .zero
    /// The latest moment (a new id each time), for screens to react to.
    private(set) var moment: Moment?
    private(set) var recording: Recording?
    /// 3, 2, 1 before a recording starts, so you can get into place.
    private(set) var countdown: Int?
    /// "Saved to Photos…", for a moment after it saves.
    private(set) var saved: String?
    var problem: String?
    /// Where Shua looks: your pointing fingertip, else your hand, face or body; -1…1 each way, smoothed.
    private(set) var gaze: CGVector?
    /// Where Shua leans: toward your hand (or raised arm), smoothed; zero without one.
    private(set) var lean: CGVector = .zero
    /// When you've been at the desk since (this stretch).
    private(set) var deskSince: Date?
    /// Bumped once the camera has switched, so the preview follows the new lens.
    private(set) var generation = 0

    /// The camera, the shutter's mode and the timelapse pace, kept between launches.
    var setup: EyesSetup = EyesSetup(lens: EyesLens(rawValue: UserDefaults.standard.string(forKey: "shua.eyes.lens") ?? "") ?? .front,
                                     fourK: UserDefaults.standard.bool(forKey: "shua.eyes.4k")) {
        didSet {
            UserDefaults.standard.set(setup.lens.rawValue, forKey: "shua.eyes.lens"); UserDefaults.standard.set(setup.fourK, forKey: "shua.eyes.4k")
            if on, setup != oldValue { feed.apply(setup, Self.switched(to: self)) }
        }
    }
    var mode: EyesMode = EyesMode(rawValue: UserDefaults.standard.string(forKey: "shua.eyes.mode") ?? "") ?? .video {
        didSet { UserDefaults.standard.set(mode.rawValue, forKey: "shua.eyes.mode") }
    }
    var every: Double = UserDefaults.standard.object(forKey: "shua.eyes.every") as? Double ?? 2 {
        didSet { UserDefaults.standard.set(every, forKey: "shua.eyes.every") }
    }

    @ObservationIgnored let feed = EyesFeed()
    @ObservationIgnored private var moments = Moments()
    @ObservationIgnored private var count = 0
    @ObservationIgnored private var wanted = false
    @ObservationIgnored private var counting: Task<Void, Never>?

    func toggle() async { if on { await stop() } else { await start() } }

    func start() async {
        guard !on else { return }
        wanted = true
        #if DEBUG
        if ProcessInfo.processInfo.environment["SHUA_DEMO"] == "1" { demo(); return }
        #endif
        guard EyesFeed.hasCamera else { problem = "This device has no camera Shua can use."; wanted = false; return }
        guard await EyesFeed.allowed(.video) else { problem = "Shua needs the camera to see you: Settings → ShuaCrew → Camera."; wanted = false; return }
        on = true
        moments = Moments()
        feed.start(setup, Self.delivery(to: self), Self.switched(to: self))
    }

    /// Off, for good (until you turn it on again). A recording in progress is finished and saved first.
    func stop() async { wanted = false; await pause() }

    /// Off while the app is in the background; `resume` brings it back if you had it on.
    func pause() async {
        counting?.cancel(); counting = nil; countdown = nil
        if recording != nil { await stopRecording() }
        feed.stop()
        on = false; face = nil; hand = nil; body = nil; sign = nil; present = false; gaze = nil; lean = .zero; deskSince = nil
    }
    func resume() async { if wanted, !on { await start() } }

    /// The camera's results arrive here. Made outside the main actor: the camera calls them on its own queue.
    nonisolated private static func delivery(to eyes: ShuaEyes) -> @Sendable (EyesFrame) -> Void {
        { frame in Task { @MainActor in eyes.take(frame) } }
    }
    nonisolated private static func switched(to eyes: ShuaEyes) -> @Sendable () -> Void {
        { Task { @MainActor in eyes.generation += 1 } }
    }

    private func take(_ f: EyesFrame) {
        guard on else { return }
        frameSize = f.size
        face = f.face; hand = f.hand; body = f.body; sign = f.hand?.sign
        let target = (sign == .point ? f.hand?.tip[.index] : nil) ?? f.hand?.palm ?? f.face.map { CGPoint(x: $0.midX, y: $0.midY) } ?? f.body?.center
        if let p = target {
            let v = CGVector(dx: (p.x - 0.5) * 2, dy: (p.y - 0.5) * 2)
            gaze = gaze.map { CGVector(dx: $0.dx * 0.6 + v.dx * 0.4, dy: $0.dy * 0.6 + v.dy * 0.4) } ?? v
        } else { gaze = nil }
        let toward = f.hand?.palm ?? f.body?.raisedHand
        let l = toward.map { CGVector(dx: ($0.x - 0.5) * 2, dy: ($0.y - 0.5) * 2) } ?? .zero
        lean = CGVector(dx: lean.dx * 0.7 + l.dx * 0.3, dy: lean.dy * 0.7 + l.dy * 0.3)
        for kind in moments.feed(time: f.time, face: f.face != nil, hand: f.hand, body: f.body) {
            count += 1; moment = Moment(id: count, kind: kind)
            if case .back = kind { deskSince = .now }
        }
        if moments.present, deskSince == nil { deskSince = .now }
        if !moments.present { deskSince = nil }
        present = moments.present
    }

    /// Hands-free talk ended some other way (the button, a reply): the next raised palm starts it again.
    func doneTalking() { moments.talking = false }

    // MARK: The shutter

    /// The shutter, in the current mode: a photo now, or a recording after a 3-2-1 (or stop the one that's running).
    func shutter() {
        if recording != nil { Task { await stopRecording() }; return }
        if counting != nil { counting?.cancel(); counting = nil; countdown = nil; feed.endSound(); return }
        switch mode {
        case .photo: Task { await snap() }
        case .video: begin(.video)
        case .timelapse: begin(.timelapse(every: every))
        }
    }

    /// 3, 2, 1 — with a tick and a tap each second — then rolling. Sound is switched on during the count.
    private func begin(_ kind: RecordKind) {
        guard on, recording == nil, counting == nil else { return }
        counting = Task {
            if kind == .video {
                guard await EyesFeed.allowed(.audio) else { problem = "Videos record your voice too: allow the microphone in Settings → ShuaCrew."; counting = nil; return }
                feed.withSound()
            }
            for n in [3, 2, 1] {
                countdown = n
                UIImpactFeedbackGenerator(style: .rigid).impactOccurred()
                AudioServicesPlaySystemSound(1104)
                try? await Task.sleep(for: .seconds(1))
                if Task.isCancelled { countdown = nil; return }
            }
            countdown = nil; counting = nil
            record(kind)
        }
    }

    func record(_ kind: RecordKind) {
        guard on, recording == nil else { return }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("shua-\(Int(Date().timeIntervalSince1970)).mov")
        feed.startRecording(kind, to: url)
        recording = Recording(kind: kind, started: .now)
        saved = nil
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        UIApplication.shared.isIdleTimerDisabled = true // the screen stays on while it records
    }

    func stopRecording() async {
        guard let r = recording else { return }
        recording = nil
        UIApplication.shared.isIdleTimerDisabled = false
        let result = await feed.finishRecording()
        feed.endSound()
        guard let (url, frames) = result else { problem = "That recording didn't save: nothing was captured."; return }
        do {
            try await Self.saveVideo(url)
            let lasted = Date.now.timeIntervalSince(r.started)
            switch r.kind {
            case .video: saved = "Video saved to Photos: \(Plainly.since(lasted))."
            case .timelapse: saved = "Timelapse saved to Photos: \(Plainly.since(lasted)) in \(max(1, frames / 30)) s."
            }
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        } catch { problem = "Shua couldn't save to Photos. Allow it in Settings → ShuaCrew → Photos." }
    }

    /// A photo, right now, into Photos.
    func snap() async {
        guard on, let jpeg = await feed.snapshot() else { return }
        AudioServicesPlaySystemSound(1108) // the shutter sound
        do { try await Self.savePhoto(jpeg); saved = "Photo saved to Photos." }
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
    /// Screenshots without a camera: you standing a little left of centre, waving with your right hand.
    private func demo() {
        on = true; present = true; deskSince = .now.addingTimeInterval(-47 * 60); frameSize = CGSize(width: 1080, height: 1920)
        face = CGRect(x: 0.42, y: 0.15, width: 0.14, height: 0.08)
        body = BodyShape(joints: [.nose: CGPoint(x: 0.49, y: 0.2), .neck: CGPoint(x: 0.49, y: 0.27), .leftShoulder: CGPoint(x: 0.4, y: 0.28),
                                  .rightShoulder: CGPoint(x: 0.58, y: 0.28), .leftElbow: CGPoint(x: 0.37, y: 0.4), .rightElbow: CGPoint(x: 0.66, y: 0.22),
                                  .leftWrist: CGPoint(x: 0.38, y: 0.5), .rightWrist: CGPoint(x: 0.7, y: 0.12), .root: CGPoint(x: 0.49, y: 0.52),
                                  .leftHip: CGPoint(x: 0.44, y: 0.52), .rightHip: CGPoint(x: 0.54, y: 0.52), .leftKnee: CGPoint(x: 0.44, y: 0.68),
                                  .rightKnee: CGPoint(x: 0.55, y: 0.68), .leftAnkle: CGPoint(x: 0.44, y: 0.84), .rightAnkle: CGPoint(x: 0.56, y: 0.84)])
        gaze = CGVector(dx: 0.1, dy: -0.3); lean = CGVector(dx: 0.3, dy: -0.4)
    }
    #endif
}
