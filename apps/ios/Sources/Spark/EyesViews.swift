import AVFoundation
import SwiftUI

/// The camera picture itself, kept upright however the phone sits (the front camera mirrored, like a mirror).
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
                  let camera = preview.session?.inputs.compactMap({ ($0 as? AVCaptureDeviceInput)?.device }).first(where: { $0.hasMediaType(.video) }) else { return }
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

/// What Shua sees: you, with your body traced in white and your hand in your accent as Shua reads them.
struct EyesPreview: View {
    let accent: Color
    var showsBody = false
    private var eyes: ShuaEyes { .shared }
    var body: some View {
        ZStack {
            Color.black
            if eyes.on { CameraLayer(session: eyes.feed.session).id(eyes.generation) } // a new lens: a new preview
            Canvas { ctx, box in
                let frame = eyes.frameSize
                guard frame.width > 0 else { return }
                let s = max(box.width / frame.width, box.height / frame.height)
                let w = frame.width * s, h = frame.height * s
                func at(_ p: CGPoint) -> CGPoint { CGPoint(x: p.x * w - (w - box.width) / 2, y: p.y * h - (h - box.height) / 2) }
                let line = max(2, box.width / 110)
                if showsBody, let body = eyes.body {
                    var bones = Path()
                    for (a, b) in BodyShape.bones { if let p = body.joints[a], let q = body.joints[b] { bones.move(to: at(p)); bones.addLine(to: at(q)) } }
                    ctx.stroke(bones, with: .color(.white.opacity(0.75)), style: StrokeStyle(lineWidth: line, lineCap: .round, lineJoin: .round))
                    for p in body.joints.values.map(at) { ctx.fill(Path(ellipseIn: CGRect(x: p.x - line, y: p.y - line, width: line * 2, height: line * 2)), with: .color(accent)) }
                }
                guard let hand = eyes.hand else { return }
                for finger in HandShape.Finger.allCases {
                    let chain = [hand.wrist, hand.knuckle[finger], hand.mid[finger], hand.tip[finger]].compactMap { $0 }.map(at)
                    var bone = Path(); bone.addLines(chain)
                    ctx.stroke(bone, with: .color(accent.opacity(0.95)), style: StrokeStyle(lineWidth: line, lineCap: .round, lineJoin: .round))
                    for p in chain { ctx.fill(Path(ellipseIn: CGRect(x: p.x - 2.5, y: p.y - 2.5, width: 5, height: 5)), with: .color(.white)) }
                }
            }
            .allowsHitTesting(false)
        }
    }
}

/// The eye in the top line: off, an outline; on, a live circle of what Shua sees, ringed in your accent, with a red dot
/// while it records. Tap to open the camera.
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
                    Image(systemName: "camera").font(.system(size: 15, weight: .semibold)).foregroundStyle(.white)
                }
            }
            .frame(width: 40, height: 40)
            .overlay(alignment: .topTrailing) {
                if eyes.recording != nil { Circle().fill(.red).frame(width: 10, height: 10).overlay(Circle().strokeBorder(.black, lineWidth: 1.5)).offset(x: 1, y: -1) }
            }
        }
        .buttonStyle(.plain)
        .glassEffect(.regular.interactive(), in: Circle())
        .accessibilityLabel(eyes.on ? "Shua's camera, on" : "Shua's camera")
    }
}

/// Shua's camera, full screen, for filming yourself: any lens (0.5× gets all of you from a couple of steps away),
/// 1080p or 4K, video with sound, timelapse or photo. Shua coaches the framing out loud on screen ("step back so I can
/// see your feet"), counts you in 3-2-1, rolls your script on a teleprompter, and starts or stops when you raise both
/// hands — so you never walk back to the phone. Shua sits in the corner, watching and waving back.
struct ShuaCam: View {
    @Environment(SparkLink.self) private var link
    @Environment(\.dismiss) private var dismiss
    let listen: ShuaListen
    @State private var waves = 0
    @State private var scripting = false
    @State private var guide = false
    @AppStorage("shua.script") private var script = ""
    @AppStorage("shua.script.on") private var prompter = false
    @AppStorage("shua.script.speed") private var speed = 26.0
    private var eyes: ShuaEyes { .shared }
    private var accent: Color { link.look?.accentColor ?? .shuaPurple }
    private var rolling: Bool { eyes.recording != nil }

    var body: some View {
        @Bindable var eyes = eyes
        ZStack {
            EyesPreview(accent: accent, showsBody: true).ignoresSafeArea()
            if eyes.on, eyes.mode != .timelapse, let body = eyes.body { FrameGuide(whole: body.framing == .whole).padding(.horizontal, 22).padding(.top, 108).padding(.bottom, 190).allowsHitTesting(false) }
            VStack(spacing: 12) {
                topBar
                status
                if prompter, !script.isEmpty, eyes.mode == .video { Prompter(text: script, rolling: eyes.recording?.started, speed: speed) }
                Spacer(minLength: 0)
                said
                modes
                HStack(alignment: .center) {
                    Button { scripting = true } label: { Image(systemName: "text.alignleft").font(.system(size: 18, weight: .semibold)).frame(width: 52, height: 52) }
                        .buttonStyle(.plain).glassEffect(prompter && !script.isEmpty ? .regular.tint(accent.opacity(0.5)).interactive() : .regular.interactive(), in: Circle())
                        .accessibilityLabel("Script")
                        .frame(maxWidth: .infinity)
                    Shutter(mode: eyes.mode, rolling: rolling, counting: eyes.countdown != nil) { eyes.shutter() }
                    ZStack(alignment: .bottom) {
                        ShuaFloor(accent: accent).scaleEffect(0.35).offset(y: 6)
                        ShuaCharacter(mood: mood, tilt: eyes.gaze ?? .zero, lively: 0.7, lean: eyes.lean, waves: waves).frame(width: 64, height: 64)
                    }
                    .frame(maxWidth: .infinity)
                }
                Text(hint).font(.system(size: 12, weight: .medium)).foregroundStyle(.white.opacity(0.7)).multilineTextAlignment(.center)
            }
            .padding(.horizontal, 18).padding(.bottom, 8)
            if let n = eyes.countdown {
                Text("\(n)").font(.system(size: 150, weight: .bold)).monospacedDigit().foregroundStyle(.white)
                    .shadow(color: .black.opacity(0.5), radius: 20).id(n).transition(.scale(scale: 1.6).combined(with: .opacity))
            }
            if !eyes.on { off }
        }
        .background(Color.black.ignoresSafeArea())
        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: eyes.countdown)
        .animation(.smooth(duration: 0.3), value: eyes.recording)
        .preferredColorScheme(.dark)
        .statusBarHidden()
        .persistentSystemOverlays(.hidden)
        .task { await eyes.start() }
        .onChange(of: eyes.moment) { _, m in
            guard let m else { return }
            switch m.kind {
            case .handsUp: if eyes.mode == .photo { Task { await eyes.snap() } } else { eyes.shutter() } // start or stop from across the room
            case .wave, .thumbsUp: waves += 1
            default: break
            }
        }
        .sheet(isPresented: $scripting) { ScriptSheet(script: $script, on: $prompter, speed: $speed) }
        .sheet(isPresented: $guide) { SignsSheet() }
        .alert("Shua's camera", isPresented: Binding(get: { eyes.problem != nil }, set: { if !$0 { eyes.problem = nil } })) { Button("OK") {} } message: { Text(eyes.problem ?? "") }
    }

    private var topBar: some View {
        @Bindable var eyes = eyes
        return HStack(spacing: 10) {
            Button { dismiss() } label: { Image(systemName: "xmark").font(.system(size: 15, weight: .semibold)).frame(width: 40, height: 40) }
                .buttonStyle(.plain).glassEffect(.regular.interactive(), in: Circle()).accessibilityLabel("Close the camera")
            Spacer()
            HStack(spacing: 2) {
                ForEach(EyesLens.allCases.filter { EyesFeed.camera(for: $0) != nil || ProcessInfo.processInfo.environment["SHUA_DEMO"] == "1" }) { lens in
                    Button { eyes.setup.lens = lens } label: {
                        Text(lens.title).font(.system(size: 13, weight: .bold)).frame(minWidth: 40).padding(.vertical, 8)
                            .foregroundStyle(eyes.setup.lens == lens ? .black : .white)
                            .background(eyes.setup.lens == lens ? AnyShapeStyle(.white) : AnyShapeStyle(.clear), in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(3).glassEffect(.regular, in: Capsule()).disabled(rolling)
            Button { eyes.setup.fourK.toggle() } label: { Text(eyes.setup.fourK ? "4K" : "HD").font(.system(size: 13, weight: .heavy)).frame(width: 40, height: 40) }
                .buttonStyle(.plain).glassEffect(.regular.interactive(), in: Circle()).disabled(rolling)
                .accessibilityLabel(eyes.setup.fourK ? "4K, tap for HD" : "HD, tap for 4K")
            Spacer()
            Button { guide = true } label: { Image(systemName: "hand.raised").font(.system(size: 15, weight: .semibold)).frame(width: 40, height: 40) }
                .buttonStyle(.plain).glassEffect(.regular.interactive(), in: Circle()).accessibilityLabel("Signs Shua knows")
        }
    }

    /// Recording time, or how you sit in the shot, or what was just saved.
    @ViewBuilder private var status: some View {
        if let r = eyes.recording {
            HStack(spacing: 8) {
                Circle().fill(.red).frame(width: 9, height: 9)
                TimelineView(.periodic(from: .now, by: 1)) { ctx in
                    Text(Duration.seconds(ctx.date.timeIntervalSince(r.started)).formatted(.time(pattern: .hourMinuteSecond))).monospacedDigit()
                }
                if case .timelapse(let every) = r.kind { Text("· a frame every \(Int(every)) s").foregroundStyle(.white.opacity(0.7)) }
            }
            .font(.system(size: 15, weight: .semibold))
            .padding(.horizontal, 14).padding(.vertical, 8)
            .glassEffect(.regular.tint(.red.opacity(0.35)), in: Capsule())
        } else if let saved = eyes.saved {
            Label(saved, systemImage: "checkmark.circle.fill").font(.system(size: 14, weight: .semibold)).foregroundStyle(.white)
                .padding(.horizontal, 14).padding(.vertical, 8).glassEffect(.regular.tint(.green.opacity(0.35)), in: Capsule())
        } else if eyes.on {
            let framing = eyes.body?.framing ?? .lost
            HStack(spacing: 8) {
                Image(systemName: framing == .whole ? "checkmark.circle.fill" : "figure.stand").foregroundStyle(framing == .whole ? .green : .white)
                Text(framing.advice)
                Text(shape).foregroundStyle(.white.opacity(0.6))
            }
            .font(.system(size: 14, weight: .semibold))
            .padding(.horizontal, 14).padding(.vertical, 8).glassEffect(.regular, in: Capsule())
            .animation(.smooth(duration: 0.25), value: framing)
        }
    }

    /// What Shua is saying (or hearing) while you film.
    @ViewBuilder private var said: some View {
        let line: String? = listen.listening ? (listen.heard.isEmpty ? "I'm listening…" : listen.heard)
            : link.asking ? "On it…"
            : link.chat.last(where: { $0.role == .shua }).flatMap { Date.now.timeIntervalSince($0.at) < 20 ? SparkLink.speakable($0.text) : nil }
        if let line, !line.isEmpty {
            Text(line).font(.system(size: 15, weight: .medium)).lineLimit(2).multilineTextAlignment(.center)
                .padding(.horizontal, 16).padding(.vertical, 10).glassEffect(.regular, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                .transition(.opacity)
        }
    }

    private var modes: some View {
        @Bindable var eyes = eyes
        return HStack(spacing: 22) {
            ForEach(EyesMode.allCases) { m in
                Button { withAnimation(.smooth) { eyes.mode = m } } label: {
                    Text(m.title.uppercased()).font(.system(size: 13, weight: .bold)).tracking(1.2)
                        .foregroundStyle(eyes.mode == m ? Color.yellow : .white.opacity(0.75))
                }
                .buttonStyle(.plain)
            }
        }
        .disabled(rolling || eyes.countdown != nil)
        .opacity(rolling ? 0.4 : 1)
        .padding(.vertical, 4)
    }

    private var off: some View {
        VStack(spacing: 14) {
            Image(systemName: "camera").font(.system(size: 34, weight: .light)).foregroundStyle(Noir.soft)
            Text("Let Shua see you").font(Noir.display(22))
            Text("It sees all of you, coaches the shot, and films you: videos with sound, timelapses, photos.")
                .font(.system(size: 15)).foregroundStyle(Noir.soft).multilineTextAlignment(.center).padding(.horizontal, 30)
            Button { Task { await eyes.start() } } label: { Label("Turn on", systemImage: "camera").font(Noir.title).padding(.horizontal, 10).padding(.vertical, 4) }
                .buttonStyle(.glassProminent).tint(accent)
        }
    }

    private var shape: String {
        let s = eyes.frameSize
        guard s.width > 0 else { return "" }
        return s.width > s.height ? "· 16:9" : "· 9:16"
    }
    private var hint: String {
        if rolling { return "Raise both hands to stop" }
        switch eyes.mode {
        case .video: return "Raise both hands to start · ✌️ photo · 👋 say hi"
        case .timelapse: return "Raise both hands to start · a frame every \(Int(eyes.every)) s, played at 30"
        case .photo: return "Raise both hands or ✌️ for a photo"
        }
    }
    private var mood: SparkMood {
        if ShuaVoice.shared.speaking { return .speaking }
        if rolling { return .happy }
        if listen.listening || link.asking { return .thinking }
        return eyes.present ? .idle : .sleepy
    }
}

/// The shutter: white for a photo, red to record, a red square while it records.
private struct Shutter: View {
    let mode: EyesMode
    let rolling: Bool
    let counting: Bool
    let press: () -> Void
    var body: some View {
        Button(action: press) {
            ZStack {
                Circle().strokeBorder(.white, lineWidth: 4).frame(width: 80, height: 80)
                RoundedRectangle(cornerRadius: rolling || counting ? 8 : 32, style: .continuous)
                    .fill(mode == .photo && !rolling ? Color.white : Color.red)
                    .frame(width: rolling || counting ? 32 : 64, height: rolling || counting ? 32 : 64)
            }
            .animation(.spring(response: 0.3, dampingFraction: 0.7), value: rolling || counting)
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.impact(weight: .medium), trigger: rolling)
        .accessibilityLabel(rolling ? "Stop recording" : counting ? "Cancel" : mode == .photo ? "Take a photo" : "Start recording")
    }
}

/// Corner marks around the shot: green when all of you is in it.
private struct FrameGuide: View {
    let whole: Bool
    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width, h = geo.size.height, l: CGFloat = 34
            Path { p in
                for (x, y, dx, dy) in [(0, 0, 1, 1), (w, 0, -1, 1), (0, h, 1, -1), (w, h, -1, -1)] as [(CGFloat, CGFloat, CGFloat, CGFloat)] {
                    p.move(to: CGPoint(x: x, y: y + dy * l)); p.addLine(to: CGPoint(x: x, y: y)); p.addLine(to: CGPoint(x: x + dx * l, y: y))
                }
            }
            .stroke(whole ? Color.green : .white.opacity(0.55), style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
        }
        .animation(.smooth(duration: 0.3), value: whole)
    }
}

/// Your script, rolling up while you record, close to the lens so your eyes stay on the camera.
private struct Prompter: View {
    let text: String
    let rolling: Date?
    let speed: Double
    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30, paused: rolling == nil)) { ctx in
            let y = rolling.map { CGFloat(ctx.date.timeIntervalSince($0) * speed) } ?? 0
            Text(text).font(.system(size: 24, weight: .semibold)).lineSpacing(6).multilineTextAlignment(.center).foregroundStyle(.white)
                .frame(maxWidth: .infinity).fixedSize(horizontal: false, vertical: true)
                .offset(y: 60 - y)
                .frame(height: 160, alignment: .top)
        }
        .frame(height: 160).clipped()
        .mask(LinearGradient(stops: [.init(color: .clear, location: 0), .init(color: .black, location: 0.2), .init(color: .black, location: 0.75), .init(color: .clear, location: 1)], startPoint: .top, endPoint: .bottom))
        .padding(.horizontal, 16).padding(.vertical, 6)
        .background(.black.opacity(0.35), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}

/// Write or paste your script, or take Shua's last reply (ask it to write one: "write me a 30-second intro about…").
private struct ScriptSheet: View {
    @Environment(SparkLink.self) private var link
    @Environment(\.dismiss) private var dismiss
    @Binding var script: String
    @Binding var on: Bool
    @Binding var speed: Double
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextEditor(text: $script).frame(minHeight: 220).font(.system(size: 17))
                } footer: { Text("It rolls up near the camera while you record a video, so you can read it and still look at the lens.") }
                Section {
                    Toggle("Show while recording", isOn: $on)
                    VStack(alignment: .leading) {
                        Text("Speed").font(.system(size: 15, weight: .medium))
                        Slider(value: $speed, in: 12...60) { Text("Speed") } minimumValueLabel: { Image(systemName: "tortoise") } maximumValueLabel: { Image(systemName: "hare") }
                    }
                }
                if let reply = link.chat.last(where: { $0.role == .shua && !$0.pending && !$0.text.isEmpty }) {
                    Section {
                        Button { script = SparkLink.clean(reply.text); on = true } label: { Label("Use Shua's last reply", systemImage: "sparkles") }
                    } footer: { Text("Ask Shua to write one first: \"write me a 30-second intro for a video about…\"") }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color.black)
            .navigationTitle("Script").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() }.fontWeight(.semibold) } }
        }
        .presentationDetents([.medium, .large])
    }
}

/// The signs Shua understands; the one you're making lights up.
private struct SignsSheet: View {
    @Environment(SparkLink.self) private var link
    @Environment(\.dismiss) private var dismiss
    private var eyes: ShuaEyes { .shared }
    private var accent: Color { link.look?.accentColor ?? .shuaPurple }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    ShuaCard(title: "From anywhere in the room", symbol: "figure.wave", tint: accent) {
                        sign("🙌", "Raise both hands", "Start or stop recording", lit: eyes.body?.handsUp == true)
                        sign("👋", "Wave", "Shua waves back", lit: eyes.body?.raisedHand != nil)
                    }
                    ShuaCard(title: "Close up", symbol: "hand.raised.fill", tint: accent) {
                        sign("✋", "Hold your palm up", "Shua listens, hands-free", lit: eyes.sign == .open)
                        sign("✊", "Make a fist, or lower your hand", "Sends what you said", lit: eyes.sign == .fist)
                        sign("👍", "Thumbs up", "Shua cheers", lit: eyes.sign == .thumbsUp)
                        sign("☝️", "Point", "Shua's eyes follow your finger", lit: eyes.sign == .point)
                        sign("✌️", "Peace sign", "A photo, into Photos", lit: eyes.sign == .peace)
                    }
                    Text("Everything Shua sees is read on this iPhone and never leaves it. What it records goes to your Photos only.")
                        .font(.system(size: 13)).foregroundStyle(Noir.faint).padding(.horizontal, 8)
                }
                .padding(20)
            }
            .background(Color.black)
            .navigationTitle("Signs Shua knows").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() }.fontWeight(.semibold) } }
        }
        .presentationDetents([.medium, .large])
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
/// when you close your fist or drop your hand, takes a photo on a peace sign (with a flash), welcomes you back to the
/// desk, and suggests a break after a long stretch. While a video with sound records, the microphone is the camera's.
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
        let filming = eyes.recording?.kind == .video || eyes.countdown != nil
        switch kind {
        case .wave, .thumbsUp: waves += 1
        case .talk: if !listen.listening, !filming { start() }
        case .send: if listen.listening { finish() }
        case .snap:
            withAnimation(.easeOut(duration: 0.08)) { flash = true }
            Task { try? await Task.sleep(for: .milliseconds(120)); withAnimation(.easeIn(duration: 0.35)) { flash = false }; await eyes.snap() }
        case .back(let away):
            waves += 1
            if !filming { link.note("Welcome back\(name). You were away \(Plainly.since(away)).") }
        case .stretch(let minutes):
            if !filming { link.note("You've been at it \(minutes) minutes\(name). Stand up and stretch for a minute?") }
        case .handsUp, .left: break
        }
    }
}
