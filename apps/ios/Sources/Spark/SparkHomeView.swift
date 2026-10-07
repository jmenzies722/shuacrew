import SwiftUI

/// Shua on your iPhone. Portrait: your Shua in its own living light, what it's saying in words you can read at a
/// glance, then only what needs you and what's moving. Turn the phone sideways and it becomes a second screen.
/// Hold anywhere to talk; let go and Shua does it on your Mac.
struct SparkHomeView: View {
    @Environment(SparkLink.self) private var link
    @Environment(\.verticalSizeClass) private var vertical
    @State private var tilt = SparkTilt()
    @State private var listen = ShuaListen()
    @State private var pairing = false
    @State private var docked = false
    @State private var history = false
    @State private var typing = false
    private var voice: ShuaVoice { .shared }
    private var accent: Color { link.look?.accentColor ?? .shuaPurple }

    var body: some View {
        Group {
            if vertical == .compact, link.state != .unpaired {
                SecondScreen(tilt: tilt, listen: listen) // sideways: the second screen, no button needed
            } else {
                portrait
            }
        }
        .sheet(isPresented: $pairing) { PairView() }
        .sheet(isPresented: $history) { ConversationSheet() }
        .sheet(isPresented: $typing) { AskSheet { text in Task { await link.ask(text) } } }
        .fullScreenCover(isPresented: $docked) { DockView(tilt: tilt) }
        .onAppear { tilt.start(); link.start() }
        .onDisappear { tilt.stop() }
        .alert("Shua", isPresented: Binding(get: { link.error != nil || listen.problem != nil }, set: { if !$0 { link.error = nil; listen.problem = nil } })) { Button("OK") {} } message: { Text(link.error ?? listen.problem ?? "") }
    }

    private var portrait: some View {
        ZStack {
            ShuaStage(mood: mood, accent: accent)
            ScrollView {
                VStack(spacing: 22) {
                    ZStack {
                        ShuaAura(active: voice.speaking || listen.listening || link.asking, accent: accent).frame(width: 300, height: 300)
                        ShuaCharacter(mood: mood, tilt: tilt.gaze).frame(height: 240)
                    }
                    .padding(.top, 6)
                    SpeechLine(listening: listen.listening, heard: listen.heard)
                        .padding(.horizontal, 24)
                    if link.state == .unpaired {
                        Button { pairing = true } label: { Label("Pair with your Mac", systemImage: "qrcode.viewfinder").font(.headline).frame(maxWidth: .infinity) }
                            .buttonStyle(.borderedProminent).controlSize(.large).padding(.horizontal, 24)
                    } else {
                        Suggestions()
                        ForEach(link.approvals) { NeedsYouCard(approval: $0) }
                        if !link.activeRuns.filter({ $0.status != "awaiting_approval" }).isEmpty { WorkingCard() }
                        DoneCard()
                        if link.chat.count > 2 {
                            Button { history = true } label: { Label("See the whole conversation", systemImage: "text.bubble").font(.subheadline.weight(.medium)) }
                                .buttonStyle(.bordered).buttonBorderShape(.capsule).tint(.white.opacity(0.8))
                        }
                    }
                }
                .frame(maxWidth: 560)
                .frame(maxWidth: .infinity)
                .padding(.bottom, 120)
            }
            .scrollIndicators(.hidden)
            if listen.listening { ListeningOverlay(heard: listen.heard, accent: accent).transition(.opacity) }
        }
        // Hold anywhere to talk: let go and it goes to Shua.
        .simultaneousGesture(LongPressGesture(minimumDuration: 0.35).sequenced(before: DragGesture(minimumDistance: 0))
            .onChanged { value in if case .second(true, _) = value, !listen.listening, link.state != .unpaired { startListening() } }
            .onEnded { _ in finishListening() })
        .safeAreaInset(edge: .bottom) { if link.state != .unpaired { Composer(listen: listen, typing: $typing, start: startListening, finish: finishListening) } }
        .animation(.smooth(duration: 0.35), value: listen.listening)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) { StatusPill(state: link.state, mac: link.pairing?.name) }
            ToolbarItem(placement: .topBarTrailing) { Button { docked = true } label: { Image(systemName: "rectangle.landscape.rotate") }.accessibilityLabel("Desk mode") }
        }
        .toolbarBackground(.hidden, for: .navigationBar)
        .navigationBarTitleDisplayMode(.inline)
    }

    private func startListening() { UIImpactFeedbackGenerator(style: .medium).impactOccurred(); Task { await listen.start() } }
    private func finishListening() {
        guard listen.listening else { return }
        Task { let said = await listen.stop(); if !said.isEmpty { await link.ask(said) } }
    }

    private var mood: SparkMood {
        if voice.speaking { return .speaking }
        if listen.listening || link.asking { return .thinking }
        return link.mood
    }
}

/// What Shua is saying, big enough to read across a desk: its reply as it streams, else hello and what's going on.
struct SpeechLine: View {
    @Environment(SparkLink.self) private var link
    var listening = false
    var heard = ""
    var big: CGFloat = 26
    var leading = false
    var body: some View {
        VStack(alignment: leading ? .leading : .center, spacing: 10) {
            if listening {
                Text(heard.isEmpty ? "I'm listening…" : heard).font(.system(size: big, weight: .semibold, design: .rounded))
            } else if let line = link.chat.last(where: { $0.role == .shua }), line.pending || Date.now.timeIntervalSince(line.at) < 120 {
                if line.pending && line.text.isEmpty {
                    Text("Thinking…").font(.system(size: big, weight: .semibold, design: .rounded)).foregroundStyle(.secondary)
                } else {
                    Text(SparkLink.styled(line.text)).font(.system(size: big * 0.8, weight: .medium, design: .rounded)).foregroundStyle(line.failed ? .orange : .primary)
                }
            } else {
                Text(link.state == .unpaired ? "Hi, I'm \(link.look?.name ?? "Shua")." : Plainly.hello()).font(.system(size: big, weight: .bold, design: .rounded))
                Text(link.state == .unpaired ? "Pair with your Mac and I'll keep you posted, wherever you are." : link.statusSentence)
                    .font(.system(.title3, design: .rounded)).foregroundStyle(.secondary)
            }
        }
        .multilineTextAlignment(leading ? .leading : .center)
        .lineSpacing(3)
        .fixedSize(horizontal: false, vertical: true)
        .contentTransition(.opacity)
        .animation(.smooth, value: link.chat.last?.text)
    }
}

/// Ideas for the moment: what needs you comes first when something does.
private struct Suggestions: View {
    @Environment(SparkLink.self) private var link
    var body: some View {
        let items: [(String, String)] = (link.approvals.isEmpty ? [] : [("What needs me?", "hand.raised")]) + [
            ("What's going on?", "sparkles"), ("Plan my day", "sun.max"), ("Start a 25-minute focus", "timer"),
            ("Play some focus music", "music.note"), ("Have the crew start something", "person.3"),
        ]
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(items, id: \.0) { item in
                    Button { Task { await link.ask(item.0) } } label: { Label(item.0, systemImage: item.1).font(.subheadline.weight(.medium)) }
                        .buttonStyle(.bordered).buttonBorderShape(.capsule).tint(.white)
                        .disabled(link.asking)
                }
            }
            .padding(.horizontal, 20)
        }
        .scrollIndicators(.hidden)
    }
}

/// A rounded glass card with a small heading, the house style for everything below Shua.
struct ShuaCard<Content: View>: View {
    let title: String, symbol: String, tint: Color
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(title, systemImage: symbol).font(.subheadline.weight(.semibold)).foregroundStyle(tint)
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(.white.opacity(0.08)))
        .padding(.horizontal, 20)
    }
}

/// Something the crew wants your OK for, in words first; the exact command one tap away.
struct NeedsYouCard: View {
    @Environment(SparkLink.self) private var link
    let approval: CrewApproval
    @State private var exact = false
    var body: some View {
        ShuaCard(title: "Needs you", symbol: "hand.raised.fill", tint: .orange) {
            VStack(alignment: .leading, spacing: 6) {
                Text("\(title) wants to \(approval.what.isEmpty ? "go ahead" : approval.what).").font(.system(.title3, design: .rounded).weight(.semibold))
                if !approval.why.isEmpty { Text(approval.why).font(.body).foregroundStyle(.secondary) }
            }
            if let command = approval.command {
                DisclosureGroup(isExpanded: $exact) {
                    Text(command).font(.footnote.monospaced()).foregroundStyle(.secondary).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading).padding(.top, 4)
                } label: { Text("The exact command").font(.footnote.weight(.medium)).foregroundStyle(.secondary) }
                .tint(.secondary)
            }
            HStack(spacing: 10) {
                Button("Not now", role: .destructive) { Task { await link.decide(approval, allow: false) } }.buttonStyle(.bordered).controlSize(.large)
                Button { Task { await link.decide(approval, allow: true) } } label: { Label("Allow", systemImage: "faceid").frame(maxWidth: .infinity) }
                    .buttonStyle(.borderedProminent).tint(.orange).controlSize(.large)
            }
        }
    }
    private var title: String { approval.run.flatMap { id in link.runs.first { $0.id == id }?.title } ?? "Your crew" }
}

/// What's moving right now, with how long it's been at it.
struct WorkingCard: View {
    @Environment(SparkLink.self) private var link
    var body: some View {
        ShuaCard(title: "Working now", symbol: "bolt.fill", tint: .green) {
            ForEach(link.activeRuns.filter { $0.status != "awaiting_approval" }.prefix(4)) { run in
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Circle().fill(.green).frame(width: 8, height: 8).phaseAnimator([0.35, 1]) { c, p in c.opacity(p) } animation: { _ in .easeInOut(duration: 0.9) }
                    VStack(alignment: .leading, spacing: 3) {
                        Text(run.title).font(.body.weight(.semibold))
                        if !run.ticker.isEmpty { Text(run.ticker).font(.subheadline).foregroundStyle(.secondary) }
                    }
                    Spacer(minLength: 8)
                    if run.createdAt > 0 { Text(Plainly.since(Date.now.timeIntervalSince1970 - run.createdAt / 1000)).font(.footnote.monospacedDigit()).foregroundStyle(.tertiary) }
                }
                .contextMenu { Button("Stop this", systemImage: "stop.circle", role: .destructive) { Task { await link.cancel(run) } } }
            }
        }
    }
}

/// What landed today, newest first, with how it went.
struct DoneCard: View {
    @Environment(SparkLink.self) private var link
    var body: some View {
        let done = link.runs.filter(\.finished).sorted { $0.updatedAt > $1.updatedAt }
        if let latest = done.first {
            ShuaCard(title: done.count == 1 ? "Done" : "Done · \(done.count)", symbol: "checkmark.circle.fill", tint: link.look?.accentColor ?? .shuaPurple) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(latest.title).font(.body.weight(.semibold))
                    if !latest.ticker.isEmpty { Text(latest.ticker).font(.subheadline).foregroundStyle(.secondary) }
                }
            }
        }
    }
}

/// The bottom bar: type, or hold the mic and talk.
private struct Composer: View {
    @Environment(SparkLink.self) private var link
    let listen: ShuaListen
    @Binding var typing: Bool
    let start: () -> Void
    let finish: () -> Void
    var body: some View {
        HStack(spacing: 10) {
            Button { typing = true } label: {
                HStack { Text(link.asking ? "Shua is on it…" : "Ask \(link.look?.name ?? "Shua") anything").foregroundStyle(.secondary); Spacer() }
                    .padding(.horizontal, 16).frame(height: 48)
                    .background(.ultraThinMaterial, in: Capsule())
            }
            .buttonStyle(.plain)
            Image(systemName: listen.listening ? "waveform" : "mic.fill")
                .font(.title3.weight(.semibold)).symbolEffect(.variableColor.iterative, isActive: listen.listening)
                .foregroundStyle(.white)
                .frame(width: 48, height: 48)
                .background((link.look?.accentColor ?? .shuaPurple).gradient, in: Circle())
                .scaleEffect(listen.listening ? 1.15 : 1).animation(.spring(response: 0.3), value: listen.listening)
                .gesture(DragGesture(minimumDistance: 0).onChanged { _ in if !listen.listening { start() } }.onEnded { _ in finish() })
                .accessibilityLabel("Hold to talk to Shua")
        }
        .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 4)
    }
}

/// While you hold: the room dims and your words appear, big.
private struct ListeningOverlay: View {
    let heard: String
    let accent: Color
    var body: some View {
        ZStack {
            Rectangle().fill(.black.opacity(0.55)).ignoresSafeArea()
            VStack(spacing: 18) {
                Image(systemName: "waveform").font(.system(size: 44, weight: .semibold)).foregroundStyle(accent).symbolEffect(.variableColor.iterative)
                Text(heard.isEmpty ? "Listening…" : heard).font(.system(size: 30, weight: .semibold, design: .rounded)).multilineTextAlignment(.center).padding(.horizontal, 32)
                Text("Let go to send").font(.subheadline).foregroundStyle(.secondary)
            }
        }
        .allowsHitTesting(false)
    }
}

/// Typing to Shua: a clean sheet with the keyboard up.
private struct AskSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @FocusState private var focused: Bool
    let send: (String) -> Void
    var body: some View {
        NavigationStack {
            TextField("What should Shua do?", text: $text, axis: .vertical)
                .font(.title3).lineLimit(3...8).focused($focused).padding(20)
                .frame(maxHeight: .infinity, alignment: .top)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) { Button("Send") { send(text); dismiss() }.disabled(text.trimmingCharacters(in: .whitespaces).isEmpty) }
                }
                .navigationTitle("Ask Shua").navigationBarTitleDisplayMode(.inline)
                .onAppear { focused = true }
        }
        .presentationDetents([.medium])
    }
}

/// The whole conversation on this phone, readable: your words on the right, Shua's on the left.
private struct ConversationSheet: View {
    @Environment(SparkLink.self) private var link
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 10) {
                    ForEach(link.chat) { line in
                        HStack {
                            if line.role == .you { Spacer(minLength: 48) }
                            Text(line.role == .shua ? SparkLink.styled(line.text.isEmpty ? "…" : line.text) : AttributedString(line.text))
                                .font(.body).lineSpacing(2).textSelection(.enabled)
                                .padding(.horizontal, 14).padding(.vertical, 10)
                                .foregroundStyle(line.role == .you ? Color.white : (line.failed ? Color.orange : Color.primary))
                                .background(line.role == .you ? AnyShapeStyle((link.look?.accentColor ?? .shuaPurple).gradient) : AnyShapeStyle(.thinMaterial), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                            if line.role == .shua { Spacer(minLength: 48) }
                        }
                    }
                }
                .padding(16)
            }
            .navigationTitle("Conversation").navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.large])
    }
}

/// Status in the corner: live with which Mac, or what's wrong, in a calm pill.
struct StatusPill: View {
    let state: SparkLink.State
    var mac: String?
    var body: some View {
        let (color, label): (Color, String) = switch state {
        case .live: (.green, "Live")
        case .connecting: (.yellow, "Connecting")
        case .offline: (.red, "Offline")
        case .unpaired: (.gray, "Not paired")
        }
        HStack(spacing: 6) { Circle().fill(color).frame(width: 7, height: 7); Text(label).font(.caption.weight(.semibold)) }
            .padding(.horizontal, 10).padding(.vertical, 5)
            .fixedSize()
            .background(.ultraThinMaterial, in: Capsule())
            .accessibilityLabel(mac.map { "\(label) with \($0)" } ?? label)
    }
}

extension SparkLink {
    /// What Shua's face shows: offline sleeps, waiting is concerned, a fresh finish is happy, work is thinking.
    var mood: SparkMood {
        switch state {
        case .unpaired, .offline: return .sleepy
        default: break
        }
        if !approvals.isEmpty { return .concerned }
        if celebrating != nil { return .happy }
        if !activeRuns.isEmpty { return .thinking }
        return .idle
    }

    /// Shua's status as a headline and a line under it, in plain words.
    var caption: (title: String, sub: String?) {
        switch state {
        case .unpaired: return ("Hi, I'm \(look?.name ?? "Shua").", "Pair with your Mac and I'll keep you posted, wherever you are.")
        case .connecting: return ("Reaching your Mac…", nil)
        case .offline(let why): return (why, "I'll reconnect on my own. Is Tailscale on?")
        case .live: break
        }
        if let a = approvals.first {
            let who = a.run.flatMap { id in runs.first { $0.id == id }?.title } ?? "Your crew"
            return ("\(who) needs your OK", a.what.isEmpty ? nil : "It wants to \(a.what).")
        }
        if let done = celebrating { return ("Done: \(done.title)", nil) }
        let working = activeRuns.filter { $0.status != "awaiting_approval" }
        if let run = working.first { return (run.title, working.count > 1 ? "and \(working.count - 1) more on the go" : (run.ticker.isEmpty ? "Working on it now" : run.ticker)) }
        return ("All quiet.", todayRuns > 0 ? "\(todayRuns) thing\(todayRuns == 1 ? "" : "s") done today." : "Ask me anything.")
    }

    /// One sentence under the hello: what matters most right now.
    var statusSentence: String {
        if state != .live { return caption.sub ?? caption.title }
        if let a = approvals.first {
            let who = a.run.flatMap { id in runs.first { $0.id == id }?.title } ?? "Your crew"
            return approvals.count == 1 ? "\(who) needs your OK to \(a.what.isEmpty ? "go ahead" : a.what)." : "\(approvals.count) things need your OK."
        }
        let working = activeRuns.filter { $0.status != "awaiting_approval" }
        if working.count == 1, let run = working.first { return "\(run.title) is underway." }
        if working.count > 1 { return "\(working.count) things are underway." }
        let done = runs.filter(\.finished).count
        return done > 0 ? "Everything's quiet. \(done) thing\(done == 1 ? "" : "s") finished today." : "Everything's quiet. What should we do?"
    }
}

/// The light behind Shua: warm and slow at rest, amber when something needs you, green when something lands.
struct Glow: View {
    let mood: SparkMood
    var accent: Color = .shuaPurple
    var body: some View {
        let tint: Color = switch mood {
        case .concerned: .orange
        case .happy: .green
        case .thinking, .speaking: accent
        case .sleepy: .indigo
        case .idle: accent
        }
        ZStack {
            Color.black
            RadialGradient(colors: [tint.opacity(0.35), .clear], center: .top, startRadius: 0, endRadius: 420)
        }
        .animation(.smooth(duration: 1.2), value: mood)
    }
}
