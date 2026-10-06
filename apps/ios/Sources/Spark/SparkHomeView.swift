import SwiftUI

/// Shua on your iPhone: your own character first, what it's saying or doing in one line, a conversation with the
/// Mac's Shua (it does what you ask there), then only what needs you and what's moving.
struct SparkHomeView: View {
    @Environment(SparkLink.self) private var link
    @State private var tilt = SparkTilt()
    @State private var listen = ShuaListen()
    @State private var ask = ""
    @State private var pairing = false
    @State private var docked = false
    @State private var bump = 0
    @FocusState private var typing: Bool
    private var voice: ShuaVoice { .shared }

    private static let quick: [(String, String)] = [
        ("What's going on?", "sparkles"), ("What needs me?", "hand.raised"), ("Start a 25-minute focus", "timer"),
        ("Play some focus music", "music.note"), ("Plan my day", "sun.max"), ("Hand the crew a task", "person.3"),
    ]

    var body: some View {
        ScrollViewReader { scroll in
            ScrollView {
                VStack(spacing: 16) {
                    ShuaCharacter(mood: mood, tilt: tilt.gaze)
                        .frame(height: 240)
                        .padding(.top, 4)
                        .scaleEffect(bump % 2 == 1 ? 1.04 : 1)
                        .animation(.spring(response: 0.35, dampingFraction: 0.5), value: bump)
                        .onTapGesture { bump += 1; UIImpactFeedbackGenerator(style: .soft).impactOccurred() }
                    VStack(spacing: 6) {
                        Text(caption.title).font(.title3.weight(.semibold)).multilineTextAlignment(.center).contentTransition(.opacity)
                        if let sub = caption.sub { Text(sub).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center) }
                    }
                    .animation(.smooth, value: caption.title)
                    .padding(.horizontal)

                    if link.state == .unpaired {
                        Button { pairing = true } label: { Label("Pair with your Mac", systemImage: "qrcode.viewfinder").frame(maxWidth: .infinity) }
                            .buttonStyle(.borderedProminent).controlSize(.large).padding(.horizontal)
                    } else {
                        if !link.chat.isEmpty { Conversation(lines: Array(link.chat.suffix(8))) }
                        QuickAsks(items: Self.quick) { send($0) }
                        ForEach(link.approvals) { approval in ApprovalCard(approval: approval) }
                        if !link.activeRuns.isEmpty {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("Working now").font(.caption.weight(.semibold)).textCase(.uppercase).foregroundStyle(.secondary)
                                ForEach(link.activeRuns) { run in RunRow(run: run) }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal)
                        }
                    }
                    Color.clear.frame(height: 1).id("end")
                }
                .frame(maxWidth: .infinity)
                .padding(.bottom, 100)
            }
            .onChange(of: link.chat.last?.text) { _, _ in withAnimation(.smooth) { scroll.scrollTo("end", anchor: .bottom) } }
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Glow(mood: mood, accent: link.look?.accentColor ?? .shuaPurple).ignoresSafeArea())
        .safeAreaInset(edge: .bottom) { if link.state != .unpaired { askBar } }
        .navigationTitle(link.look?.name ?? "Shua")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { Button { docked = true } label: { Image(systemName: "rectangle.landscape.rotate") }.accessibilityLabel("Desk mode") }
            ToolbarItem(placement: .topBarLeading) { StatusDot(state: link.state) }
        }
        .sheet(isPresented: $pairing) { PairView() }
        .fullScreenCover(isPresented: $docked) { DockView(tilt: tilt) }
        .onAppear { tilt.start(); link.start() }
        .onDisappear { tilt.stop() }
        .alert("Shua", isPresented: Binding(get: { link.error != nil || listen.problem != nil }, set: { if !$0 { link.error = nil; listen.problem = nil } })) { Button("OK") {} } message: { Text(link.error ?? listen.problem ?? "") }
    }

    private func send(_ text: String) {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return }
        ask = ""; typing = false
        Task { await link.ask(t) }
    }

    private var askBar: some View {
        HStack(spacing: 10) {
            TextField(listen.listening ? "Listening…" : "Ask \(link.look?.name ?? "Shua")…", text: listen.listening ? .constant(listen.heard) : $ask, axis: .vertical)
                .lineLimit(1...4).focused($typing)
                .padding(.horizontal, 14).padding(.vertical, 10)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                .onSubmit { send(ask) }
            if ask.trimmingCharacters(in: .whitespaces).isEmpty {
                // Hold to talk: let go and Shua gets it.
                Image(systemName: listen.listening ? "waveform" : "mic.fill")
                    .font(.headline).symbolEffect(.variableColor.iterative, isActive: listen.listening)
                    .frame(width: 44, height: 44)
                    .background(listen.listening ? AnyShapeStyle(link.look?.accentColor ?? .shuaPurple) : AnyShapeStyle(.ultraThinMaterial), in: Circle())
                    .scaleEffect(listen.listening ? 1.12 : 1).animation(.spring(response: 0.3), value: listen.listening)
                    .gesture(DragGesture(minimumDistance: 0)
                        .onChanged { _ in if !listen.listening { UIImpactFeedbackGenerator(style: .medium).impactOccurred(); Task { await listen.start() } } }
                        .onEnded { _ in Task { let said = await listen.stop(); send(said) } })
                    .accessibilityLabel("Hold to talk to Shua")
            } else {
                Button { send(ask) } label: { Image(systemName: "arrow.up").font(.headline).frame(width: 44, height: 44) }
                    .buttonStyle(.borderedProminent).clipShape(Circle())
                    .disabled(link.asking)
            }
        }
        .padding(.horizontal).padding(.vertical, 8)
        .background(.bar)
    }

    private var mood: SparkMood {
        if voice.speaking { return .speaking }
        if listen.listening || link.asking { return .thinking }
        return link.mood
    }
    private var caption: (title: String, sub: String?) {
        if listen.listening { return (listen.heard.isEmpty ? "I'm listening…" : listen.heard, nil) }
        return link.caption
    }
}

/// The phone's conversation with Shua: your words on the right, Shua's on the left, its reply streaming in.
private struct Conversation: View {
    @Environment(SparkLink.self) private var link
    let lines: [ShuaLine]
    var body: some View {
        VStack(spacing: 8) {
            ForEach(lines) { line in
                HStack {
                    if line.role == .you { Spacer(minLength: 48) }
                    Group {
                        if line.pending && line.text.isEmpty {
                            HStack(spacing: 5) { ForEach(0..<3) { i in Circle().frame(width: 6, height: 6).phaseAnimator([0.3, 1]) { c, p in c.opacity(p) } animation: { _ in .easeInOut(duration: 0.5).delay(Double(i) * 0.15) } } }
                                .foregroundStyle(.secondary).padding(.vertical, 4)
                        } else {
                            Text(line.text).font(.callout).textSelection(.enabled)
                        }
                    }
                    .padding(.horizontal, 14).padding(.vertical, 10)
                    .foregroundStyle(line.role == .you ? Color.white : (line.failed ? Color.orange : Color.primary))
                    .background(line.role == .you ? AnyShapeStyle((link.look?.accentColor ?? .shuaPurple).gradient) : AnyShapeStyle(.thinMaterial),
                                in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    if line.role == .shua { Spacer(minLength: 48) }
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .padding(.horizontal)
        .animation(.smooth, value: lines)
    }
}

/// One tap for the things you ask most.
private struct QuickAsks: View {
    @Environment(SparkLink.self) private var link
    let items: [(String, String)]
    let send: (String) -> Void
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(items, id: \.0) { item in
                    Button { send(item.0) } label: { Label(item.0, systemImage: item.1).font(.subheadline.weight(.medium)) }
                        .buttonStyle(.bordered).buttonBorderShape(.capsule).tint(link.look?.accentColor ?? .shuaPurple)
                        .disabled(link.asking)
                }
            }
            .padding(.horizontal)
        }
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
        if !activeRuns.isEmpty, let at = lastActivity, Date.now.timeIntervalSince(at) < 10 { return .thinking }
        if !activeRuns.isEmpty { return .thinking }
        return .idle
    }
    var caption: (title: String, sub: String?) {
        switch state {
        case .unpaired: return ("Hi, I'm Shua.", "Pair with your Mac and I'll keep you posted, wherever you are.")
        case .connecting: return ("Reaching your Mac…", nil)
        case .offline(let why): return (why, "I'll reconnect on my own. Is Tailscale on?")
        case .live: break
        }
        if let a = approvals.first { return ("\(a.tool) wants to run", a.summary) }
        if let done = celebrating { return ("Done: \(done.title)", nil) }
        if let run = activeRuns.first { return (run.ticker.isEmpty ? "Working on \(run.title)" : run.ticker, activeRuns.count > 1 ? "+\(activeRuns.count - 1) more" : nil) }
        return ("All quiet.", todayRuns > 0 ? "\(todayRuns) session\(todayRuns == 1 ? "" : "s") today" : "Ask me anything below.")
    }
}

private struct ApprovalCard: View {
    @Environment(SparkLink.self) private var link
    let approval: CrewApproval
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Needs you", systemImage: "hand.raised.fill").font(.caption.weight(.semibold)).foregroundStyle(.orange)
            Text(approval.tool).font(.headline)
            Text(approval.summary).font(.callout.monospaced()).lineLimit(4).foregroundStyle(.secondary)
            if !approval.reason.isEmpty { Text(approval.reason).font(.caption).foregroundStyle(.tertiary) }
            HStack {
                Button("Deny", role: .destructive) { Task { await link.decide(approval, allow: false) } }.buttonStyle(.bordered)
                Spacer()
                Button { Task { await link.decide(approval, allow: true) } } label: { Label("Allow", systemImage: "faceid") }.buttonStyle(.borderedProminent).tint(.orange)
            }
        }
        .padding(16)
        .background(.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(.orange.opacity(0.35)))
        .padding(.horizontal)
    }
}

private struct RunRow: View {
    @Environment(SparkLink.self) private var link
    let run: CrewRun
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Circle().fill(.green).frame(width: 8, height: 8).padding(.top, 6).phaseAnimator([0.4, 1]) { c, p in c.opacity(p) } animation: { _ in .easeInOut(duration: 0.9) }
            VStack(alignment: .leading, spacing: 3) {
                Text(run.title).font(.subheadline.weight(.semibold)).lineLimit(2)
                if !run.ticker.isEmpty { Text(run.ticker).font(.footnote).foregroundStyle(.secondary).lineLimit(2) }
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .swipeActions { Button("Stop", role: .destructive) { Task { await link.cancel(run) } } }
        .contextMenu { Button("Stop this run", systemImage: "stop.circle", role: .destructive) { Task { await link.cancel(run) } } }
    }
}

private struct StatusDot: View {
    let state: SparkLink.State
    var body: some View {
        let (color, label): (Color, String) = switch state {
        case .live: (.green, "Live")
        case .connecting: (.yellow, "Connecting")
        case .offline: (.red, "Offline")
        case .unpaired: (.gray, "Not paired")
        }
        Label { Text(label).font(.caption.weight(.medium)) } icon: { Circle().fill(color).frame(width: 8, height: 8) }
            .labelStyle(.titleAndIcon)
            .fixedSize()
            .padding(.horizontal, 4)
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
