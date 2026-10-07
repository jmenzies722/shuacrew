import AVFoundation
import SwiftUI

/// The camera picture itself, mirrored like a selfie and kept upright however the phone sits.
struct CameraLayer: UIViewRepresentable {
    let session: AVCaptureSession
    func makeUIView(context: Context) -> PreviewView { let v = PreviewView(); v.preview.session = session; v.preview.videoGravity = .resizeAspectFill; return v }
    func updateUIView(_ view: PreviewView, context: Context) {}

    final class PreviewView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var preview: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
        private var rotation: AVCaptureDevice.RotationCoordinator?
        private var watch: NSKeyValueObservation?
        override func didMoveToWindow() {
            super.didMoveToWindow()
            guard window != nil, rotation == nil,
                  let camera = (preview.session?.inputs.first as? AVCaptureDeviceInput)?.device else { return }
            let r = AVCaptureDevice.RotationCoordinator(device: camera, previewLayer: preview)
            rotation = r
            preview.connection?.videoRotationAngle = r.videoRotationAngleForHorizonLevelPreview
            watch = r.observe(\.videoRotationAngleForHorizonLevelPreview, options: [.new]) { [weak self] r, _ in
                let angle = r.videoRotationAngleForHorizonLevelPreview
                DispatchQueue.main.async { self?.preview.connection?.videoRotationAngle = angle }
            }
        }
    }
}

/// What Shua sees: you, with your hand traced in your accent as Shua reads it, and a soft box where it finds your face.
struct EyesPreview: View {
    let accent: Color
    var showsFace = false
    private var eyes: ShuaEyes { .shared }
    var body: some View {
        ZStack {
            Color.black
            if eyes.on { CameraLayer(session: eyes.feed.session) }
            Canvas { ctx, box in
                let frame = eyes.frameSize
                guard frame.width > 0 else { return }
                let s = max(box.width / frame.width, box.height / frame.height)
                let w = frame.width * s, h = frame.height * s
                func at(_ p: CGPoint) -> CGPoint { CGPoint(x: p.x * w - (w - box.width) / 2, y: p.y * h - (h - box.height) / 2) }
                if showsFace, let f = eyes.face {
                    let r = CGRect(origin: at(f.origin), size: CGSize(width: f.width * w, height: f.height * h))
                    ctx.stroke(Path(roundedRect: r, cornerRadius: r.width * 0.2), with: .color(.white.opacity(0.35)), lineWidth: 1.5)
                }
                guard let hand = eyes.hand else { return }
                for finger in HandShape.Finger.allCases {
                    let chain = [hand.wrist, hand.knuckle[finger], hand.mid[finger], hand.tip[finger]].compactMap { $0 }.map(at)
                    var bone = Path(); bone.addLines(chain)
                    ctx.stroke(bone, with: .color(accent.opacity(0.9)), style: StrokeStyle(lineWidth: max(2, box.width / 90), lineCap: .round, lineJoin: .round))
                    for p in chain { ctx.fill(Path(ellipseIn: CGRect(x: p.x - 2.5, y: p.y - 2.5, width: 5, height: 5)), with: .color(.white)) }
                }
            }
            .allowsHitTesting(false)
        }
    }
}

/// The eye in the top line: off, an outline; on, a live circle of what Shua sees, ringed in your accent, with a red dot
/// while it records. Tap to open Shua's eyes.
struct EyesButton: View {
    let accent: Color
    let open: () -> Void
    private var eyes: ShuaEyes { .shared }
    var body: some View {
        Button(action: open) {
            ZStack {
                if eyes.on {
                    EyesPreview(accent: accent).clipShape(Circle())
                        .overlay(Circle().strokeBorder(accent.opacity(eyes.present ? 0.9 : 0.35), lineWidth: 2))
                } else {
                    Image(systemName: "eye").font(.system(size: 15, weight: .semibold)).foregroundStyle(.white)
                }
            }
            .frame(width: 40, height: 40)
            .overlay(alignment: .topTrailing) {
                if eyes.recording != nil { Circle().fill(.red).frame(width: 10, height: 10).overlay(Circle().strokeBorder(.black, lineWidth: 1.5)).offset(x: 1, y: -1) }
            }
        }
        .buttonStyle(.plain)
        .glassEffect(.regular.interactive(), in: Circle())
        .accessibilityLabel(eyes.on ? "Shua's eyes are on" : "Shua's eyes")
    }
}

/// Shua's eyes, opened: the camera big, what it reads right now, recording (timelapse or video, into Photos), and
/// the signs it understands — the one you're making lights up.
struct EyesSheet: View {
    @Environment(SparkLink.self) private var link
    @Environment(\.dismiss) private var dismiss
    @AppStorage("shua.eyes.video") private var video = false
    @AppStorage("shua.eyes.every") private var every = 2.0
    private var eyes: ShuaEyes { .shared }
    private var accent: Color { link.look?.accentColor ?? .shuaPurple }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    EyesPreview(accent: accent, showsFace: true)
                        .aspectRatio(eyes.frameSize.width > eyes.frameSize.height ? 4 / 3 : 3 / 4, contentMode: .fit)
                        .frame(maxHeight: 460)
                        .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
                        .overlay(alignment: .bottomLeading) { reading.padding(14) }
                        .overlay(alignment: .topTrailing) { if eyes.recording != nil { rec.padding(14) } }
                        .overlay { if !eyes.on { off } }
                    if let saved = eyes.saved {
                        Label(saved, systemImage: "checkmark.circle.fill").font(.system(size: 15, weight: .medium)).foregroundStyle(.green)
                            .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 6)
                    }
                    recordCard
                    signsCard
                    Text("Everything Shua sees is read on this iPhone and never leaves it. Recordings and snapshots go to your Photos only.")
                        .font(.system(size: 13)).foregroundStyle(Noir.faint).padding(.horizontal, 8)
                }
                .padding(20)
            }
            .scrollIndicators(.hidden)
            .background(NoirBackdrop(mood: eyes.present ? .happy : .idle, accent: accent, focus: UnitPoint(x: 0.5, y: 0.1), reach: 420))
            .navigationTitle("Shua's eyes").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(eyes.on ? "Turn off" : "Turn on") { Task { await eyes.toggle() } }
                }
                ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() }.fontWeight(.semibold) }
            }
        }
        .presentationBackground(.black)
        .alert("Shua's eyes", isPresented: Binding(get: { eyes.problem != nil }, set: { if !$0 { eyes.problem = nil } })) { Button("OK") {} } message: { Text(eyes.problem ?? "") }
    }

    /// What Shua reads right now, on the picture.
    private var reading: some View {
        HStack(spacing: 8) {
            if let sign = eyes.sign { Text(sign.emoji) }
            Text(eyes.sign?.title ?? (eyes.present ? "I can see you" : "Looking for you…")).font(.system(size: 14, weight: .semibold))
            if let since = eyes.deskSince {
                TimelineView(.periodic(from: .now, by: 30)) { _ in Text("· at it \(Plainly.since(Date.now.timeIntervalSince(since)))").font(.system(size: 14)).foregroundStyle(Noir.soft) }
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .glassEffect(.regular, in: Capsule())
        .animation(.smooth(duration: 0.2), value: eyes.sign)
    }

    private var rec: some View {
        HStack(spacing: 6) {
            Circle().fill(.red).frame(width: 8, height: 8)
            if let r = eyes.recording {
                TimelineView(.periodic(from: .now, by: 1)) { ctx in
                    Text(Duration.seconds(ctx.date.timeIntervalSince(r.started)).formatted(.time(pattern: .hourMinuteSecond))).monospacedDigit()
                }
            }
        }
        .font(.system(size: 13, weight: .semibold))
        .padding(.horizontal, 10).padding(.vertical, 6)
        .glassEffect(.regular.tint(.red.opacity(0.3)), in: Capsule())
    }

    private var off: some View {
        VStack(spacing: 14) {
            Image(systemName: "eye.slash").font(.system(size: 34, weight: .light)).foregroundStyle(Noir.soft)
            Text("Let Shua see you").font(Noir.display(22))
            Text("It follows your face and hands, reacts to signs, and can record you working.").font(.system(size: 15)).foregroundStyle(Noir.soft).multilineTextAlignment(.center).padding(.horizontal, 30)
            Button { Task { await eyes.start() } } label: { Label("Turn on", systemImage: "eye").font(Noir.title).padding(.horizontal, 10).padding(.vertical, 4) }
                .buttonStyle(.glassProminent).tint(accent)
        }
    }

    private var recordCard: some View {
        ShuaCard(title: "Record you working", symbol: "record.circle", tint: .red) {
            Picker("Kind", selection: $video) { Text("Timelapse").tag(false); Text("Video").tag(true) }
                .pickerStyle(.segmented).disabled(eyes.recording != nil)
            if !video {
                HStack(spacing: 8) {
                    ForEach([1.0, 2.0, 5.0], id: \.self) { s in
                        Button { every = s } label: { Text("Every \(Int(s)) s").font(.system(size: 14, weight: .semibold)).padding(.horizontal, 12).padding(.vertical, 7) }
                            .buttonStyle(.plain)
                            .glassEffect(every == s ? .regular.tint(accent.opacity(0.6)).interactive() : .regular.interactive(), in: Capsule())
                    }
                }
                .disabled(eyes.recording != nil)
                Text("An hour of you working becomes \(Int(3600 / every / 30)) seconds.").font(.system(size: 14)).foregroundStyle(Noir.soft)
            } else {
                Text("Records you as you are, picture only, until you stop it.").font(.system(size: 14)).foregroundStyle(Noir.soft)
            }
            Button {
                if eyes.recording == nil { eyes.record(video ? .video : .timelapse(every: every)) } else { Task { await eyes.stopRecording() } }
            } label: {
                Label(eyes.recording == nil ? (video ? "Start recording" : "Start timelapse") : "Stop and save to Photos",
                      systemImage: eyes.recording == nil ? "record.circle" : "stop.circle.fill")
                    .font(Noir.title).frame(maxWidth: .infinity).padding(.vertical, 4)
            }
            .buttonStyle(.glassProminent).tint(eyes.recording == nil ? .red : .white).foregroundStyle(eyes.recording == nil ? .white : .black)
            .controlSize(.large).disabled(!eyes.on)
            Button { Task { await eyes.snap() } } label: { Label("Snapshot", systemImage: "camera").font(.system(size: 15, weight: .semibold)).frame(maxWidth: .infinity) }
                .buttonStyle(.glass).disabled(!eyes.on)
        }
    }

    private var signsCard: some View {
        ShuaCard(title: "Signs Shua knows", symbol: "hand.wave.fill", tint: accent) {
            sign("👋", "Wave", "Shua waves back", lit: eyes.moment?.kind == .wave)
            sign("✋", "Hold your palm up", "Shua listens, hands-free", lit: eyes.sign == .open)
            sign("✊", "Make a fist, or lower your hand", "Sends what you said", lit: eyes.sign == .fist)
            sign("👍", "Thumbs up", "Shua cheers", lit: eyes.sign == .thumbsUp)
            sign("☝️", "Point", "Shua's eyes follow your finger", lit: eyes.sign == .point)
            sign("✌️", "Peace sign", "A snapshot, into Photos", lit: eyes.sign == .peace)
        }
    }

    private func sign(_ emoji: String, _ title: String, _ does: String, lit: Bool) -> some View {
        HStack(spacing: 14) {
            Text(emoji).font(.system(size: 26)).frame(width: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(Noir.title).foregroundStyle(lit ? accent : .white)
                Text(does).font(.system(size: 14)).foregroundStyle(Noir.soft)
            }
            Spacer(minLength: 0)
            if lit { Image(systemName: "dot.radiowaves.left.and.right").foregroundStyle(accent).symbolEffect(.variableColor.iterative) }
        }
        .animation(.smooth(duration: 0.2), value: lit)
    }
}

/// How Shua answers what it sees, wherever it's big: waves back, cheers, listens when you hold up a palm and sends
/// when you close your fist or drop your hand, takes a snapshot on a peace sign (with a flash), welcomes you back to
/// the desk, and suggests a break after a long stretch.
struct EyesReactions: ViewModifier {
    @Environment(SparkLink.self) private var link
    let listen: ShuaListen
    @Binding var waves: Int
    let start: () -> Void
    let finish: () -> Void
    @State private var flash = false
    private var eyes: ShuaEyes { .shared }

    func body(content: Content) -> some View {
        content
            .overlay { if flash { Color.white.opacity(0.85).ignoresSafeArea().allowsHitTesting(false).transition(.opacity) } }
            .onChange(of: eyes.moment) { _, m in if let m { react(m.kind) } }
            .onChange(of: listen.listening) { _, now in if !now { eyes.doneTalking() } }
            .sensoryFeedback(.selection, trigger: eyes.moment?.id)
    }

    private func react(_ kind: Moments.Kind) {
        let name = link.look?.firstName.map { ", \($0)" } ?? ""
        switch kind {
        case .wave, .thumbsUp: waves += 1
        case .talk: if !listen.listening { start() }
        case .send: if listen.listening { finish() }
        case .snap:
            withAnimation(.easeOut(duration: 0.08)) { flash = true }
            Task { try? await Task.sleep(for: .milliseconds(120)); withAnimation(.easeIn(duration: 0.35)) { flash = false }; await eyes.snap() }
        case .back(let away):
            waves += 1
            link.note("Welcome back\(name). You were away \(Plainly.since(away)).")
        case .stretch(let minutes):
            link.note("You've been at it \(minutes) minutes\(name). Stand up and stretch for a minute?")
        case .left: break
        }
    }
}
