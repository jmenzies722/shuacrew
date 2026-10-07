import SwiftUI

extension CrewRun {
    var updated: Date { Date(timeIntervalSince1970: updatedAt / 1000) }
    var started: Date? { createdAt > 0 ? Date(timeIntervalSince1970: createdAt / 1000) : nil }
    /// The run's state in a word, and its colour.
    var state: (word: String, color: Color, symbol: String) {
        switch status {
        case "awaiting_approval": ("Needs you", .orange, "hand.raised.fill")
        case "queued", "planning": ("Getting ready", .cyan, "hourglass")
        case "running": ("Working", .green, "bolt.fill")
        case "reviewing": ("Ready to review", .yellow, "eye.fill")
        case "done", "merged": ("Done", .green, "checkmark.circle.fill")
        case "failed": ("Didn't work", .red, "exclamationmark.triangle.fill")
        case "cancelled", "canceled": ("Stopped", .gray, "stop.circle.fill")
        default: (status.capitalized, .gray, "circle.dotted")
        }
    }
}

// MARK: Today

/// Today: your day, told by Shua. The brief up top (talk me through it), the day's pulse, what needs you, and the day
/// itself as a timeline — what finished, what's working now, what runs on its own later. Built from the crew's own
/// record, live.
struct ShuaTodayView: View {
    @Environment(SparkLink.self) private var link
    var body: some View {
        if link.pairing == nil { PairFirst(title: "Today", line: "Pair with your Mac and your day shows up here: what needs you, what's working, what finished.") } else { day }
    }

    private var day: some View {
        ZStack {
            NoirBackdrop(mood: link.mood, accent: link.look?.accentColor ?? .shuaPurple, focus: UnitPoint(x: 0.82, y: 0.04), reach: 420)
            ScrollView {
                VStack(spacing: 18) {
                    PageTitle(title: "Today", subtitle: Date.now.formatted(.dateTime.weekday(.wide).month(.wide).day()))
                    BriefCard().padding(.horizontal, 20)
                    Pulse().padding(.horizontal, 20).scrollSettle()
                    ForEach(link.approvals) { NeedsYouCard(approval: $0).padding(.horizontal, 20).scrollSettle() }
                    DayTimeline().padding(.horizontal, 20).scrollSettle()
                }
                .padding(.bottom, 40)
                .frame(maxWidth: 620).frame(maxWidth: .infinity)
            }
            .scrollIndicators(.hidden)
            .refreshable { await link.reload() }
            EdgeFade(edge: .top, height: 100)
        }
        .toolbar(.hidden, for: .navigationBar)
    }
}

/// Shua's brief: the headline in its voice, the few lines that matter, and one tap to hear it.
private struct BriefCard: View {
    @Environment(SparkLink.self) private var link
    var body: some View {
        let accent = link.look?.accentColor ?? .shuaPurple
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 14) {
                ShuaCharacter(mood: link.mood, lively: 0.6).frame(width: 58, height: 58)
                VStack(alignment: .leading, spacing: 6) {
                    Text("Shua's brief").noirLabel(accent)
                    Text(link.brief?.headline.isEmpty == false ? link.brief!.headline : link.statusSentence)
                        .font(Noir.voice(20)).lineSpacing(2).fixedSize(horizontal: false, vertical: true)
                }
            }
            if let lines = link.brief?.lines, !lines.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(Array(lines.prefix(4).enumerated()), id: \.offset) { _, line in
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Circle().fill(accent.opacity(0.8)).frame(width: 5, height: 5).offset(y: -3)
                            Text(line).font(.system(size: 15)).foregroundStyle(Noir.soft).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
            Button { Task { await link.ask("What's going on? Give me the short version.") } } label: {
                Label(link.asking ? "Shua is on it…" : "Talk me through it", systemImage: "waveform").font(Noir.title).frame(maxWidth: .infinity).padding(.vertical, 3)
            }
            .buttonStyle(.glassProminent).tint(accent).controlSize(.large).disabled(link.asking)
        }
        .padding(20)
        .litGlass(30, tint: accent)
    }
}

/// The day's pulse: three live numbers.
private struct Pulse: View {
    @Environment(SparkLink.self) private var link
    var body: some View {
        HStack(spacing: 10) {
            tile(link.approvals.count, "need you", "hand.raised.fill", .orange)
            tile(link.activeRuns.filter { $0.status != "awaiting_approval" }.count, "working", "bolt.fill", .green)
            tile(link.runs.filter(\.finished).count, "done", "checkmark", link.look?.accentColor ?? .shuaPurple)
        }
    }
    private func tile(_ n: Int, _ label: String, _ symbol: String, _ tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Image(systemName: symbol).font(.system(size: 13, weight: .bold)).foregroundStyle(n > 0 ? tint : Noir.faint)
                .frame(width: 28, height: 28).background((n > 0 ? tint : .white).opacity(0.14), in: Circle())
            Text("\(n)").font(.system(size: 30, weight: .bold).monospacedDigit()).contentTransition(.numericText())
            Text(label).noirLabel()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .litGlass(24)
        .animation(.smooth, value: n)
    }
}

/// The day as a timeline: finished, working now, and what runs on its own later, in time order, with "now" marked.
private struct DayTimeline: View {
    @Environment(SparkLink.self) private var link
    private struct Moment: Identifiable {
        let id: String; let at: Date; let title: String; let detail: String; let color: Color; let live: Bool; let later: Bool
    }
    var body: some View {
        let past = link.runs.filter { Calendar.current.isDateInToday($0.updated) || $0.active }
            .map { Moment(id: $0.id, at: $0.active ? ($0.started ?? $0.updated) : $0.updated, title: $0.title, detail: $0.ticker, color: $0.state.color, live: $0.active, later: false) }
            .sorted { $0.at < $1.at }
        let later = (link.brief?.next ?? []).filter { $0.at > .now }
            .map { Moment(id: $0.id, at: $0.at, title: $0.name, detail: "Runs on its own", color: .cyan, live: false, later: true) }
        ShuaCard(title: "Your day", symbol: "clock.fill", tint: Noir.soft) {
            if past.isEmpty && later.isEmpty {
                Text("Nothing yet today. Hand the crew something, or ask Shua to plan your day.").font(Noir.body).foregroundStyle(Noir.soft)
            }
            VStack(spacing: 0) {
                ForEach(past) { row($0) }
                if !later.isEmpty || !past.isEmpty { now }
                ForEach(later) { row($0) }
            }
        }
    }

    private func row(_ m: Moment) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text(m.at, format: .dateTime.hour().minute()).font(.system(size: 12, weight: .semibold).monospacedDigit())
                .foregroundStyle(Noir.faint).frame(width: 62, alignment: .trailing).padding(.top, 2)
            VStack(spacing: 0) {
                Circle().fill(m.later ? .clear : m.color).overlay(Circle().strokeBorder(m.color, lineWidth: 1.5)).frame(width: 10, height: 10).padding(.top, 4)
                    .phaseAnimator(m.live ? [0.4, 1] : [1]) { c, p in c.opacity(p) } animation: { _ in .easeInOut(duration: 0.9) }
                Rectangle().fill(.white.opacity(0.12)).frame(width: 1.5).frame(maxHeight: .infinity)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(m.title).font(Noir.title).foregroundStyle(m.later ? Noir.soft : .white)
                if !m.detail.isEmpty { Text(m.detail).font(.system(size: 14)).foregroundStyle(Noir.soft).lineLimit(2) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.bottom, 18)
        }
    }

    private var now: some View {
        HStack(spacing: 12) {
            Text("Now").font(.system(size: 12, weight: .bold)).foregroundStyle(link.look?.accentColor ?? .shuaPurple).frame(width: 62, alignment: .trailing)
            Capsule().fill((link.look?.accentColor ?? .shuaPurple).gradient).frame(height: 2)
        }
        .padding(.bottom, 18)
    }
}

// MARK: Crew

/// Crew: hand them something (or start from a template), see what needs you, watch who's working live, and look back
/// at what they did. Tap any session for its details.
struct ShuaCrewView: View {
    @Environment(SparkLink.self) private var link
    @State private var task = ""
    @State private var open: CrewRun?
    @FocusState private var typing: Bool
    private let starters = ["Fix the bug where ", "Build a landing page for ", "Research ", "Write tests for ", "Review the code in "]

    var body: some View {
        if link.pairing == nil { PairFirst(title: "Crew", line: "Pair with your Mac to watch your crew work live, hand them tasks and approve what they ask.") } else { crew }
    }

    private var crew: some View {
        let accent = link.look?.accentColor ?? .shuaPurple
        let working = link.activeRuns.filter { $0.status != "awaiting_approval" }
        let recent = link.runs.filter { !$0.active }.sorted { $0.updatedAt > $1.updatedAt }.prefix(12)
        return ZStack {
            NoirBackdrop(mood: working.isEmpty ? .idle : .thinking, accent: accent, focus: UnitPoint(x: 0.18, y: 0.04), reach: 420)
            ScrollView {
                VStack(spacing: 18) {
                    PageTitle(title: "Crew", subtitle: "\(working.count) working · \(link.approvals.count) waiting on you")
                    composer(accent).padding(.horizontal, 20)
                    ForEach(link.approvals) { NeedsYouCard(approval: $0).padding(.horizontal, 20).scrollSettle() }
                    if !working.isEmpty {
                        VStack(spacing: 10) {
                            section("Working now", "bolt.fill", .green)
                            ForEach(working) { run in LiveRun(run: run).onTapGesture { open = run }.scrollSettle() }
                        }
                        .padding(.horizontal, 20)
                    }
                    if !recent.isEmpty {
                        VStack(spacing: 10) {
                            section("Recently", "clock.arrow.circlepath", Noir.soft)
                            VStack(spacing: 0) {
                                ForEach(Array(recent.enumerated()), id: \.element.id) { i, run in
                                    Button { open = run } label: { RunRow(run: run) }.buttonStyle(.plain)
                                    if i < recent.count - 1 { Divider().overlay(.white.opacity(0.08)).padding(.leading, 52) }
                                }
                            }
                            .padding(.vertical, 6)
                            .litGlass(26)
                            .scrollSettle()
                        }
                        .padding(.horizontal, 20)
                    }
                }
                .padding(.bottom, 40)
                .frame(maxWidth: 620).frame(maxWidth: .infinity)
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
            .refreshable { await link.reload() }
            EdgeFade(edge: .top, height: 100)
        }
        .toolbar(.hidden, for: .navigationBar)
        .sheet(item: $open) { RunSheet(run: $0) }
    }

    private func composer(_ accent: Color) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .bottom, spacing: 10) {
                TextField("What should the crew do?", text: $task, axis: .vertical).lineLimit(1...6).focused($typing)
                    .font(.system(size: 18, weight: .medium))
                Button {
                    let t = task
                    Task { if await link.start(ask: t) { withAnimation(.smooth) { task = ""; typing = false } } }
                } label: {
                    Image(systemName: "arrow.up").font(.system(size: 16, weight: .bold)).foregroundStyle(.white).frame(width: 38, height: 38)
                        .background(accent.gradient, in: Circle())
                }
                .disabled(task.trimmingCharacters(in: .whitespaces).isEmpty)
                .opacity(task.trimmingCharacters(in: .whitespaces).isEmpty ? 0.4 : 1)
            }
            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    ForEach(starters, id: \.self) { s in
                        Button { task = s; typing = true } label: { Text(s.trimmingCharacters(in: .whitespaces) + "…").font(.system(size: 13, weight: .semibold)).padding(.horizontal, 12).padding(.vertical, 7) }
                            .buttonStyle(.plain).glassEffect(.regular.interactive(), in: Capsule())
                    }
                }
            }
            .scrollIndicators(.hidden)
            Text("Starts a crew session on your Mac. Anything that needs your OK comes back here.").font(.system(size: 12)).foregroundStyle(Noir.faint)
        }
        .padding(18)
        .litGlass(28)
    }

    private func section(_ title: String, _ symbol: String, _ tint: Color) -> some View {
        Label { Text(title).noirLabel(tint) } icon: { Image(systemName: symbol).font(.system(size: 11, weight: .bold)).foregroundStyle(tint) }
            .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 6)
    }
}

/// A session at work: what it is, what it's doing this second, how long it's been going, and a light that runs.
private struct LiveRun: View {
    let run: CrewRun
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(run.title).font(Noir.title).lineLimit(2)
                Spacer(minLength: 8)
                if let s = run.started {
                    TimelineView(.periodic(from: .now, by: 30)) { _ in Text(Plainly.since(Date.now.timeIntervalSince(s))).font(.system(size: 12, weight: .semibold).monospacedDigit()).foregroundStyle(Noir.faint) }
                }
            }
            if !run.ticker.isEmpty { Text(run.ticker).font(.system(size: 15)).foregroundStyle(Noir.soft).lineLimit(3) }
            Working(color: run.state.color)
        }
        .padding(18)
        .litGlass(24, tint: run.state.color)
    }
}

/// An indeterminate light running along a track: work in progress, without pretending to know how far.
private struct Working: View {
    let color: Color
    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30)) { ctx in // 30 a second is smooth; the screen's 120 isn't needed
            GeometryReader { geo in
                let t = ctx.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 1.6) / 1.6
                Capsule().fill(.white.opacity(0.08))
                    .overlay(alignment: .leading) {
                        Capsule().fill(LinearGradient(colors: [.clear, color, .clear], startPoint: .leading, endPoint: .trailing))
                            .frame(width: geo.size.width * 0.35).offset(x: (geo.size.width * 1.35) * t - geo.size.width * 0.35)
                    }
                    .clipShape(Capsule())
            }
        }
        .frame(height: 3)
    }
}

private struct RunRow: View {
    let run: CrewRun
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: run.state.symbol).font(.system(size: 14, weight: .semibold)).foregroundStyle(run.state.color)
                .frame(width: 28, height: 28).background(run.state.color.opacity(0.14), in: Circle())
            VStack(alignment: .leading, spacing: 3) {
                Text(run.title).font(.system(size: 16, weight: .semibold)).foregroundStyle(.white).lineLimit(2)
                if !run.ticker.isEmpty { Text(run.ticker).font(.system(size: 14)).foregroundStyle(Noir.soft).lineLimit(2) }
            }
            Spacer(minLength: 6)
            Text(run.updated, format: .relative(presentation: .numeric, unitsStyle: .abbreviated)).font(.system(size: 12)).foregroundStyle(Noir.faint)
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .contentShape(Rectangle())
    }
}

/// One session, opened: where it stands, when it started, and what you can do — ask Shua about it, or stop it.
private struct RunSheet: View {
    @Environment(SparkLink.self) private var link
    @Environment(\.dismiss) private var dismiss
    @Environment(\.goHome) private var goHome
    let run: CrewRun
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Label(run.state.word, systemImage: run.state.symbol).font(.system(size: 13, weight: .bold)).foregroundStyle(run.state.color)
                        .padding(.horizontal, 12).padding(.vertical, 7).background(run.state.color.opacity(0.14), in: Capsule())
                    Text(run.title).font(Noir.display(28)).tracking(-0.4).fixedSize(horizontal: false, vertical: true)
                    if !run.ticker.isEmpty { Text(run.ticker).font(Noir.voice(19)).foregroundStyle(Noir.soft).fixedSize(horizontal: false, vertical: true) }
                    VStack(spacing: 0) {
                        if let s = run.started { fact("Started", s.formatted(date: .omitted, time: .shortened)) }
                        fact("Last update", run.updated.formatted(.relative(presentation: .named)))
                    }
                    .litGlass(20)
                    if run.active { Working(color: run.state.color) }
                    Button { dismiss(); goHome(); Task { await link.ask("What's the latest on “\(run.title)”? Short version.") } } label: {
                        Label("Ask Shua about it", systemImage: "sparkles").font(Noir.title).frame(maxWidth: .infinity).padding(.vertical, 3)
                    }
                    .buttonStyle(.glassProminent).tint(link.look?.accentColor ?? .shuaPurple).controlSize(.large)
                    if run.active {
                        Button(role: .destructive) { Task { await link.cancel(run); dismiss() } } label: {
                            Label("Stop this session", systemImage: "stop.circle").font(Noir.title).frame(maxWidth: .infinity).padding(.vertical, 3)
                        }
                        .buttonStyle(.glass).controlSize(.large)
                    }
                }
                .padding(24)
            }
            .background(NoirBackdrop(mood: .idle, accent: run.state.color, focus: UnitPoint(x: 0.5, y: 0), reach: 300))
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() }.fontWeight(.semibold) } }
        }
        .presentationDetents([.medium, .large])
        .presentationBackground(.black)
    }
    private func fact(_ k: String, _ v: String) -> some View {
        HStack { Text(k).foregroundStyle(Noir.soft); Spacer(); Text(v).fontWeight(.medium) }.font(.system(size: 15)).padding(.horizontal, 16).padding(.vertical, 12)
    }
}

// MARK: Settings

/// Settings: you and your Shua up top, then each part on its own glass — your Mac, voice, font (shown in its own
/// face), the camera — and the older iCloud sync under Advanced.
struct ShuaSettingsView: View {
    @Environment(SparkLink.self) private var link
    @State private var pairing = false
    @State private var confirmUnpair = false
    @State private var voiceOn = ShuaVoice.shared.enabled
    private var eyes: ShuaEyes { .shared }
    private var accent: Color { link.look?.accentColor ?? .shuaPurple }

    var body: some View {
        @Bindable var eyes = eyes
        ZStack {
            NoirBackdrop(mood: link.mood, accent: accent, focus: UnitPoint(x: 0.5, y: 0.02), reach: 380)
            ScrollView {
                VStack(spacing: 22) {
                    PageTitle(title: "Settings")
                    profile.padding(.horizontal, 20)
                    group("Your Mac") {
                        if let p = link.pairing {
                            row("desktopcomputer", .blue, "Paired with") { Text(p.name).foregroundStyle(Noir.soft) }
                            line
                            row("lock.shield.fill", .green, "Connection") { Text("Tailscale, encrypted").foregroundStyle(Noir.soft) }
                            line
                            Button { confirmUnpair = true } label: { row("xmark.circle.fill", .red, "Unpair this iPhone") { EmptyView() } }.buttonStyle(.plain)
                        } else {
                            Button { pairing = true } label: { row("qrcode.viewfinder", accent, "Pair with your Mac") { Image(systemName: "chevron.right").foregroundStyle(Noir.faint) } }.buttonStyle(.plain)
                        }
                    }
                    group("Voice", footer: "Shua speaks with the same voice as on your Mac.") {
                        row("waveform", accent, "Shua speaks its replies") { Toggle("", isOn: $voiceOn).labelsHidden().onChange(of: voiceOn) { _, on in ShuaVoice.shared.enabled = on } }
                    }
                    group("Font", footer: "How every word in the app is set. SF Pro is the iPhone's own.") {
                        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                            ForEach(ShuaFont.allCases) { f in fontTile(f) }
                        }
                        .padding(12)
                    }
                    group("Camera", footer: "Everything Shua sees is read on this iPhone and never leaves it. Recordings go to your Photos only.") {
                        row("camera.fill", .orange, "Opens on") {
                            Picker("", selection: $eyes.scene) { ForEach(EyesScene.allCases) { Text($0.title).tag($0) } }.labelsHidden().tint(Noir.soft)
                        }
                        line
                        row("4k.tv.fill", .purple, "Record in 4K") { Toggle("", isOn: $eyes.setup.fourK).labelsHidden() }
                        line
                        row("timelapse", .teal, "Timelapse pace") {
                            Picker("", selection: $eyes.every) { Text("1 s").tag(1.0); Text("2 s").tag(2.0); Text("5 s").tag(5.0) }.labelsHidden().tint(Noir.soft)
                        }
                    }
                    group("Advanced") {
                        NavigationLink { SettingsView() } label: { row("icloud.fill", .cyan, "iCloud sync") { Image(systemName: "chevron.right").foregroundStyle(Noir.faint) } }.buttonStyle(.plain)
                    }
                    Text("ShuaCrew for iPhone").font(.system(size: 12, weight: .medium)).foregroundStyle(Noir.faint).padding(.top, 4)
                }
                .padding(.bottom, 40)
                .frame(maxWidth: 620).frame(maxWidth: .infinity)
            }
            .scrollIndicators(.hidden)
            EdgeFade(edge: .top, height: 100)
        }
        .toolbar(.hidden, for: .navigationBar)
        .sheet(isPresented: $pairing) { PairView() }
        .confirmationDialog("Unpair this iPhone?", isPresented: $confirmUnpair) { Button("Unpair", role: .destructive) { link.unpair() } } message: { Text("You can pair again any time from the Mac.") }
    }

    private var profile: some View {
        HStack(spacing: 16) {
            ShuaCharacter(mood: link.mood).frame(width: 84, height: 84)
            VStack(alignment: .leading, spacing: 5) {
                Text(link.look?.name ?? "Shua").font(Noir.display(26))
                HStack(spacing: 6) {
                    Circle().fill(link.state == .live ? .green : .orange).frame(width: 7, height: 7)
                    Text(status).font(.system(size: 14, weight: .medium)).foregroundStyle(Noir.soft)
                }
                Text("Designed on your Mac. Change it there and it updates here.").font(.system(size: 12)).foregroundStyle(Noir.faint).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(18)
        .litGlass(30, tint: accent)
    }

    private func fontTile(_ f: ShuaFont) -> some View {
        let on = ShuaType.shared.font == f
        return Button { withAnimation(.smooth) { ShuaType.shared.font = f } } label: {
            VStack(alignment: .leading, spacing: 6) {
                Text("Aa").font(.system(size: 30, weight: .semibold)).fontDesign(f.design)
                Text(f.name).font(.system(size: 13, weight: .semibold)).fontDesign(f.design).foregroundStyle(on ? .white : Noir.soft)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(on ? accent.opacity(0.22) : .white.opacity(0.05), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(on ? accent : .white.opacity(0.08), lineWidth: on ? 2 : 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(f.name)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func group<Content: View>(_ title: String, footer: String? = nil, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).noirLabel().padding(.horizontal, 10)
            VStack(spacing: 0) { content() }.litGlass(24)
            if let footer { Text(footer).font(.system(size: 12)).foregroundStyle(Noir.faint).padding(.horizontal, 10) }
        }
        .padding(.horizontal, 20)
        .scrollSettle()
    }

    private func row<Trailing: View>(_ symbol: String, _ tint: Color, _ title: String, @ViewBuilder trailing: () -> Trailing) -> some View {
        HStack(spacing: 12) {
            Image(systemName: symbol).font(.system(size: 14, weight: .semibold)).foregroundStyle(.white)
                .frame(width: 30, height: 30).background(tint.gradient, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            Text(title).font(.system(size: 16, weight: .medium)).foregroundStyle(title.hasPrefix("Unpair") ? .red : .white)
            Spacer(minLength: 8)
            trailing()
        }
        .padding(.horizontal, 14).padding(.vertical, 11)
        .contentShape(Rectangle())
    }

    private var line: some View { Divider().overlay(.white.opacity(0.08)).padding(.leading, 56) }

    private var status: String {
        switch link.state {
        case .live: "Live with your Mac"
        case .connecting: "Reaching your Mac…"
        case .offline(let why): why
        case .unpaired: "Not paired yet"
        }
    }
}

/// Before pairing: your Shua, one line on what this tab will show, and the way to pair.
struct PairFirst: View {
    @Environment(SparkLink.self) private var link
    let title: String
    let line: String
    @State private var pairing = false
    var body: some View {
        ZStack {
            NoirBackdrop(mood: .sleepy, accent: link.look?.accentColor ?? .shuaPurple, focus: UnitPoint(x: 0.5, y: 0.32))
            VStack(spacing: 20) {
                ZStack(alignment: .bottom) { ShuaFloor(accent: link.look?.accentColor ?? .shuaPurple).offset(y: 14); ShuaCharacter(mood: .sleepy).frame(height: 190) }
                Text(title).font(Noir.display(34))
                Text(line).font(Noir.lead).foregroundStyle(Noir.soft).multilineTextAlignment(.center).lineSpacing(3).padding(.horizontal, 36)
                Button { pairing = true } label: { Label("Pair with your Mac", systemImage: "qrcode.viewfinder").font(Noir.title).frame(maxWidth: .infinity).padding(.vertical, 4) }
                    .buttonStyle(.glassProminent).tint(link.look?.accentColor ?? .shuaPurple).controlSize(.large).padding(.horizontal, 32)
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .sheet(isPresented: $pairing) { PairView() }
    }
}
