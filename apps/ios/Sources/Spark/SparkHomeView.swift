import SwiftUI

/// Shua on your iPhone: the character first, one line of what's happening, then only what needs you and what's moving.
struct SparkHomeView: View {
    @Environment(SparkLink.self) private var link
    @State private var tilt = SparkTilt()
    @State private var ask = ""
    @State private var pairing = false
    @State private var docked = false
    @FocusState private var typing: Bool

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                SparkFace(mood: mood, tilt: tilt.gaze)
                    .frame(height: 230)
                    .padding(.top, 8)
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
            }
            .frame(maxWidth: .infinity)
            .padding(.bottom, 90)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Glow(mood: mood).ignoresSafeArea())
        .safeAreaInset(edge: .bottom) { if link.state != .unpaired { askBar } }
        .navigationTitle("Shua")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { Button { docked = true } label: { Image(systemName: "rectangle.landscape.rotate") }.accessibilityLabel("Desk mode") }
            ToolbarItem(placement: .topBarLeading) { StatusDot(state: link.state) }
        }
        .sheet(isPresented: $pairing) { PairView() }
        .fullScreenCover(isPresented: $docked) { DockView(tilt: tilt) }
        .onAppear { tilt.start(); link.start() }
        .onDisappear { tilt.stop() }
        .alert("Shua", isPresented: Binding(get: { link.error != nil }, set: { if !$0 { link.error = nil } })) { Button("OK") {} } message: { Text(link.error ?? "") }
    }

    private var askBar: some View {
        HStack(spacing: 10) {
            TextField("Ask the crew…", text: $ask, axis: .vertical)
                .lineLimit(1...4).focused($typing)
                .padding(.horizontal, 14).padding(.vertical, 10)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            Button {
                let text = ask
                Task { if await link.start(ask: text) { ask = ""; typing = false } }
            } label: { Image(systemName: "arrow.up").font(.headline).frame(width: 40, height: 40) }
                .buttonStyle(.borderedProminent).clipShape(Circle())
                .disabled(ask.trimmingCharacters(in: .whitespaces).isEmpty)
        }
        .padding(.horizontal).padding(.vertical, 8)
        .background(.bar)
    }

    private var mood: SparkMood { link.mood }
    private var caption: (title: String, sub: String?) { link.caption }
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
    var body: some View {
        let tint: Color = switch mood {
        case .concerned: .orange
        case .happy: .green
        case .thinking, .speaking: .cyan
        case .sleepy: .indigo
        case .idle: .purple
        }
        ZStack {
            Color.black
            RadialGradient(colors: [tint.opacity(0.35), .clear], center: .top, startRadius: 0, endRadius: 420)
        }
        .animation(.smooth(duration: 1.2), value: mood)
    }
}
