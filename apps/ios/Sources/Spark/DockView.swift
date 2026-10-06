import SwiftUI

/// Desk mode: your iPhone on its stand as Shua's second screen next to the Mac. Your own character, big; what Shua
/// is saying (as it says it) or what the crew is doing; the time; what's waiting. Hold Shua to talk to it. The screen
/// stays awake while it's up; double-tap anywhere to put it away.
struct DockView: View {
    @Environment(SparkLink.self) private var link
    @Environment(\.dismiss) private var dismiss
    @State private var listen = ShuaListen()
    let tilt: SparkTilt
    private var voice: ShuaVoice { .shared }

    var body: some View {
        GeometryReader { geo in
            let wide = geo.size.width > geo.size.height
            ZStack {
                Glow(mood: mood, accent: link.look?.accentColor ?? .shuaPurple).ignoresSafeArea()
                let layout = wide ? AnyLayout(HStackLayout(spacing: 40)) : AnyLayout(VStackLayout(spacing: 24))
                layout {
                    ShuaCharacter(mood: mood, tilt: tilt.gaze)
                        .frame(maxWidth: wide ? geo.size.height * 0.8 : geo.size.width * 0.78)
                        .scaleEffect(listen.listening ? 1.05 : 1).animation(.spring(response: 0.35), value: listen.listening)
                        .gesture(LongPressGesture(minimumDuration: 0.25).sequenced(before: DragGesture(minimumDistance: 0))
                            .onChanged { _ in if !listen.listening { UIImpactFeedbackGenerator(style: .medium).impactOccurred(); Task { await listen.start() } } }
                            .onEnded { _ in Task { let said = await listen.stop(); if !said.isEmpty { await link.ask(said) } } })
                        .accessibilityLabel("Hold to talk to Shua")
                    VStack(alignment: wide ? .leading : .center, spacing: 12) {
                        TimelineView(.periodic(from: .now, by: 1)) { ctx in
                            Text(ctx.date, format: .dateTime.hour().minute())
                                .font(.system(size: wide ? 84 : 64, weight: .semibold, design: .rounded))
                                .monospacedDigit().contentTransition(.numericText())
                        }
                        Text(line.title).font(.title2.weight(.medium)).lineLimit(wide ? 4 : 3)
                            .contentTransition(.opacity).animation(.smooth, value: line.title)
                        if let sub = line.sub { Text(sub).font(.headline).foregroundStyle(.secondary).lineLimit(2) }
                        HStack(spacing: 18) {
                            if !link.approvals.isEmpty { Label("\(link.approvals.count) waiting", systemImage: "hand.raised.fill").foregroundStyle(.orange) }
                            if !link.activeRuns.isEmpty { Label("\(link.activeRuns.count) working", systemImage: "bolt.fill").foregroundStyle(.green) }
                            if let b = link.brief, b.finished > 0 { Label("\(b.finished) done today", systemImage: "checkmark.circle.fill").foregroundStyle(.secondary) }
                        }
                        .font(.headline)
                    }
                    .multilineTextAlignment(wide ? .leading : .center)
                }
                .padding(32)
            }
            .contentShape(Rectangle())
            .onTapGesture(count: 2) { dismiss() }
        }
        .preferredColorScheme(.dark)
        .statusBarHidden()
        .persistentSystemOverlays(.hidden)
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true; tilt.start() }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
    }

    private var mood: SparkMood {
        if voice.speaking { return .speaking }
        if listen.listening || link.asking { return .thinking }
        return link.mood
    }

    /// Shua's own words while it's answering (or just did), else what the crew is doing.
    private var line: (title: String, sub: String?) {
        if listen.listening { return (listen.heard.isEmpty ? "I'm listening…" : listen.heard, nil) }
        if let last = link.chat.last(where: { $0.role == .shua }), !last.text.isEmpty, last.pending || Date.now.timeIntervalSince(last.at) < 90 {
            return (last.text, nil)
        }
        return link.caption
    }
}
