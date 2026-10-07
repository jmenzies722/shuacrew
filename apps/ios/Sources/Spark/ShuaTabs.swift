import SwiftUI

/// Today, once you're paired: the Mac's brief — what needs you, what's working and on what, what finished and how,
/// what runs next — read from the crew's own record, refreshed as things change.
struct ShuaTodayView: View {
    @Environment(SparkLink.self) private var link
    var body: some View {
        List {
            Section {
                HStack(spacing: 14) {
                    ShuaCharacter(mood: link.mood).frame(width: 64, height: 64)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(link.brief?.headline ?? "Reading your crew…").font(.title3.weight(.semibold))
                        Text(Date.now, format: .dateTime.weekday(.wide).month().day()).font(.subheadline).foregroundStyle(.secondary)
                    }
                }
                .listRowBackground(Color.clear)
                if let b = link.brief {
                    HStack(spacing: 10) {
                        Stat(value: b.waiting, label: "need you", tint: .orange)
                        Stat(value: b.working, label: "working", tint: .green)
                        Stat(value: b.finished, label: "finished", tint: link.look?.accentColor ?? .shuaPurple)
                    }
                    .listRowBackground(Color.clear).listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                }
            }
            ForEach(sections, id: \.title) { section in
                Section(section.title) {
                    ForEach(section.rows, id: \.self) { row in Text(row).font(.callout) }
                }
            }
            Section {
                Button { Task { await link.ask("What's going on? Give me the short version.") } } label: { Label("Ask Shua to walk me through it", systemImage: "sparkles") }
                    .disabled(link.asking)
            }
        }
        .navigationTitle("Today")
        .refreshable { await link.reload() }
    }

    /// The brief's plain lines as sections: "WAITING ON YOU (2):" heads the "- …" lines under it.
    private var sections: [(title: String, rows: [String])] {
        var out: [(title: String, rows: [String])] = [], info: [String] = []
        for line in link.brief?.lines ?? [] {
            if line.hasPrefix("- "), !out.isEmpty { out[out.count - 1].rows.append(String(line.dropFirst(2))) }
            else if let colon = line.firstIndex(of: ":"), line[..<colon].uppercased() == line[..<colon], line.hasSuffix(":") {
                out.append((title: line[..<colon].replacingOccurrences(of: #"\s*\(\d+\)"#, with: "", options: .regularExpression).capitalized, rows: []))
            } else if let colon = line.firstIndex(of: ":") {
                info.append(line[..<colon].capitalized + ":" + line[line.index(after: colon)...])
            }
        }
        if !info.isEmpty { out.append((title: "At a glance", rows: info)) }
        return out.filter { !$0.rows.isEmpty }
    }
}

private struct Stat: View {
    let value: Int, label: String, tint: Color
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(value)").font(.title.weight(.semibold).monospacedDigit()).foregroundStyle(value > 0 ? tint : .secondary).contentTransition(.numericText())
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

/// Crew, once you're paired: everything working now and what finished, live, and a box to hand the crew something.
struct ShuaCrewView: View {
    @Environment(SparkLink.self) private var link
    @State private var task = ""
    @FocusState private var typing: Bool
    var body: some View {
        List {
            Section {
                HStack {
                    TextField("Hand the crew a task…", text: $task, axis: .vertical).lineLimit(1...4).focused($typing)
                    Button {
                        let t = task
                        Task { if await link.start(ask: t) { task = ""; typing = false } }
                    } label: { Image(systemName: "arrow.up.circle.fill").font(.title2) }
                        .disabled(task.trimmingCharacters(in: .whitespaces).isEmpty)
                        .tint(link.look?.accentColor ?? .shuaPurple)
                }
            } footer: { Text("It starts a crew session on your Mac. Anything that needs your OK comes back here.") }
            if !link.approvals.isEmpty {
                Section("Needs you") {
                    ForEach(link.approvals) { a in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(a.tool).font(.headline)
                            Text(a.summary).font(.footnote.monospaced()).foregroundStyle(.secondary).lineLimit(3)
                            HStack {
                                Button("Deny", role: .destructive) { Task { await link.decide(a, allow: false) } }.buttonStyle(.bordered)
                                Spacer()
                                Button { Task { await link.decide(a, allow: true) } } label: { Label("Allow", systemImage: "faceid") }.buttonStyle(.borderedProminent).tint(.orange)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
            Section("Working now") {
                if link.activeRuns.isEmpty { Text("Nobody's working right now.").foregroundStyle(.secondary) }
                ForEach(link.activeRuns) { run in CrewRow(run: run) }
            }
            let recent = link.runs.filter { !$0.active }.sorted { $0.updatedAt > $1.updatedAt }.prefix(12)
            if !recent.isEmpty {
                Section("Recently") { ForEach(Array(recent)) { run in CrewRow(run: run) } }
            }
        }
        .navigationTitle("Crew")
    }
}

private struct CrewRow: View {
    @Environment(SparkLink.self) private var link
    let run: CrewRun
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Circle().fill(color).frame(width: 9, height: 9).padding(.top, 6)
                .phaseAnimator(run.active ? [0.35, 1] : [1]) { c, p in c.opacity(p) } animation: { _ in .easeInOut(duration: 0.9) }
            VStack(alignment: .leading, spacing: 3) {
                Text(run.title).font(.subheadline.weight(.semibold)).lineLimit(2)
                Text(run.ticker.isEmpty ? run.status.replacingOccurrences(of: "_", with: " ") : run.ticker).font(.footnote).foregroundStyle(.secondary).lineLimit(2)
            }
        }
        .swipeActions { if run.active { Button("Stop", role: .destructive) { Task { await link.cancel(run) } } } }
    }
    private var color: Color {
        switch run.status {
        case "running", "planning": .green
        case "awaiting_approval": .orange
        case "failed": .red
        case "done", "merged": .secondary
        default: .gray
        }
    }
}

/// Settings: Shua first (the Mac it's paired with, its voice, its look), then the older iCloud sync behind Advanced.
struct ShuaSettingsView: View {
    @Environment(SparkLink.self) private var link
    @State private var pairing = false
    @State private var confirmUnpair = false
    @State private var voiceOn = ShuaVoice.shared.enabled
    var body: some View {
        Form {
            Section {
                HStack(spacing: 14) {
                    ShuaCharacter(mood: link.mood).frame(width: 56, height: 56)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(link.look?.name ?? "Shua").font(.headline)
                        Text(status).font(.subheadline).foregroundStyle(.secondary)
                    }
                }
            } footer: { Text(link.look == nil ? "Your own Shua appears here once ShuaCrew on your Mac shares it." : "This is your Shua as you designed it on the Mac. Change it there and it updates here.") }
            Section("Mac") {
                if let p = link.pairing {
                    LabeledContent("Paired with", value: p.name)
                    LabeledContent("Over", value: "Tailscale · \(p.host)")
                    Button("Unpair this iPhone", role: .destructive) { confirmUnpair = true }
                } else {
                    Button { pairing = true } label: { Label("Pair with your Mac", systemImage: "qrcode.viewfinder") }
                }
            }
            Section {
                Toggle("Shua speaks its replies", isOn: $voiceOn).onChange(of: voiceOn) { _, on in ShuaVoice.shared.enabled = on }
            } header: { Text("Voice") } footer: { Text("Uses the best voice installed on this iPhone. Add a Premium voice in Settings → Accessibility → Spoken Content for the most natural sound.") }
            Section { NavigationLink("iCloud sync (advanced)") { SettingsView() } }
        }
        .navigationTitle("Settings")
        .sheet(isPresented: $pairing) { PairView() }
        .confirmationDialog("Unpair this iPhone?", isPresented: $confirmUnpair) { Button("Unpair", role: .destructive) { link.unpair() } } message: { Text("You can pair again any time from the Mac.") }
    }
    private var status: String {
        switch link.state {
        case .live: "Live with your Mac"
        case .connecting: "Reaching your Mac…"
        case .offline(let why): why
        case .unpaired: "Not paired yet"
        }
    }
}
