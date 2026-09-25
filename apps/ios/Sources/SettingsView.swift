import SwiftUI
import UserNotifications

struct SettingsView: View {
    @EnvironmentObject var model: MobileModel
    @State private var macDetails = ""
    @State private var name = "My iPhone"
    @State private var confirmConnect = false
    var body: some View {
        Form {
            Section("Private connection") {
                Label(model.cloudContainer == nil ? "Setup required" : model.status, systemImage: "lock.shield")
                Text(model.status).font(.subheadline).foregroundStyle(.secondary)
                if model.rejectedRecords > 0 { Text("Skipped \(model.rejectedRecords) incompatible cloud records this session. Valid records continue syncing.").font(.caption).foregroundStyle(.orange) }
                if model.cloudContainer == nil { Text("This build has no CloudKit configuration. Pairing can be prepared locally, but cloud sync requires an authorized, provisioned Apple build.").font(.caption).foregroundStyle(.secondary) }
            }
            Section("1 · Copy identity from your Mac") {
                Text("Mac → Settings → Mobile → Copy Mac identity. Paste the public details here; never paste provider keys.").font(.caption).foregroundStyle(.secondary)
                TextField("Mac public identity", text: $macDetails, axis: .vertical).textInputAutocapitalization(.never).autocorrectionDisabled()
                TextField("Device name", text: $name)
                Button("Create local pairing request") { model.preparePairing(macDetails, name: name) }.disabled(macDetails.isEmpty || name.isEmpty || model.busy)
            }
            if let proposal = model.proposal, let fingerprint = model.fingerprint {
                Section("2 · Confirm on your Mac") {
                    Text(fingerprint).font(.callout.monospaced()).textSelection(.enabled)
                    ShareLink("Share pairing request", item: proposal)
                    Text("Paste the request into Mac Mobile Settings. Compare the entire fingerprint on both devices before confirming there. Requests expire after five minutes.").font(.caption).foregroundStyle(.secondary)
                    Button("Mac confirmed — start private sync") { confirmConnect = true }.disabled(model.cloudContainer == nil || model.busy)
                }
            }
            Section("Privacy & scope") {
                Text("Only rooms selected on your Mac sync through your private iCloud database. Shared text may still contain sensitive information. No provider credentials, audio or raw tool inputs are sent.")
                Text("Your Mac must be awake with ShuaCrew running. iCloud delivery is not execution; only signed Mac acknowledgments settle requests.")
                Button("Stop sync on this phone", role: .destructive) { Task { await model.disconnect() } }
                Text("Stopping sync does not revoke this device on your Mac or instantly remove cloud records. Use Mac Mobile Settings to revoke access.").font(.caption).foregroundStyle(.secondary)
            }
            Section("Apple Watch") {
                Text("With private sync enabled, open ShuaCrew on your Watch and choose Pair. Your Watch has its own identity and needs separate approval on your Mac.").font(.caption).foregroundStyle(.secondary)
                if let proposal = model.watchProposal, let fingerprint = model.watchFingerprint {
                    Text(fingerprint).font(.caption.monospaced()).textSelection(.enabled)
                    ShareLink("Share Watch pairing request", item: proposal)
                    Text("Compare the entire fingerprint on Watch and Mac before confirming. The phone only relays the original signed request; it cannot approve pairing.").font(.caption).foregroundStyle(.secondary)
                }
            }
            DecisionNotificationSettings(notifications: model.notifications)
            if let error = model.error { Section { Text(error).foregroundStyle(.orange) } }
        }
        .navigationTitle("Settings")
        .confirmationDialog("Enable private iCloud sync?", isPresented: $confirmConnect, titleVisibility: .visible) {
            Button("Enable private sync") { Task { await model.connect() } }
        } message: { Text("This sends signed requests and downloads the room data selected on your Mac. A matching fingerprint must already be confirmed there.") }
    }
}

private struct DecisionNotificationSettings: View {
    @EnvironmentObject var model: MobileModel
    @ObservedObject var notifications: PhoneNotifications
    var body: some View {
        Section("Decision notifications") {
            Text(notifications.status).font(.caption).foregroundStyle(.secondary)
            Button(notifications.enabled ? "Check permission and retry setup" : "Enable decision alerts") {
                Task { await model.enableNotifications() }
            }.disabled(model.cloudContainer == nil || model.busy)
            if notifications.enabled { Button("Turn off alerts", role: .destructive) { notifications.disable() } }
            Text("Alerts never include tool inputs or conversation text. Tap to review in the app; there is no lock-screen Allow. Your Mac must be awake. iOS may delay background refresh, so open the app for the latest decisions.").font(.caption).foregroundStyle(.secondary)
        }
    }
}
