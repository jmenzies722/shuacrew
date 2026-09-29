import Foundation
import Combine
import ShuaCrewMobile

/// Used only by the explicit, second-step Allow confirmation on Watch.
private struct WatchConfirmation: CompanionAuthenticator {
    func authenticate() async throws -> Bool { true }
}

@MainActor final class WatchModel: ObservableObject {
    @Published private(set) var snapshot: MobileSnapshot?
    @Published private(set) var commands: [String: MobileCommandStatus] = [:]
    @Published private(set) var stale = true
    @Published private(set) var busy = false
    @Published private(set) var status = "Watch sync is off"
    @Published private(set) var error: String?
    @Published private(set) var fingerprint: String?
    private var channel: WatchConnectivityChannel?
    private var session: CompanionSession?
    private var loop: Task<Void, Never>?
    private var generation = UUID()
    private let defaults = UserDefaults.standard
    private var directory: URL { URL.applicationSupportDirectory.appending(path: "WatchMobile", directoryHint: .isDirectory) }
    private static var now: Int64 { Int64(Date().timeIntervalSince1970 * 1000) }
    isolated deinit { loop?.cancel() }

    func pair() async {
        guard !busy, session == nil || snapshot == nil else { return }
        busy = true; defer { busy = false }
        // Renew an expired, still-unconfirmed proposal without replacing this Watch's key.
        if session != nil { await disconnect() }
        let current = generation
        let transport = channel ?? WatchConnectivityChannel(); channel = transport
        do {
            let response = try WatchRelayCodec.response(await transport.request(WatchRelayCodec.identityRequest()))
            guard let mac = response.identity, generation == current else { throw CompanionError.closed }
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            let identity = try MobileKeyStore(storage: DeviceMobileIdentityStorage(markerURL: directory.appending(path: "identity")))
                .loadOrCreate(forceNew: defaults.bool(forKey: "watch.rotateIdentity"))
            let device = WatchRelayCodec.deviceId(publicKey: identity.signingKey.publicKey.x963Representation)
            let proposal = try MobilePairing.create(mac: mac, deviceId: device, name: "My Watch", kind: "watch", key: identity.signingKey, now: Self.now)
            fingerprint = MobilePairing.fingerprint(proposal)
            let accepted = try WatchRelayCodec.response(await transport.request(WatchRelayCodec.pairing(proposal)))
            guard accepted.accepted, generation == current else { throw CompanionError.closed }
            defaults.set(try JSONEncoder().encode(mac), forKey: "watch.mac")
            defaults.set(false, forKey: "watch.rotateIdentity")
            defaults.set(true, forKey: "watch.enabled")
            try await start(mac: mac, identity: identity, transport: transport, generation: current)
        } catch {
            guard generation == current else { return }
            self.error = "Open ShuaCrew on your paired iPhone with private sync enabled, then try again."
        }
    }
    func resume() async {
        guard !busy, session == nil, defaults.bool(forKey: "watch.enabled") else { return }
        busy = true; defer { busy = false }
        let current = generation
        do {
            guard let data = defaults.data(forKey: "watch.mac") else { return }
            let mac = try JSONDecoder().decode(MacPairingIdentity.self, from: data)
            let storage = DeviceMobileIdentityStorage(markerURL: directory.appending(path: "identity"))
            guard try storage.readGeneration() != nil else { throw CompanionError.closed }
            let identity = try MobileKeyStore(storage: storage).loadOrCreate()
            let transport = channel ?? WatchConnectivityChannel(); channel = transport
            try await start(mac: mac, identity: identity, transport: transport, generation: current)
        } catch {
            guard generation == current else { return }
            self.error = "Could not restore private pairing. Stop sync and pair again."
        }
    }
    private func start(mac: MacPairingIdentity, identity: MobileIdentity, transport: WatchConnectivityChannel, generation current: UUID) async throws {
        let device = WatchRelayCodec.deviceId(publicKey: identity.signingKey.publicKey.x963Representation)
        let mailbox = CloudMailbox(backend: WatchRelayMailbox(mac: mac, key: identity.signingKey, transport: transport))
        let state = try CompanionSession(account: mac.installationId, mac: mac, deviceId: device, signingKey: identity.signingKey,
            checkpointKey: identity.checkpointKey, checkpoint: MobileCheckpointFile.forPairing(directory: directory, mac: mac, deviceId: device), mailbox: mailbox, now: Self.now)
        await mailbox.setEnabled(true)
        guard generation == current else { await state.close(); throw CompanionError.closed }
        session = state; status = "Waiting for Mac confirmation"; error = nil
        poll()
    }
    /// Foreground wakes restart the bounded poll immediately; no background execution claim.
    func foreground(_ active: Bool) async {
        loop?.cancel(); loop = nil
        if active { if session == nil { await resume() } else { poll() } }
    }
    private func poll() {
        loop?.cancel()
        guard let state = session else { return }
        let current = generation
        loop = Task { [weak self] in
            var retry = MobileSyncRetry()
            while !Task.isCancelled {
                guard let self, self.generation == current else { return }
                var delay: TimeInterval = 15
                do {
                    try await state.reconcile(now: Self.now)
                    guard !Task.isCancelled, self.generation == current else { return }
                    await self.update(state)
                    self.error = nil; retry.reset()
                } catch is CancellationError { return }
                catch {
                    guard self.generation == current else { return }
                    await self.update(state)
                    self.error = "Waiting for iPhone. Delivery is not execution."
                    delay = retry.failure()
                }
                guard self.generation == current, delay <= 86400 else { return }
                do { try await Task.sleep(for: .seconds(delay)) } catch { return }
            }
        }
    }
    private func update(_ state: CompanionSession) async {
        let value = await state.view(now: Self.now)
        guard session === state else { return }
        if value.revoked {
            await disconnect(); defaults.set(true, forKey: "watch.rotateIdentity")
            defaults.removeObject(forKey: "watch.mac"); status = "Access revoked — pair again"
            return
        }
        snapshot = value.snapshot; stale = value.stale; commands = value.commands
        status = stale ? "Waiting for a fresh Mac snapshot" : "Verified Mac snapshot"
    }
    func submit(_ intent: CompanionIntent, confirmedAllow: Bool = false) async {
        guard let state = session, !busy else { return }
        if case .message = intent { return }
        if case let .decide(id, allow) = intent {
            guard snapshot?.offers.first(where: { $0.offerId == id })?.requiresPhone == false,
                  !allow || confirmedAllow else { return }
        }
        busy = true; defer { busy = false }
        do {
            _ = try await state.submit(intent, now: Self.now, authenticator: confirmedAllow ? WatchConfirmation() : nil)
            await update(state); error = nil; poll()
        } catch { self.error = "Not queued. Refresh and check whether this action is still available." }
    }
    func disconnect() async {
        generation = UUID(); loop?.cancel(); loop = nil
        channel?.stop(); channel = nil
        let previous = session; session = nil
        snapshot = nil; commands = [:]; stale = true; fingerprint = nil
        defaults.set(false, forKey: "watch.enabled")
        status = "Watch sync is off"; error = nil
        await previous?.close()
    }
}
