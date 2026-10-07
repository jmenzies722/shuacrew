import SwiftUI

/// At your desk: the iPhone beside your Mac, like StandBy for Shua. Your Shua big in its light; the time; what it's
/// saying as it says it; what needs you, with Allow a tap away; and the desk tools — Shua's eyes (it watches you
/// work: welcome back, a nudge to stretch, a raised palm to talk), a one-tap timelapse of your session, and the
/// camera. Hold anywhere to talk. On its side it's the home screen; upright, Desk opens it full screen.
struct DeskView: View {
    @Environment(SparkLink.self) private var link
    @Environment(\.dismiss) private var dismiss
    let tilt: SparkTilt
    let listen: ShuaListen
    let waves: Int
    /// The home screen on its side (no close button) rather than full screen from Desk.
    var inline = false
    let start: () -> Void
    let finish: () -> Void
    @State private var camera = false
    private var eyes: ShuaEyes { .shared }
    private var voice: ShuaVoice { .shared }
    private var accent: Color { link.look?.accentColor ?? .shuaPurple }

    var body: some View {
        GeometryReader { geo in
            let wide = geo.size.width > geo.size.height
            ZStack {
                NoirBackdrop(mood: mood, accent: accent, tilt: tilt.gaze, focus: wide ? UnitPoint(x: 0.24, y: 0.5) : UnitPoint(x: 0.5, y: 0.28), reach: 360)
                if wide {
                    HStack(alignment: .center, spacing: 30) {
                        shua.frame(width: geo.size.width * 0.34, height: geo.size.height * 0.6)
                        panel(wide: true)
                    }
                    .padding(.horizontal, 36).padding(.top, 14).padding(.bottom, inline ? 74 : 18)
                } else {
                    VStack(spacing: 16) {
                        VStack(spacing: 10) { shua.frame(height: geo.size.height * 0.3); presence }
                        panel(wide: false)
                    }
                    .padding(.horizontal, 24).padding(.top, 56).padding(.bottom, inline ? 64 : 24)
                }
                if listen.listening { ListeningOverlay(heard: listen.heard, accent: accent).transition(.opacity) }
            }
            .contentShape(Rectangle())
            .simultaneousGesture(LongPressGesture(minimumDuration: 0.35).sequenced(before: DragGesture(minimumDistance: 0))
                .onChanged { value in if case .second(true, _) = value, !listen.listening { start() } }
                .onEnded { _ in finish() })
            .animation(.smooth(duration: 0.35), value: listen.listening)
        }
        .overlay(alignment: .topLeading) {
            if !inline {
                Button { dismiss() } label: { Image(systemName: "xmark").font(.system(size: 15, weight: .semibold)).frame(width: 42, height: 42) }
                    .buttonStyle(.plain).glassEffect(.regular.interactive(), in: Circle())
                    .padding(20).accessibilityLabel("Close desk")
            }
        }
        .fullScreenCover(isPresented: $camera) { ShuaCam(listen: listen) }
        .preferredColorScheme(.dark)
        .statusBarHidden(!inline)
        .persistentSystemOverlays(.hidden)
        .onAppear {
            UIApplication.shared.isIdleTimerDisabled = true // a desk companion stays on
            tilt.start()
            if eyes.previewOwner == nil { eyes.previewOwner = "desk" }
        }
        .onDisappear {
            if eyes.recording == nil { UIApplication.shared.isIdleTimerDisabled = false }
            if eyes.previewOwner == "desk" { eyes.previewOwner = nil }
        }
    }

    private var shua: some View {
        ZStack(alignment: .bottom) {
            ShuaFloor(accent: accent).offset(y: 12)
            ShuaCharacter(mood: mood, tilt: eyes.gaze ?? tilt.gaze, lean: eyes.lean, waves: waves)
        }
    }

    /// What Shua knows about you at the desk.
    private var presence: some View {
        HStack(spacing: 8) {
            Circle().fill(eyes.on ? (eyes.present ? Color.green : .orange) : Noir.faint).frame(width: 7, height: 7)
            if eyes.on, let since = eyes.deskSince {
                TimelineView(.periodic(from: .now, by: 30)) { _ in Text("At your desk · \(Plainly.since(Date.now.timeIntervalSince(since)))") }
            } else {
                Text(eyes.on ? "Looking for you…" : "Shua's eyes are off")
            }
        }
        .font(.system(size: 13, weight: .semibold)).foregroundStyle(Noir.soft)
    }

    private func panel(wide: Bool) -> some View {
        VStack(alignment: wide ? .leading : .center, spacing: wide ? 10 : 14) {
            HStack(alignment: .top) {
                TimelineView(.periodic(from: .now, by: 1)) { ctx in
                    VStack(alignment: wide ? .leading : .center, spacing: 2) {
                        Text(ctx.date, format: .dateTime.hour().minute())
                            .font(.system(size: wide ? 58 : 64, weight: .thin)).monospacedDigit().tracking(-1).contentTransition(.numericText())
                        Text(ctx.date, format: .dateTime.weekday(.wide).month().day()).noirLabel()
                        if wide { presence.padding(.top, 4) }
                    }
                }
                if wide, eyes.on { Spacer(minLength: 8); you }
            }
            // On its side there's room for one thing: what needs you, or else what Shua is saying.
            if wide, let a = link.approvals.first {
                NeedsYouCard(approval: a, compact: true)
            } else {
                Headline(listening: listen.listening, heard: listen.heard, compact: true, short: true).multilineTextAlignment(wide ? .leading : .center)
                if !wide, let a = link.approvals.first { NeedsYouCard(approval: a) }
            }
            tools
        }
        .frame(maxWidth: wide ? .infinity : 560, alignment: wide ? .leading : .center)
    }

    /// You, as Shua sees you, small: proof it's watching (and where it thinks your hand is).
    private var you: some View {
        EyesPreview(accent: accent, owner: "desk")
            .frame(width: 92, height: 122)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(accent.opacity(eyes.present ? 0.8 : 0.25), lineWidth: 1.5))
            .overlay(alignment: .topTrailing) { if eyes.recording != nil { Circle().fill(.red).frame(width: 9, height: 9).padding(7) } }
            .onTapGesture { camera = true }
    }

    /// The desk tools, in glass: Shua's eyes, a timelapse of your session, the camera, and the talk orb.
    private var tools: some View {
        GlassEffectContainer(spacing: 14) {
            HStack(spacing: 12) {
                tool(eyes.on ? "Watching" : "Watch me", eyes.on ? "eye.fill" : "eye", lit: eyes.on) {
                    Task { eyes.scene = .desk; await eyes.toggle() }
                }
                let lapsing = eyes.recording.map { if case .timelapse = $0.kind { true } else { false } } ?? false
                tool(lapsing ? "Stop" : "Timelapse", lapsing ? "stop.fill" : "timelapse", lit: lapsing, tint: .red) {
                    Task {
                        if lapsing { await eyes.stopRecording(); return }
                        eyes.scene = .desk
                        if !eyes.on { await eyes.start() }
                        eyes.record(.timelapse(every: eyes.every))
                    }
                }
                tool("Camera", "camera", lit: false) { camera = true }
                Image(systemName: listen.listening ? "waveform" : "mic.fill")
                    .font(.system(size: 20, weight: .semibold)).foregroundStyle(.white)
                    .frame(width: 58, height: 58)
                    .glassEffect(.regular.tint(accent.opacity(0.85)).interactive(), in: Circle())
                    .scaleEffect(listen.listening ? 1.12 : 1)
                    .gesture(DragGesture(minimumDistance: 0).onChanged { _ in if !listen.listening { start() } }.onEnded { _ in finish() })
                    .accessibilityLabel("Hold to talk to Shua")
            }
        }
    }

    private func tool(_ title: String, _ symbol: String, lit: Bool, tint: Color? = nil, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            VStack(spacing: 5) {
                Image(systemName: symbol).font(.system(size: 17, weight: .semibold))
                Text(title).font(.system(size: 11, weight: .semibold))
            }
            .frame(width: 74, height: 58)
            .foregroundStyle(.white)
        }
        .buttonStyle(.plain)
        .glassEffect(lit ? .regular.tint((tint ?? accent).opacity(0.55)).interactive() : .regular.interactive(), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private var mood: SparkMood {
        if voice.speaking { return .speaking }
        if listen.listening || link.asking { return .thinking }
        if eyes.on, !eyes.present { return .sleepy }
        return link.mood
    }
}
