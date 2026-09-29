import SwiftUI
import ShuaCrewMobile

struct ApprovalView: View {
    @EnvironmentObject var model: MobileModel
    let offer: ApprovalOffer
    @State private var confirmingDeny = false
    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let expired = Int64(context.date.timeIntervalSince1970 * 1000) >= offer.expiresAt
            let stale = model.lastContact.map { context.date.timeIntervalSince($0) >= 60 } ?? true
            List {
                Section { FreshnessView() }
                Section(offer.tool) { Text(offer.summary).textSelection(.enabled) }
                Section("This request only") {
                    LabeledContent("Run", value: offer.runId)
                    Text(expired ? "This offer has expired." : "Expires \(Date(timeIntervalSince1970: Double(offer.expiresAt) / 1000).formatted(date: .omitted, time: .standard))")
                    Text("Allow records a decision for this exact request. It does not grant future permissions or prove that the tool finished.").font(.caption).foregroundStyle(.secondary)
                }
                Button("Authenticate and allow", systemImage: "faceid") { Task { await model.submit(.decide(offerId: offer.offerId, allow: true)) } }
                    .disabled(expired || stale || model.busy)
                Button("Deny…", role: .destructive) { confirmingDeny = true }.disabled(expired || stale || model.busy)
                if let error = model.error { Text(error).foregroundStyle(.orange) }
            }
        }
        .navigationTitle("Review decision")
        .confirmationDialog("Deny this specific request?", isPresented: $confirmingDeny) {
            Button("Deny request", role: .destructive) { Task { await model.submit(.decide(offerId: offer.offerId, allow: false)) } }
        }
    }
}
