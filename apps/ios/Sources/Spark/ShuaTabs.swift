import SwiftUI

/// Today: your day at a glance, in Shua's light. What needs you, what's moving, what finished, what's coming up on its
/// own, then one tap to have Shua talk you through it. Built from the crew's own record, live.
struct ShuaTodayView: View {
    @Environment(SparkLink.self) private var link
    var body: some View {
        if link.pairing == nil { PairFirst(title: "Today", line: "Pair with your Mac and your day shows up here: what needs you, what's working, what finished.") } else { day }
    }

    private var day: some View {
        ZStack {
            NoirBackdrop(mood: .idle, accent: link.look?.accentColor ?? .shuaPurple, focus: UnitPoint(x: 0.85, y: 0.02), reach: 420)
            ScrollView {
                VStack(spacing: 18) {
                    HStack(alignment: .top, spacing: 14) {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Today").font(Noir.display(40)).tracking(-0.6)
                            Text(link.statusSentence).font(Noir.lead).foregroundStyle(Noir.soft).lineSpacing(3).fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 0)
                        ShuaCharacter(mood: link.mood, lively: 0.7).frame(width: 78, height: 78)
                    }
                    .padding(.horizontal, 24).padding(.top, 8)
                    HStack(spacing: 10) {
                        Stat(value: link.approvals.count, label: "need you", tint: .orange)
                        Stat(value: link.activeRuns.filter { $0.status != "awaiting_approval" }.count, label: "working", tint: .green)
                        Stat(value: link.runs.filter(\.finished).count, label: "done", tint: link.look?.accentColor ?? .shuaPurple)
                    }
                    .padding(.horizontal, 20)
                    ForEach(link.approvals) { NeedsYouCard(approval: $0).padding(.horizontal, 20) }
                    if !link.activeRuns.filter({ $0.status != "awaiting_approval" }).isEmpty { WorkingCard().padding(.horizontal, 20) }
                    let finished = link.runs.filter(\.finished).sorted { $0.updatedAt > $1.updatedAt }
                    if !finished.isEmpty {
                        DoneCard().padding(.horizontal, 20)
                    }
                    if let next = link.brief?.next, !next.isEmpty {
                        ShuaCard(title: "Coming up on its own", symbol: "calendar", tint: .cyan) {
                            ForEach(next) { item in
                                HStack {
                                    Text(item.name).font(Noir.title)
                                    Spacer()
                                    Text(item.at, format: .dateTime.hour().minute()).font(Noir.body.monospacedDigit()).foregroundStyle(Noir.soft)
                                }
                            }
                        }
                        .padding(.horizontal, 20)
                    }
                    Button { Task { await link.ask("What's going on? Give me the short version.") } } label: {
                        Label("Have Shua talk me through it", systemImage: "sparkles").font(Noir.title).frame(maxWidth: .infinity).padding(.vertical, 4)
                    }
                    .buttonStyle(.glassProminent).controlSize(.large).tint(link.look?.accentColor ?? .shuaPurple)
                    .padding(.horizontal, 20).disabled(link.asking)
                }
                .padding(.vertical, 12).padding(.bottom, 40)
                .frame(maxWidth: 600).frame(maxWidth: .infinity)
            }
            .scrollIndicators(.hidden)
            .refreshable { await link.reload() }
        }
        .toolbar(.hidden, for: .navigationBar)
    }
}

private struct Stat: View {
    let value: Int, label: String, tint: Color
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(value)").font(Noir.display(30).monospacedDigit()).foregroundStyle(value > 0 ? tint : Noir.faint).contentTransition(.numericText())
            Text(label).noirLabel()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}

/// Crew: hand them something, see what needs you and what's moving, live.
struct ShuaCrewView: View {
    @Environment(SparkLink.self) private var link
    @State private var task = ""
    @FocusState private var typing: Bool
    var body: some View {
        if link.pairing == nil { PairFirst(title: "Crew", line: "Pair with your Mac to watch your crew work live, hand them tasks and approve what they ask.") } else { crew }
    }

    private var crew: some View {
        ZStack {
            NoirBackdrop(mood: .idle, accent: link.look?.accentColor ?? .shuaPurple, focus: UnitPoint(x: 0.15, y: 0.02), reach: 420)
            ScrollView {
                VStack(spacing: 18) {
                    Text("Crew").font(Noir.display(40)).tracking(-0.6).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 24).padding(.top, 8)
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(alignment: .bottom, spacing: 10) {
                            TextField("What should the crew do?", text: $task, axis: .vertical).lineLimit(1...5).focused($typing)
                                .font(Noir.voice(19))
                            Button {
                                let t = task
                                Task { if await link.start(ask: t) { task = ""; typing = false } }
                            } label: { Image(systemName: "arrow.up").font(.headline).foregroundStyle(.white).frame(width: 36, height: 36).background((link.look?.accentColor ?? .shuaPurple).gradient, in: Circle()) }
                                .disabled(task.trimmingCharacters(in: .whitespaces).isEmpty)
                        }
                        .padding(16)
                        .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
                        Text("Starts a crew session on your Mac. Anything that needs your OK comes back here.").font(.system(size: 13)).foregroundStyle(Noir.faint).padding(.horizontal, 8)
                    }
                    .padding(.horizontal, 20)
                    ForEach(link.approvals) { NeedsYouCard(approval: $0).padding(.horizontal, 20) }
                    WorkingCard().padding(.horizontal, 20)
                    let recent = link.runs.filter { !$0.active }.sorted { $0.updatedAt > $1.updatedAt }.prefix(10)
                    if !recent.isEmpty {
                        ShuaCard(title: "Recently", symbol: "clock.arrow.circlepath", tint: Noir.faint) {
                            ForEach(Array(recent)) { run in
                                HStack(alignment: .firstTextBaseline, spacing: 10) {
                                    Image(systemName: run.finished ? "checkmark.circle.fill" : run.status == "failed" ? "exclamationmark.triangle.fill" : "circle.dotted")
                                        .foregroundStyle(run.finished ? .green : run.status == "failed" ? .red : .secondary)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(run.title).font(Noir.title)
                                        if !run.ticker.isEmpty { Text(run.ticker).font(.system(size: 15)).foregroundStyle(Noir.soft).lineLimit(3) }
                                    }
                                }
                            }
                        }
                        .padding(.horizontal, 20)
                    }
                }
                .padding(.vertical, 12).padding(.bottom, 120)
                .frame(maxWidth: 600).frame(maxWidth: .infinity)
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
            .refreshable { await link.reload() }
        }
        .toolbar(.hidden, for: .navigationBar)
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
                    ShuaCharacter(mood: link.mood).frame(width: 60, height: 60)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(link.look?.name ?? "Shua").font(Noir.display(24))
                        Text(status).font(.subheadline).foregroundStyle(.secondary)
                    }
                }
            } footer: { Text("This is your Shua as you designed it on the Mac. Change it there and it updates here.") }
            Section("Your Mac") {
                if let p = link.pairing {
                    LabeledContent("Paired with", value: p.name)
                    LabeledContent("Connection", value: "Tailscale, encrypted")
                    Button("Unpair this iPhone", role: .destructive) { confirmUnpair = true }
                } else {
                    Button { pairing = true } label: { Label("Pair with your Mac", systemImage: "qrcode.viewfinder") }
                }
            }
            Section {
                ForEach(ShuaFont.allCases) { f in
                    Button { withAnimation(.smooth) { ShuaType.shared.font = f } } label: {
                        HStack {
                            Text(f.name).font(.system(size: 17, weight: .medium)).fontDesign(f.design).foregroundStyle(.white) // each in its own face
                            Spacer()
                            if ShuaType.shared.font == f { Image(systemName: "checkmark").font(.system(size: 15, weight: .semibold)).foregroundStyle(.tint) }
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(ShuaType.shared.font == f ? .isSelected : [])
                }
            } header: { Text("Font") } footer: { Text("How every word in the app is set. SF Pro is the iPhone's own.") }
            Section {
                Toggle("Shua speaks its replies", isOn: $voiceOn).onChange(of: voiceOn) { _, on in ShuaVoice.shared.enabled = on }
            } header: { Text("Voice") } footer: { Text("Shua speaks with the same voice as on your Mac.") }
            Section { NavigationLink("iCloud sync (advanced)") { SettingsView() } }
        }
        .scrollContentBackground(.hidden)
        .contentMargins(.bottom, 96, for: .scrollContent) // the last rows scroll clear of mini Shua
        .background(NoirBackdrop(mood: .idle, accent: link.look?.accentColor ?? .shuaPurple, focus: UnitPoint(x: 0.5, y: 0), reach: 360))
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

/// Before pairing: your Shua, one line on what this tab will show, and the way to pair.
private struct PairFirst: View {
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
