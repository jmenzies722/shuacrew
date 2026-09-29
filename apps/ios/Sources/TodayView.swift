import SwiftUI
import ShuaCrewMobile

struct TodayView: View {
    @EnvironmentObject var model: MobileModel
    @State private var stopRunId: String?
    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 12) {
                    Image(systemName: "sparkles.rectangle.stack").font(.largeTitle).foregroundStyle(.teal)
                    Text("Your crew, within reach.").font(.largeTitle.bold())
                    Text("Follow the work. Make the decisions. Keep your Mac in control.").foregroundStyle(.secondary)
                }.padding(.vertical, 16).listRowBackground(Color.clear)
            }
            if let snapshot = model.snapshot {
                Section { FreshnessView() }
                Section("Decisions") {
                    if snapshot.offers.isEmpty { Label("No pending decisions in this snapshot", systemImage: "checkmark.circle") }
                    ForEach(snapshot.offers, id: \.offerId) { offer in
                        NavigationLink { ApprovalView(offer: offer) } label: {
                            VStack(alignment: .leading, spacing: 6) { Text(offer.tool).font(.headline); Text(offer.summary).font(.subheadline).foregroundStyle(.secondary) }
                        }
                    }
                }
                Section("Work on your Mac") {
                    if snapshot.runs.isEmpty { Text("No runs in the selected room scope.").foregroundStyle(.secondary) }
                    ForEach(snapshot.runs, id: \.id) { run in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(run.title).font(.headline)
                            Text(run.status.replacingOccurrences(of: "_", with: " ").capitalized).font(.caption).foregroundStyle(.teal)
                            if !run.summary.isEmpty { Text(run.summary).font(.subheadline).foregroundStyle(.secondary) }
                            if !["done", "failed", "cancelled", "merged"].contains(run.status) {
                                Button("Stop run…", role: .destructive) { stopRunId = run.id }.disabled(model.busy)
                            }
                        }
                    }
                }
                Section("Reported usage · selected rooms") {
                    LabeledContent("Input tokens", value: snapshot.usage.inputTokens.formatted())
                    LabeledContent("Output tokens", value: snapshot.usage.outputTokens.formatted())
                    LabeledContent("Cache tokens", value: snapshot.usage.cacheTokens.formatted())
                    LabeledContent("Usage records", value: snapshot.usage.records.formatted())
                    LabeledContent("Cost", value: model.costLabel)
                    Text("Subscription charges and missing provider costs are not estimated.").font(.caption).foregroundStyle(.secondary)
                }
            } else {
                Section {
                    ContentUnavailableView("Pair with your Mac", systemImage: "desktopcomputer.and.iphone", description: Text("Open ShuaCrew → Settings → Mobile on your Mac. Only rooms you select there will appear here."))
                }
            }
            if !model.commands.isEmpty {
                Section("Requests · delivery is not execution") {
                    ForEach(model.commands.keys.sorted(), id: \.self) { id in
                        VStack(alignment: .leading) {
                            Text(commandLabel(model.commands[id])).font(.headline)
                            Text(id).font(.caption.monospaced()).foregroundStyle(.secondary).textSelection(.enabled)
                        }
                    }
                }
            }
            if let error = model.error { Section { Label(error, systemImage: "exclamationmark.triangle").foregroundStyle(.orange) } }
        }
        .navigationTitle("Today")
        .confirmationDialog("Request cancellation on your Mac?", isPresented: Binding(get: { stopRunId != nil }, set: { if !$0 { stopRunId = nil } })) {
            Button("Stop this run", role: .destructive) { if let id = stopRunId { Task { await model.submit(.stop(runId: id)) } }; stopRunId = nil }
        } message: { Text("This sends a cancellation request. Wait for the Mac acknowledgment before assuming the run stopped.") }
    }
    private func commandLabel(_ status: MobileCommandStatus?) -> String {
        switch status {
        case .sending: "Queued on this phone"
        case .waitingForMac: "Waiting for Mac acknowledgment"
        case .applied: "Request acknowledged by Mac"
        case .rejected: "Rejected by Mac"
        case .expired: "Expired — not retried"
        case .uncertain: "Uncertain — inspect on Mac"
        case nil: "Unknown"
        }
    }
}

struct FreshnessView: View {
    @EnvironmentObject var model: MobileModel
    var body: some View {
        TimelineView(.periodic(from: .now, by: 5)) { context in
            let stale = model.lastContact.map { context.date.timeIntervalSince($0) >= 60 || context.date.timeIntervalSince($0) < -30 } ?? true
            VStack(alignment: .leading, spacing: 6) {
                Label(stale ? "Stale snapshot — Mac status unknown" : "Verified Mac snapshot", systemImage: stale ? "clock.badge.exclamationmark" : "checkmark.shield")
                    .foregroundStyle(stale ? .orange : .teal)
                if let date = model.lastContact { Text("Observed \(date, style: .relative) ago").font(.caption).foregroundStyle(.secondary) }
            }
        }
    }
}
