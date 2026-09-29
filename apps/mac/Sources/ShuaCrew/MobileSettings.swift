import AppKit
import SwiftUI
import ShuaCrewMobile

@MainActor
final class MobileSettingsWindow: NSWindowController {
    init(model: MobileBridge) {
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 720, height: 780), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "Mobile · ShuaCrew"
        window.minSize = NSSize(width: 620, height: 560)
        window.isReleasedWhenClosed = false
        window.contentView = NSHostingView(rootView: MobileSettingsView(model: model))
        window.center()
        super.init(window: window)
    }
    required init?(coder: NSCoder) { fatalError() }
}

private struct MobileSettingsView: View {
    @ObservedObject var model: MobileBridge
    @State private var enableConfirmation = false
    @State private var pairingText = ""
    @State private var pairingError: String?
    @State private var proposal: VerifiedMobilePairing?
    @State private var envelope: SignedEnvelope?
    @State private var showPairing = false
    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 18) {
                Image(systemName: "iphone.and.arrow.forward").font(.system(size: 34)).foregroundStyle(.tint).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 5) {
                    Text("Your crew, within reach.").font(.title2.bold())
                    Text("Private sync. Specific decisions. Your Mac stays in control.").foregroundStyle(.secondary)
                }
                Spacer()
                Label(model.status, systemImage: model.enabled ? "circle.fill" : "lock.shield").font(.caption.weight(.medium)).foregroundStyle(model.enabled ? Color.green : Color.secondary)
            }.padding(24)
            Divider()
            Form {
                Section("Connection") {
                    Text(model.readiness.explanation).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                    HStack {
                        if model.enabled { Button("Turn off mobile sync", role: .destructive) { Task { await model.disable() } } }
                        else { Button("Enable private sync…") { enableConfirmation = true }.disabled(!model.readiness.canEnable || model.busy) }
                        if model.busy { ProgressView().controlSize(.small) }
                        Spacer()
                        if let date = model.lastSuccess { Text("Last contact: \(date.formatted(date: .omitted, time: .standard))").font(.caption).foregroundStyle(.secondary) }
                    }
                    Text("Sync runs while this Mac app is open and the Mac is awake. Cloud delivery is not execution; a signed Mac acknowledgment is required.").font(.caption).foregroundStyle(.secondary)
                    if let error = model.error { Label(error, systemImage: "exclamationmark.triangle").foregroundStyle(.orange).fixedSize(horizontal: false, vertical: true) }
                }
                Section("What leaves this Mac") {
                    Text("Only selected room messages, task summaries, run states, usage summaries and safely representable approval descriptions sync to your private iCloud database.")
                    Text("No raw event logs, provider credentials, environment variables, microphone audio, internal reasoning or arbitrary tool payloads. Room text can still contain sensitive information; choose deliberately.").font(.caption).foregroundStyle(.secondary)
                }
                Section("Room scope") {
                    if model.rooms.isEmpty { Text("No crew rooms available. Create a room on your Mac, then refresh.").foregroundStyle(.secondary) }
                    ForEach(model.rooms) { room in
                        Toggle(room.title, isOn: Binding(get: { model.selectedRooms.contains(room.id) }, set: { selected in
                            if selected { model.selectedRooms.insert(room.id) } else { model.selectedRooms.remove(room.id) }
                        })).disabled(model.busy)
                    }
                    HStack {
                        Button("Refresh rooms") { Task { await model.refreshRooms() } }
                        Spacer()
                        Text("\(model.appliedRooms.count) rooms applied").font(.caption).foregroundStyle(.secondary)
                        Button("Apply room scope") { Task { await model.saveScope() } }.disabled(!model.enabled || model.busy || model.selectedRooms == model.appliedRooms)
                    }
                }
                Section("Pair a device") {
                    if let identity = model.identity, model.enabled {
                        Text("1. Copy this Mac identity into the companion’s pairing screen. 2. Paste its request below. 3. Compare the entire fingerprint on both devices.").font(.caption).foregroundStyle(.secondary)
                        Button("Copy Mac pairing identity") {
                            if let data = try? JSONEncoder().encode(identity), let value = String(data: data, encoding: .utf8) {
                                NSPasteboard.general.clearContents(); NSPasteboard.general.setString(value, forType: .string)
                            }
                        }
                        TextEditor(text: $pairingText).font(.system(.caption, design: .monospaced)).frame(height: 75).accessibilityLabel("Device pairing request")
                        Button("Review pairing fingerprint…") {
                            do {
                                let value = try MobileCodec.decode(Data(pairingText.utf8))
                                proposal = try MobilePairing.inspect(value, mac: identity, now: Int64(Date().timeIntervalSince1970 * 1000))
                                envelope = value; pairingError = nil; showPairing = true
                            } catch { pairingError = "This request is invalid, expired or for a different Mac. Generate a fresh request on the device." }
                        }.disabled(model.busy || pairingText.isEmpty)
                        if let pairingError { Text(pairingError).foregroundStyle(.orange) }
                    } else { Text("Enable sync in a properly signed build before pairing. Sharing an iCloud account alone never authorizes a device.").foregroundStyle(.secondary) }
                }
                Section("Paired devices") {
                    if model.devices.isEmpty { Text("No paired devices.").foregroundStyle(.secondary) }
                    ForEach(model.devices, id: \.id) { device in
                        HStack {
                            Label(device.name, systemImage: device.kind == "watch" ? "applewatch" : "iphone")
                            Spacer()
                            Button("Revoke", role: .destructive) { Task { await model.revoke(device) } }.disabled(!model.enabled || model.busy)
                        }
                    }
                    Text("Revocation applies at the Mac even if the device is offline. Remote records expire and are cleaned up after reconnect; turning sync off does not instantly erase iCloud records.").font(.caption).foregroundStyle(.secondary)
                }
            }.formStyle(.grouped)
        }
        .alert("Enable private mobile sync?", isPresented: $enableConfirmation) {
            Button("Cancel", role: .cancel) {}
            Button("Enable") { Task { await model.enable() } }
        } message: { Text("This checks your iCloud account, creates a private ShuaCrewMobile zone if needed, and shares only the selected room scope. Device pairing remains a separate confirmation.") }
        .sheet(isPresented: $showPairing) {
            VStack(alignment: .leading, spacing: 20) {
                Text("Confirm this device").font(.title2.bold())
                if let proposal {
                    Text(proposal.device.name + " · " + proposal.device.kind)
                    Text(proposal.fingerprint).font(.system(.body, design: .monospaced)).textSelection(.enabled)
                    Text("Only continue if the entire fingerprint matches the one shown on your device. Requests expire after five minutes.").foregroundStyle(.secondary)
                }
                HStack { Button("Cancel", role: .cancel) { showPairing = false }; Spacer()
                    Button("Fingerprints match — Pair") { if let envelope { Task { await model.confirmPairing(envelope) } }; showPairing = false }
                }
            }.padding(28).frame(width: 520)
        }
    }
}
