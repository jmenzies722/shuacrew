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
            ShuaStage(mood: .idle, accent: link.look?.accentColor ?? .shuaPurple).opacity(0.6)
            ScrollView {
                VStack(spacing: 18) {
                    HStack(spacing: 14) {
                        ShuaCharacter(mood: link.mood).frame(width: 72, height: 72)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(Plainly.hello()).font(.system(.title2, design: .rounded).weight(.bold))
                            Text(link.statusSentence).font(.system(.body, design: .rounded)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 20)
                    HStack(spacing: 10) {
                        Stat(value: link.approvals.count, label: "need you", tint: .orange)
                        Stat(value: link.activeRuns.filter { $0.status != "awaiting_approval" }.count, label: "working", tint: .green)
                        Stat(value: link.runs.filter(\.finished).count, label: "done", tint: link.look?.accentColor ?? .shuaPurple)
                    }
                    .padding(.horizontal, 20)
                    ForEach(link.approvals) { NeedsYouCard(approval: $0) }
                    if !link.activeRuns.filter({ $0.status != "awaiting_approval" }).isEmpty { WorkingCard() }
                    let finished = link.runs.filter(\.finished).sorted { $0.updatedAt > $1.updatedAt }
                    if !finished.isEmpty {
                        ShuaCard(title: "Finished", symbol: "checkmark.circle.fill", tint: link.look?.accentColor ?? .shuaPurple) {
                            ForEach(finished.prefix(6)) { run in
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(run.title).font(.body.weight(.semibold))
                                    if !run.ticker.isEmpty { Text(run.ticker).font(.subheadline).foregroundStyle(.secondary) }
                                }
                            }
                        }
                    }
                    if let next = link.brief?.next, !next.isEmpty {
                        ShuaCard(title: "Coming up on its own", symbol: "calendar.badge.clock", tint: .cyan) {
                            ForEach(next) { item in
                                HStack {
                                    Text(item.name).font(.body.weight(.medium))
                                    Spacer()
                                    Text(item.at, format: .dateTime.hour().minute()).font(.body.monospacedDigit()).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                    Button { Task { await link.ask("What's going on? Give me the short version.") } } label: {
                        Label("Have Shua talk me through it", systemImage: "sparkles").font(.headline).frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent).controlSize(.large).tint(link.look?.accentColor ?? .shuaPurple)
                    .padding(.horizontal, 20).disabled(link.asking)
                }
                .padding(.vertical, 12).padding(.bottom, 40)
                .frame(maxWidth: 600).frame(maxWidth: .infinity)
            }
            .scrollIndicators(.hidden)
            .refreshable { await link.reload() }
        }
        .navigationTitle("Today")
        .toolbarBackground(.hidden, for: .navigationBar)
    }
}

private struct Stat: View {
    let value: Int, label: String, tint: Color
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(value)").font(.system(.title, design: .rounded).weight(.bold).monospacedDigit()).foregroundStyle(value > 0 ? tint : .secondary).contentTransition(.numericText())
            Text(label).font(.system(.caption, design: .rounded).weight(.medium)).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(.white.opacity(0.08)))
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
            ShuaStage(mood: .idle, accent: link.look?.accentColor ?? .shuaPurple).opacity(0.5)
            ScrollView {
                VStack(spacing: 18) {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(alignment: .bottom, spacing: 10) {
                            TextField("What should the crew do?", text: $task, axis: .vertical).lineLimit(1...5).focused($typing)
                                .font(.system(.body, design: .rounded))
                            Button {
                                let t = task
                                Task { if await link.start(ask: t) { task = ""; typing = false } }
                            } label: { Image(systemName: "arrow.up").font(.headline).foregroundStyle(.white).frame(width: 36, height: 36).background((link.look?.accentColor ?? .shuaPurple).gradient, in: Circle()) }
                                .disabled(task.trimmingCharacters(in: .whitespaces).isEmpty)
                        }
                        .padding(14)
                        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                        Text("Starts a crew session on your Mac. Anything that needs your OK comes back here.").font(.footnote).foregroundStyle(.secondary).padding(.horizontal, 6)
                    }
                    .padding(.horizontal, 20)
                    ForEach(link.approvals) { NeedsYouCard(approval: $0) }
                    let working = link.activeRuns.filter { $0.status != "awaiting_approval" }
                    if working.isEmpty {
                        ShuaCard(title: "Working now", symbol: "bolt.fill", tint: .green) { Text("Nobody's working right now. Hand the crew something above.").font(.body).foregroundStyle(.secondary) }
                    } else { WorkingCard() }
                    let recent = link.runs.filter { !$0.active }.sorted { $0.updatedAt > $1.updatedAt }.prefix(10)
                    if !recent.isEmpty {
                        ShuaCard(title: "Recently", symbol: "clock.arrow.circlepath", tint: .secondary) {
                            ForEach(Array(recent)) { run in
                                HStack(alignment: .firstTextBaseline, spacing: 10) {
                                    Image(systemName: run.finished ? "checkmark.circle.fill" : run.status == "failed" ? "exclamationmark.triangle.fill" : "circle.dotted")
                                        .foregroundStyle(run.finished ? .green : run.status == "failed" ? .red : .secondary)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(run.title).font(.body.weight(.semibold))
                                        if !run.ticker.isEmpty { Text(run.ticker).font(.subheadline).foregroundStyle(.secondary).lineLimit(3) }
                                    }
                                }
                            }
                        }
                    }
                }
                .padding(.vertical, 12).padding(.bottom, 40)
                .frame(maxWidth: 600).frame(maxWidth: .infinity)
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
            .refreshable { await link.reload() }
        }
        .navigationTitle("Crew")
        .toolbarBackground(.hidden, for: .navigationBar)
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
                        Text(link.look?.name ?? "Shua").font(.system(.title3, design: .rounded).weight(.semibold))
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
                Toggle("Shua speaks its replies", isOn: $voiceOn).onChange(of: voiceOn) { _, on in ShuaVoice.shared.enabled = on }
            } header: { Text("Voice") } footer: { Text("Shua speaks with the same voice as on your Mac.") }
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

/// Before pairing: your Shua, one line on what this tab will show, and the way to pair.
private struct PairFirst: View {
    @Environment(SparkLink.self) private var link
    let title: String
    let line: String
    @State private var pairing = false
    var body: some View {
        ZStack {
            ShuaStage(mood: .sleepy, accent: link.look?.accentColor ?? .shuaPurple)
            VStack(spacing: 18) {
                ShuaCharacter(mood: .sleepy).frame(height: 180)
                Text(line).font(.system(.title3, design: .rounded).weight(.medium)).multilineTextAlignment(.center).padding(.horizontal, 32)
                Button { pairing = true } label: { Label("Pair with your Mac", systemImage: "qrcode.viewfinder").font(.headline).frame(maxWidth: .infinity) }
                    .buttonStyle(.borderedProminent).controlSize(.large).padding(.horizontal, 32)
            }
        }
        .navigationTitle(title)
        .sheet(isPresented: $pairing) { PairView() }
    }
}
