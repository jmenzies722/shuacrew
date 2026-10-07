import SwiftUI

/// The second screen: your iPhone on its side next to the Mac, like StandBy but for Shua. Your Shua big on the left;
/// on the right the time, what Shua is saying as it says it (or what's going on), and what needs you, with Allow one
/// tap away. Hold anywhere to talk. Shown automatically in landscape, or full screen from desk mode.
struct SecondScreen: View {
    @Environment(SparkLink.self) private var link
    let tilt: SparkTilt
    let listen: ShuaListen
    private var voice: ShuaVoice { .shared }
    private var accent: Color { link.look?.accentColor ?? .shuaPurple }

    var body: some View {
        GeometryReader { geo in
            let wide = geo.size.width > geo.size.height
            ZStack {
                NoirBackdrop(mood: mood, accent: accent, tilt: tilt.gaze, focus: wide ? UnitPoint(x: 0.25, y: 0.45) : UnitPoint(x: 0.5, y: 0.3), reach: 360)
                let layout = wide ? AnyLayout(HStackLayout(spacing: 40)) : AnyLayout(VStackLayout(spacing: 24))
                layout {
                    ZStack(alignment: .bottom) {
                        ShuaFloor(accent: accent).offset(y: 10)
                        ShuaCharacter(mood: mood, tilt: tilt.gaze).padding(wide ? 12 : 24)
                    }
                    .frame(maxWidth: wide ? geo.size.height * 0.85 : geo.size.width * 0.8)
                    .scaleEffect(listen.listening ? 1.05 : 1).animation(.spring(response: 0.35), value: listen.listening)
                    VStack(alignment: wide ? .leading : .center, spacing: 14) {
                        TimelineView(.periodic(from: .now, by: 1)) { ctx in
                            VStack(alignment: wide ? .leading : .center, spacing: 0) {
                                Text(ctx.date, format: .dateTime.hour().minute())
                                    .font(.system(size: wide ? 88 : 72, weight: .thin)).monospacedDigit().contentTransition(.numericText()).tracking(-1)
                                Text(ctx.date, format: .dateTime.weekday(.wide).month().day()).noirLabel()
                            }
                        }
                        Headline(listening: listen.listening, heard: listen.heard, compact: true).multilineTextAlignment(wide ? .leading : .center)
                        HStack(spacing: 16) {
                            if !link.approvals.isEmpty { Label("\(link.approvals.count) need\(link.approvals.count == 1 ? "s" : "") you", systemImage: "hand.raised.fill").foregroundStyle(.orange) }
                            let working = link.activeRuns.filter { $0.status != "awaiting_approval" }.count
                            if working > 0 { Label("\(working) working", systemImage: "bolt.fill").foregroundStyle(.green) }
                            let done = link.runs.filter(\.finished).count
                            if done > 0 { Label("\(done) done", systemImage: "checkmark.circle.fill").foregroundStyle(.secondary) }
                        }
                        .font(.system(size: 14, weight: .semibold))
                        if let a = link.approvals.first {
                            HStack(spacing: 10) {
                                Button("Not now") { Task { await link.decide(a, allow: false) } }.buttonStyle(.glass)
                                Button { Task { await link.decide(a, allow: true) } } label: { Label("Allow", systemImage: "faceid").foregroundStyle(.black) }.buttonStyle(.glassProminent).tint(.white)
                            }
                        }
                    }
                    .frame(maxWidth: wide ? .infinity : nil, alignment: wide ? .leading : .center)
                }
                .padding(.horizontal, wide ? 40 : 24).padding(.vertical, 24)
                if listen.listening {
                    Rectangle().fill(.black.opacity(0.35)).ignoresSafeArea().allowsHitTesting(false).transition(.opacity)
                }
            }
            .contentShape(Rectangle())
            .simultaneousGesture(LongPressGesture(minimumDuration: 0.35).sequenced(before: DragGesture(minimumDistance: 0))
                .onChanged { value in if case .second(true, _) = value, !listen.listening { UIImpactFeedbackGenerator(style: .medium).impactOccurred(); Task { await listen.start() } } }
                .onEnded { _ in Task { let said = await listen.stop(); if !said.isEmpty { await link.ask(said) } } })
            .animation(.smooth(duration: 0.35), value: listen.listening)
        }
        .preferredColorScheme(.dark)
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true; tilt.start() }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
    }

    private var mood: SparkMood {
        if voice.speaking { return .speaking }
        if listen.listening || link.asking { return .thinking }
        return link.mood
    }
}

/// Desk mode: the second screen as a clock by your Mac, full screen. Close it with the button, or double-tap anywhere.
struct DockView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var listen = ShuaListen()
    let tilt: SparkTilt
    var body: some View {
        SecondScreen(tilt: tilt, listen: listen)
            .overlay(alignment: .topLeading) {
                Button { dismiss() } label: { Image(systemName: "xmark").font(.system(size: 15, weight: .semibold)).frame(width: 42, height: 42) }
                    .buttonStyle(.plain).glassEffect(.regular.interactive(), in: Circle())
                    .padding(20).accessibilityLabel("Close desk mode")
            }
            .onTapGesture(count: 2) { dismiss() }
            .statusBarHidden()
            .persistentSystemOverlays(.hidden)
    }
}
