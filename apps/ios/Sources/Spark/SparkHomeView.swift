import SwiftUI

/// Shua on your iPhone, Noir. Black, lit like a stage: your Shua standing in its light, a greeting by name, what it's
/// saying in New York serif, the one thing that needs you on glass, and a single talk orb. Everything else is a swipe
/// up away. Sideways, the same room, side by side. Hold anywhere to talk.
struct SparkHomeView: View {
    @Environment(SparkLink.self) private var link
    @Environment(\.verticalSizeClass) private var vertical
    @State private var tilt = SparkTilt()
    @State private var listen = ShuaListen()
    @State private var pairing = false
    @State private var docked = false
    @State private var activity = false
    @State private var typing = false
    private var voice: ShuaVoice { .shared }
    private var accent: Color { link.look?.accentColor ?? .shuaPurple }

    var body: some View {
        Group {
            if vertical == .compact, link.state != .unpaired { landscape } else { portrait }
        }
        .sheet(isPresented: $pairing) { PairView() }
        .sheet(isPresented: $activity) { ActivitySheet() }
        .sheet(isPresented: $typing) { AskSheet { text in Task { await link.ask(text) } } }
        .fullScreenCover(isPresented: $docked) { DockView(tilt: tilt) }
        .toolbar(.hidden, for: .navigationBar)
        .onAppear { tilt.start(); link.start() }
        .onDisappear { tilt.stop() }
        .alert("Shua", isPresented: Binding(get: { link.error != nil || listen.problem != nil }, set: { if !$0 { link.error = nil; listen.problem = nil } })) { Button("OK") {} } message: { Text(link.error ?? listen.problem ?? "") }
    }

    // MARK: Portrait

    private var portrait: some View {
        ZStack {
            NoirBackdrop(mood: mood, accent: accent, tilt: tilt.gaze, focus: UnitPoint(x: 0.5, y: 0.27))
            VStack(spacing: 0) {
                TopLine(docked: $docked).padding(.horizontal, 24).padding(.top, 6)
                ZStack(alignment: .bottom) {
                    ShuaFloor(accent: accent).offset(y: 18)
                    ShuaCharacter(mood: mood, tilt: tilt.gaze).frame(minHeight: 150, maxHeight: 270)
                }
                .padding(.top, 10)
                .layoutPriority(-1) // Shua gives up room first, so nothing rides up under the status bar
                Headline(listening: listen.listening, heard: listen.heard, short: !link.approvals.isEmpty)
                    .padding(.horizontal, 32).padding(.top, 22)
                Spacer(minLength: 14)
                if link.state == .unpaired {
                    Button { pairing = true } label: { Text("Pair with your Mac").font(Noir.title).frame(maxWidth: .infinity).padding(.vertical, 6) }
                        .buttonStyle(.glassProminent).tint(accent).controlSize(.large).padding(.horizontal, 32)
                    Spacer(minLength: 100)
                } else {
                    if let a = link.approvals.first { NeedsYouCard(approval: a).padding(.horizontal, 20).transition(.move(edge: .bottom).combined(with: .opacity)) }
                    Spacer(minLength: 14)
                    Controls(listen: listen, accent: accent, typing: $typing, activity: $activity, start: startListening, finish: finishListening)
                    Text(link.asking ? "Shua is on it…" : "Hold to talk · swipe up for activity").font(.system(size: 12, weight: .medium)).foregroundStyle(Noir.faint).padding(.top, 10)
                        .contentTransition(.opacity)
                    Spacer(minLength: 86) // the tab bar
                }
            }
            if listen.listening { ListeningOverlay(heard: listen.heard, accent: accent).transition(.opacity) }
        }
        .contentShape(Rectangle())
        .simultaneousGesture(holdToTalk)
        .simultaneousGesture(DragGesture(minimumDistance: 30).onEnded { v in if v.translation.height < -60, abs(v.translation.width) < 80, link.state != .unpaired { activity = true } })
        .animation(.smooth(duration: 0.4), value: listen.listening)
        .animation(.spring(response: 0.5, dampingFraction: 0.85), value: link.approvals.first?.id)
    }

    // MARK: Landscape

    private var landscape: some View {
        GeometryReader { geo in
            ZStack {
                NoirBackdrop(mood: mood, accent: accent, tilt: tilt.gaze, focus: UnitPoint(x: 0.24, y: 0.42), reach: 340)
                HStack(spacing: 0) {
                    VStack(spacing: 4) {
                        ZStack(alignment: .bottom) {
                            ShuaFloor(accent: accent).scaleEffect(0.8).offset(y: 12)
                            ShuaCharacter(mood: mood, tilt: tilt.gaze).frame(height: geo.size.height * 0.56)
                        }
                        Headline(listening: listen.listening, heard: listen.heard, compact: true, short: true).padding(.horizontal, 28).padding(.top, 8)
                    }
                    .padding(.bottom, 64) // clear of the tab bar
                    .frame(width: geo.size.width * 0.48)
                    VStack(spacing: 14) {
                        TopLine(docked: $docked)
                        Spacer(minLength: 0)
                        if let a = link.approvals.first { NeedsYouCard(approval: a) } else { Summary() }
                        Spacer(minLength: 0)
                        Controls(listen: listen, accent: accent, typing: $typing, activity: $activity, start: startListening, finish: finishListening)
                    }
                    .padding(.horizontal, 24).padding(.top, 14).padding(.bottom, 74)
                    .frame(width: geo.size.width * 0.52)
                }
                if listen.listening { ListeningOverlay(heard: listen.heard, accent: accent).transition(.opacity) }
            }
            .contentShape(Rectangle())
            .simultaneousGesture(holdToTalk)
            .animation(.smooth(duration: 0.4), value: listen.listening)
        }
        .ignoresSafeArea(edges: [.top, .horizontal])
    }

    // MARK: Talking

    private var holdToTalk: some Gesture {
        LongPressGesture(minimumDuration: 0.35).sequenced(before: DragGesture(minimumDistance: 0))
            .onChanged { value in if case .second(true, _) = value, !listen.listening, link.state != .unpaired { startListening() } }
            .onEnded { _ in finishListening() }
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

/// The top line: live with which Mac, and the desk clock.
private struct TopLine: View {
    @Environment(SparkLink.self) private var link
    @Binding var docked: Bool
    var body: some View {
        HStack {
            StatusPill(state: link.state, mac: link.pairing?.name)
            Spacer()
            if link.state != .unpaired {
                Button { docked = true } label: { Label("Desk", systemImage: "clock").font(.system(size: 13, weight: .semibold)) }
                    .buttonStyle(.glass).controlSize(.small)
            }
        }
    }
}

/// The words under Shua. Resting: "Good morning, Josh." and what matters most. Talking: Shua's reply, in serif, as it
/// streams. Listening: your words.
struct Headline: View {
    @Environment(SparkLink.self) private var link
    var listening = false
    var heard = ""
    var compact = false
    /// A card below already says what needs you: keep this to a few lines.
    var short = false
    var body: some View {
        VStack(spacing: 10) {
            if listening {
                Text(heard.isEmpty ? "I'm listening…" : heard).font(Noir.voice(compact ? 22 : 26)).foregroundStyle(.white)
            } else if let line = link.chat.last(where: { $0.role == .shua }), line.pending || Date.now.timeIntervalSince(line.at) < 120 {
                if line.pending && line.text.isEmpty {
                    Text("Thinking…").font(Noir.voice(compact ? 22 : 26)).foregroundStyle(Noir.soft)
                } else {
                    Text(SparkLink.styled(line.text)).font(Noir.voice(compact ? 19 : 22)).foregroundStyle(line.failed ? .orange : .white)
                        .lineLimit(short ? 3 : compact ? 6 : 7).minimumScaleFactor(0.85)
                }
            } else {
                Text(link.state == .unpaired ? "Hi, I'm \(link.look?.name ?? "Shua")." : Plainly.hello(link.look?.firstName))
                    .font(Noir.display(compact ? 28 : 34)).tracking(-0.4).foregroundStyle(.white)
                Text(link.state == .unpaired ? "Pair with your Mac and I'll keep you posted, wherever you are." : link.statusSentence)
                    .font(Noir.lead).foregroundStyle(Noir.soft).lineSpacing(4).lineLimit(short ? 2 : 3)
            }
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .fixedSize(horizontal: false, vertical: true)
        .contentTransition(.opacity)
        .animation(.smooth(duration: 0.35), value: link.chat.last?.text)
    }
}

/// The one control cluster, in liquid glass: type · talk · activity.
private struct Controls: View {
    @Environment(SparkLink.self) private var link
    let listen: ShuaListen
    let accent: Color
    @Binding var typing: Bool
    @Binding var activity: Bool
    let start: () -> Void
    let finish: () -> Void
    var body: some View {
        GlassEffectContainer(spacing: 18) {
            HStack(spacing: 22) {
                Button { typing = true } label: { Image(systemName: "keyboard").font(.system(size: 18, weight: .medium)).frame(width: 52, height: 52) }
                    .buttonStyle(.plain).glassEffect(.regular.interactive(), in: Circle())
                    .accessibilityLabel("Type to Shua")
                ZStack {
                    ShuaAura(active: listen.listening || ShuaVoice.shared.speaking, accent: accent).frame(width: 88, height: 88)
                    Image(systemName: listen.listening ? "waveform" : "mic.fill")
                        .font(.system(size: 28, weight: .semibold)).foregroundStyle(.white)
                        .symbolEffect(.variableColor.iterative, isActive: listen.listening)
                        .frame(width: 88, height: 88)
                        .glassEffect(.regular.tint(accent.opacity(0.85)).interactive(), in: Circle())
                        .shadow(color: accent.opacity(0.45), radius: 24, y: 8)
                        .scaleEffect(listen.listening ? 1.12 : 1)
                        .gesture(DragGesture(minimumDistance: 0).onChanged { _ in if !listen.listening { start() } }.onEnded { _ in finish() })
                        .accessibilityLabel("Hold to talk to Shua")
                }
                Button { activity = true } label: {
                    ZStack(alignment: .topTrailing) {
                        Image(systemName: "square.stack").font(.system(size: 18, weight: .medium)).frame(width: 52, height: 52)
                        let working = link.activeRuns.filter { $0.status != "awaiting_approval" }.count
                        if working > 0 {
                            Text("\(working)").font(.system(size: 11, weight: .bold)).foregroundStyle(.black).frame(width: 18, height: 18).background(.green, in: Circle()).offset(x: -4, y: 4)
                        }
                    }
                }
                .buttonStyle(.plain).glassEffect(.regular.interactive(), in: Circle())
                .accessibilityLabel("Activity")
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: listen.listening)
    }
}

/// Glass card house style: depth from Liquid Glass, not a flat fill.
struct ShuaCard<Content: View>: View {
    let title: String, symbol: String, tint: Color
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Label { Text(title).noirLabel(tint) } icon: { Image(systemName: symbol).font(.system(size: 11, weight: .bold)).foregroundStyle(tint) }
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
    }
}

/// The one thing that needs you, on glass: in words, why, the exact command a tap away, and Allow (Face ID).
struct NeedsYouCard: View {
    @Environment(SparkLink.self) private var link
    let approval: CrewApproval
    @State private var exact = false
    var body: some View {
        ShuaCard(title: "Needs your OK", symbol: "hand.raised.fill", tint: .orange) {
            VStack(alignment: .leading, spacing: 5) {
                Text("\(title) wants to \(approval.what.isEmpty ? "go ahead" : approval.what)").font(Noir.title).foregroundStyle(.white)
                if !approval.why.isEmpty { Text(approval.why).font(.system(size: 15)).foregroundStyle(Noir.soft) }
            }
            if let command = approval.command {
                DisclosureGroup(isExpanded: $exact) {
                    Text(command).font(.system(size: 13, design: .monospaced)).foregroundStyle(Noir.soft).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading).padding(.top, 6)
                } label: { Text("The exact command").font(.system(size: 13, weight: .medium)).foregroundStyle(Noir.faint) }
                .tint(Noir.faint)
            }
            HStack(spacing: 10) {
                Button { Task { await link.decide(approval, allow: false) } } label: { Text("Not now").font(Noir.title).padding(.horizontal, 6).padding(.vertical, 4) }
                    .buttonStyle(.glass).controlSize(.large).fixedSize()
                Button { Task { await link.decide(approval, allow: true) } } label: {
                    Label("Allow", systemImage: "faceid").font(Noir.title).foregroundStyle(.black).frame(maxWidth: .infinity).padding(.vertical, 4)
                }
                .buttonStyle(.glassProminent).tint(.white).controlSize(.large)
            }
        }
    }
    private var title: String { approval.run.flatMap { id in link.runs.first { $0.id == id }?.title } ?? "Your crew" }
}

/// When nothing needs you (landscape): what's moving, in one glass line.
private struct Summary: View {
    @Environment(SparkLink.self) private var link
    var body: some View {
        let working = link.activeRuns.filter { $0.status != "awaiting_approval" }
        ShuaCard(title: working.isEmpty ? "All clear" : "Working now", symbol: working.isEmpty ? "checkmark" : "bolt.fill", tint: working.isEmpty ? Noir.faint : .green) {
            if let run = working.first {
                Text(run.title).font(Noir.title)
                if !run.ticker.isEmpty { Text(run.ticker).font(.system(size: 15)).foregroundStyle(Noir.soft).lineLimit(2) }
            } else {
                Text("Nothing needs you. Ask me anything.").font(Noir.body).foregroundStyle(Noir.soft)
            }
        }
    }
}

/// Everything else, a swipe up away: what's working, what finished, what's coming, ideas, the conversation.
struct ActivitySheet: View {
    @Environment(SparkLink.self) private var link
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    ForEach(link.approvals.dropFirst()) { NeedsYouCard(approval: $0) }
                    WorkingCard()
                    DoneCard()
                    if let next = link.brief?.next, !next.isEmpty {
                        ShuaCard(title: "Coming up on its own", symbol: "calendar", tint: .cyan) {
                            ForEach(next) { item in
                                HStack { Text(item.name).font(Noir.body); Spacer(); Text(item.at, format: .dateTime.hour().minute()).font(Noir.body.monospacedDigit()).foregroundStyle(Noir.soft) }
                            }
                        }
                    }
                    Ideas { dismiss() }
                    if !link.chat.isEmpty { ConversationCard() }
                }
                .padding(20)
            }
            .scrollIndicators(.hidden)
            .background(NoirBackdrop(mood: .idle, accent: link.look?.accentColor ?? .shuaPurple, focus: UnitPoint(x: 0.5, y: 0), reach: 300))
            .navigationTitle("Activity").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
        .presentationBackground(.black)
    }
}

struct WorkingCard: View {
    @Environment(SparkLink.self) private var link
    var body: some View {
        let working = link.activeRuns.filter { $0.status != "awaiting_approval" }
        ShuaCard(title: "Working now", symbol: "bolt.fill", tint: .green) {
            if working.isEmpty { Text("Nobody's working right now.").font(Noir.body).foregroundStyle(Noir.soft) }
            ForEach(working.prefix(5)) { run in
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Circle().fill(.green).frame(width: 7, height: 7).phaseAnimator([0.35, 1]) { c, p in c.opacity(p) } animation: { _ in .easeInOut(duration: 0.9) }
                    VStack(alignment: .leading, spacing: 3) {
                        Text(run.title).font(Noir.title)
                        if !run.ticker.isEmpty { Text(run.ticker).font(.system(size: 15)).foregroundStyle(Noir.soft) }
                    }
                    Spacer(minLength: 8)
                    if run.createdAt > 0 { Text(Plainly.since(Date.now.timeIntervalSince1970 - run.createdAt / 1000)).font(.system(size: 13).monospacedDigit()).foregroundStyle(Noir.faint) }
                }
                .contextMenu { Button("Stop this", systemImage: "stop.circle", role: .destructive) { Task { await link.cancel(run) } } }
            }
        }
    }
}

struct DoneCard: View {
    @Environment(SparkLink.self) private var link
    var body: some View {
        let done = link.runs.filter(\.finished).sorted { $0.updatedAt > $1.updatedAt }
        if !done.isEmpty {
            ShuaCard(title: "Finished", symbol: "checkmark.circle.fill", tint: link.look?.accentColor ?? .shuaPurple) {
                ForEach(done.prefix(5)) { run in
                    VStack(alignment: .leading, spacing: 3) {
                        Text(run.title).font(Noir.title)
                        if !run.ticker.isEmpty { Text(run.ticker).font(.system(size: 15)).foregroundStyle(Noir.soft) }
                    }
                }
            }
        }
    }
}

/// Things to ask, as glass chips.
private struct Ideas: View {
    @Environment(SparkLink.self) private var link
    let asked: () -> Void
    var body: some View {
        ShuaCard(title: "Try", symbol: "sparkles", tint: Noir.faint) {
            let items = ["What's going on?", "Plan my day", "Start a 25-minute focus", "Play some focus music", "Have the crew start something"]
            FlowLayout(spacing: 8) {
                ForEach(items, id: \.self) { item in
                    Button { asked(); Task { await link.ask(item) } } label: { Text(item).font(.system(size: 14, weight: .medium)).padding(.horizontal, 4) }
                        .buttonStyle(.glass).controlSize(.small).disabled(link.asking)
                }
            }
        }
    }
}

/// Wraps chips onto as many lines as they need.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 320
        var x: CGFloat = 0, y: CGFloat = 0, row: CGFloat = 0
        for v in subviews { let s = v.sizeThatFits(.unspecified); if x + s.width > width, x > 0 { x = 0; y += row + spacing; row = 0 }; x += s.width + spacing; row = max(row, s.height) }
        return CGSize(width: width, height: y + row)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, row: CGFloat = 0
        for v in subviews { let s = v.sizeThatFits(.unspecified); if x + s.width > bounds.maxX, x > bounds.minX { x = bounds.minX; y += row + spacing; row = 0 }; v.place(at: CGPoint(x: x, y: y), proposal: .unspecified); x += s.width + spacing; row = max(row, s.height) }
    }
}

/// The conversation on this phone, as readable as a message thread.
private struct ConversationCard: View {
    @Environment(SparkLink.self) private var link
    var body: some View {
        ShuaCard(title: "Conversation", symbol: "text.bubble", tint: Noir.faint) {
            ForEach(link.chat.suffix(12)) { line in
                HStack {
                    if line.role == .you { Spacer(minLength: 40) }
                    Text(line.role == .shua ? SparkLink.styled(line.text.isEmpty ? "…" : line.text) : AttributedString(line.text))
                        .font(line.role == .shua ? Noir.voice(17) : Noir.body).lineSpacing(2).textSelection(.enabled)
                        .foregroundStyle(line.failed ? .orange : .white)
                        .padding(.horizontal, line.role == .you ? 14 : 0).padding(.vertical, line.role == .you ? 9 : 2)
                        .background(line.role == .you ? AnyShapeStyle(.white.opacity(0.12)) : AnyShapeStyle(.clear), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    if line.role == .shua { Spacer(minLength: 24) }
                }
            }
        }
    }
}

/// While you hold: the room dims and your words appear, in serif, big.
private struct ListeningOverlay: View {
    let heard: String
    let accent: Color
    var body: some View {
        ZStack {
            Rectangle().fill(.black.opacity(0.6)).ignoresSafeArea()
            VStack(spacing: 18) {
                Image(systemName: "waveform").font(.system(size: 40, weight: .semibold)).foregroundStyle(accent).symbolEffect(.variableColor.iterative)
                Text(heard.isEmpty ? "Listening…" : heard).font(Noir.voice(30)).multilineTextAlignment(.center).padding(.horizontal, 32)
                Text("Let go to send").font(.system(size: 13, weight: .medium)).foregroundStyle(Noir.faint)
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
                .font(Noir.voice(22)).lineLimit(3...8).focused($focused).padding(24)
                .frame(maxHeight: .infinity, alignment: .top)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) { Button("Send") { send(text); dismiss() }.disabled(text.trimmingCharacters(in: .whitespaces).isEmpty) }
                }
                .navigationTitle("Ask Shua").navigationBarTitleDisplayMode(.inline)
                .onAppear { focused = true }
        }
        .presentationDetents([.medium])
        .presentationBackground(.black)
    }
}

/// Status in the corner: a calm dot and a word, on glass.
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
        HStack(spacing: 7) { Circle().fill(color).frame(width: 7, height: 7).shadow(color: color, radius: 4); Text(label).font(.system(size: 13, weight: .semibold)) }
            .padding(.horizontal, 12).padding(.vertical, 7)
            .fixedSize()
            .glassEffect(.regular, in: Capsule())
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
