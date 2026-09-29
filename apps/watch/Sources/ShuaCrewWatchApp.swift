import SwiftUI
import ShuaCrewMobile

@main struct ShuaCrewWatchApp: App {
    @StateObject private var model = WatchModel()
    @Environment(\.scenePhase) private var scenePhase
    var body: some Scene {
        WindowGroup {
            NavigationStack { WatchHome().environmentObject(model) }
                .tint(.teal)
                .task { await model.resume() }
                .onChange(of: scenePhase) { _, phase in Task { await model.foreground(phase == .active) } }
        }
    }
}

private struct WatchHome: View {
    @EnvironmentObject var model: WatchModel
    @State private var confirmStopSync = false
    var body: some View {
        List {
            Section {
                Label("Your crew, at a glance", systemImage: "sparkles").font(.headline).foregroundStyle(.teal)
                TimelineView(.periodic(from: .now, by: 5)) { context in
                    let age = model.snapshot.map { context.date.timeIntervalSince1970 - Double($0.observedAt) / 1000 }
                    let fresh = age.map { $0 >= -30 && $0 < 60 } ?? false
                    Label(fresh ? "Verified Mac snapshot" : model.snapshot == nil ? model.status : "Stale · Mac status unknown", systemImage: fresh ? "checkmark.shield" : "clock")
                        .font(.caption).foregroundStyle(fresh ? Color.secondary : Color.orange)
                }
            }
            if let snapshot = model.snapshot {
                Section("Decisions") {
                    if snapshot.offers.isEmpty { Text("No decisions in this snapshot").font(.caption).foregroundStyle(.secondary) }
                    ForEach(snapshot.offers, id: \.offerId) { offer in
                        NavigationLink { WatchDecision(offer: offer) } label: {
                            VStack(alignment: .leading) { Text(offer.tool).font(.headline); Text(offer.summary).font(.caption).lineLimit(2) }
                        }
                    }
                }
                Section("Crew") {
                    ForEach(snapshot.rooms, id: \.id) { room in
                        NavigationLink { WatchRoom(room: room) } label: {
                            VStack(alignment: .leading) { Text(room.title); Text(room.paused ? "Paused" : "Open").font(.caption).foregroundStyle(.secondary) }
                        }
                    }
                    ForEach(snapshot.runs, id: \.id) { run in
                        NavigationLink { WatchRun(run: run) } label: {
                            VStack(alignment: .leading) { Text(run.title); Text(run.status.replacingOccurrences(of: "_", with: " ")).font(.caption).foregroundStyle(.secondary) }
                        }
                    }
                    if snapshot.truncated { Text("More details on iPhone or Mac").font(.caption).foregroundStyle(.secondary) }
                }
                Button("Request fresh snapshot", systemImage: "arrow.clockwise") { Task { await model.submit(.refresh) } }.disabled(model.busy)
            } else {
                Section {
                    Text("Open ShuaCrew on iPhone with private sync enabled. Pair this Watch separately in Mac Mobile Settings.").font(.caption).foregroundStyle(.secondary)
                    Button("Pair with iPhone", systemImage: "iphone.and.arrow.forward") { Task { await model.pair() } }.disabled(model.busy)
                    if let fingerprint = model.fingerprint {
                        Text("Compare on Watch, iPhone and Mac").font(.caption.bold())
                        Text(fingerprint).font(.caption2.monospaced())
                        Text("A shared pairing request is not approval. Confirm the full fingerprint on your Mac.").font(.caption)
                    }
                }
            }
            if !model.commands.isEmpty {
                Section("Requests") {
                    ForEach(model.commands.keys.sorted(), id: \.self) { id in
                        VStack(alignment: .leading) {
                            Text(requestLabel(model.commands[id])).font(.caption)
                            Text(String(id.prefix(8))).font(.caption2.monospaced()).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            if let error = model.error { Text(error).font(.caption).foregroundStyle(.orange) }
            Section {
                Text("Your iPhone relays requests. Your Mac must be awake. Delivery never means execution.").font(.caption2).foregroundStyle(.secondary)
                Button("Stop Watch sync", role: .destructive) { confirmStopSync = true }
            }
        }
        .navigationTitle("ShuaCrew")
        .confirmationDialog("Stop Watch sync?", isPresented: $confirmStopSync) {
            Button("Stop sync", role: .destructive) { Task { await model.disconnect() } }
        } message: { Text("Already received actions are not undone. Revoke this Watch on your Mac to remove its authority.") }
    }
    private func requestLabel(_ value: MobileCommandStatus?) -> String {
        switch value {
        case .sending: "Queued on Watch"
        case .waitingForMac: "Waiting for Mac"
        case .applied: "Mac acknowledged"
        case .rejected: "Rejected by Mac"
        case .expired: "Expired · not retried"
        case .uncertain: "Uncertain · inspect on Mac"
        case nil: "Unknown"
        }
    }
}

private struct WatchDecision: View {
    @EnvironmentObject var model: WatchModel
    let offer: ApprovalOffer
    @State private var confirmAllow = false
    var body: some View {
        List {
            Text(offer.tool).font(.headline)
            Text(offer.summary).font(.caption)
            Text("Expires \(Date(timeIntervalSince1970: Double(offer.expiresAt) / 1000), style: .time)").font(.caption2).foregroundStyle(.secondary)
            if offer.requiresPhone { Label("Review on iPhone", systemImage: "iphone") }
            else {
                Button("Allow once…") { confirmAllow = true }.disabled(model.busy || model.stale)
                Button("Deny", role: .destructive) { Task { await model.submit(.decide(offerId: offer.offerId, allow: false)) } }.disabled(model.busy || model.stale)
            }
            Text("Wait for the signed Mac acknowledgment in Requests.").font(.caption2).foregroundStyle(.secondary)
        }
        .navigationTitle("Decision")
        .confirmationDialog("Allow this specific action?", isPresented: $confirmAllow) {
            Button("Allow once") { Task { await model.submit(.decide(offerId: offer.offerId, allow: true), confirmedAllow: true) } }
        } message: { Text(offer.summary) }
    }
}
private struct WatchRoom: View {
    @EnvironmentObject var model: WatchModel
    let room: MobileRoom
    @State private var confirm = false
    var body: some View {
        List {
            Text(room.title).font(.headline)
            Text("Conversation stays on iPhone and Mac.").font(.caption).foregroundStyle(.secondary)
            Button(room.paused ? "Resume room…" : "Pause room…") { confirm = true }.disabled(model.busy || model.stale)
        }.navigationTitle("Room")
        .confirmationDialog("Request a room change?", isPresented: $confirm) {
            Button(room.paused ? "Resume room" : "Pause room") { Task { await model.submit(.pause(roomId: room.id, paused: !room.paused)) } }
        }
    }
}
private struct WatchRun: View {
    @EnvironmentObject var model: WatchModel
    let run: MobileRun
    @State private var confirm = false
    var body: some View {
        List {
            Text(run.title).font(.headline)
            Text(run.status.replacingOccurrences(of: "_", with: " ")).font(.caption).foregroundStyle(.secondary)
            if !run.summary.isEmpty { Text(run.summary).font(.caption) }
            if !["done", "failed", "cancelled", "merged"].contains(run.status) {
                Button("Stop run…", role: .destructive) { confirm = true }.disabled(model.busy || model.stale)
            }
        }.navigationTitle("Run")
        .confirmationDialog("Request cancellation?", isPresented: $confirm) {
            Button("Stop run", role: .destructive) { Task { await model.submit(.stop(runId: run.id)) } }
        } message: { Text("Wait for Mac acknowledgment before assuming work stopped.") }
    }
}
