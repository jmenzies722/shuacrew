import Foundation
import Combine
import CloudKit
import CryptoKit
import LocalAuthentication
import UIKit
import ShuaCrewMobile

struct PhoneAuthentication: CompanionAuthenticator {
    func authenticate() async throws -> Bool {
        let context = LAContext()
        context.localizedCancelTitle = "Keep pending"
        return try await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Allow this specific ShuaCrew action on your Mac")
    }
}

@MainActor final class MobileModel: ObservableObject {
    struct DecisionLink: Identifiable { let id: String }
    let notifications = PhoneNotifications()
    @Published var requestedDecision: DecisionLink?
    @Published private(set) var snapshot: MobileSnapshot?
    @Published private(set) var commands: [String: MobileCommandStatus] = [:]
    @Published private(set) var connected = false
    @Published private(set) var stale = true
    @Published private(set) var busy = false
    @Published private(set) var status = "Cloud sync is off"
    @Published private(set) var error: String?
    @Published private(set) var proposal: String?
    @Published private(set) var fingerprint: String?
    @Published private(set) var watchProposal: String?
    @Published private(set) var watchFingerprint: String?
    @Published private(set) var lastContact: Date?
    @Published private(set) var rejectedRecords = 0
    private var session: CompanionSession?
    private var watchRelay: PhoneWatchRelay?
    private var watchChannel: WatchConnectivityChannel?
    private let poller = ForegroundPoller()
    private(set) var foreground = false
    private var notificationRefresh: (@MainActor @Sendable () async throws -> Void)?
    private var notificationSetup: (@MainActor @Sendable () async throws -> Void)?
    private var configuringNotifications = false
    private var accountObserver: NSObjectProtocol?
    private var generation = UUID()
    private var pending: (mac: MacPairingIdentity, identity: MobileIdentity)?
    private let defaults = UserDefaults.standard
    private var directory: URL { URL.applicationSupportDirectory.appending(path: "Mobile", directoryHint: .isDirectory) }
    var cloudContainer: String? {
        // Only an explicitly provisioned build may instantiate CloudKit. Normal simulator builds
        // contain neither this flag nor CloudKit entitlements and remain genuinely offline.
        #if SHUACREW_CLOUDKIT
        let value = Bundle.main.object(forInfoDictionaryKey: "ShuaCrewCloudContainer") as? String
        return value?.hasPrefix("iCloud.") == true ? value : nil
        #else
        return nil
        #endif
    }
    var costLabel: String {
        guard let cost = snapshot?.usage.costUsd else { return "Not reported" }
        return cost.formatted(.currency(code: "USD"))
    }
    init() {
        accountObserver = NotificationCenter.default.addObserver(forName: .CKAccountChanged, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in await self?.forgetAccount() }
        }
    }
    isolated deinit { poller.stop(); if let accountObserver { NotificationCenter.default.removeObserver(accountObserver) } }
    static var now: Int64 { Int64(Date().timeIntervalSince1970 * 1000) }
    func preparePairing(_ text: String, name: String) {
        guard !busy else { return }
        guard session == nil else { error = "Stop sync before preparing a different pairing."; return }
        do {
            let bytes = Data(text.utf8)
            guard let body = try MobileCodec.strictJSON(bytes) as? [String: Any], Set(body.keys) == ["installationId", "publicKey"] else { throw MobileProtocolError.malformed }
            let mac = try JSONDecoder().decode(MacPairingIdentity.self, from: bytes)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            let keys = try MobileKeyStore(storage: DeviceMobileIdentityStorage(markerURL: directory.appending(path: "identity"))).loadOrCreate(forceNew: defaults.bool(forKey: "mobile.rotateIdentity"))
            let envelope = try MobilePairing.create(mac: mac, deviceId: keys.generation.uuidString.lowercased(), name: name, kind: "phone", key: keys.signingKey, now: Self.now)
            pending = (mac, keys)
            proposal = String(decoding: try JSONEncoder().encode(envelope), as: UTF8.self)
            fingerprint = MobilePairing.fingerprint(envelope)
            error = nil
        } catch { self.error = "Pairing details are invalid or this device could not store its private key. Copy fresh Mac details and try again." }
    }
    func connect() async {
        guard !busy, session == nil, let containerID = cloudContainer, let pending else { return }
        busy = true; defer { busy = false }
        let current = generation
        do {
            let container = CKContainer(identifier: containerID)
            guard try await container.accountStatus() == .available else { throw CKError(.notAuthenticated) }
            let account = try await container.userRecordID().recordName
            guard generation == current else { return }
            let hash = SHA256.hash(data: Data(account.utf8)).map { String(format: "%02x", $0) }.joined()
            if let previous = defaults.string(forKey: "mobile.account"), previous != hash { await forgetAccount(); return }
            let mailbox = CloudMailbox(backend: try CloudKitMailboxBackend(database: SystemMobileCloudDatabase(database: container.privateCloudDatabase)))
            let state = try CompanionSession(account: hash, mac: pending.mac, deviceId: pending.identity.generation.uuidString.lowercased(), signingKey: pending.identity.signingKey,
                checkpointKey: pending.identity.checkpointKey, checkpoint: MobileCheckpointFile.forPairing(directory: directory, mac: pending.mac, deviceId: pending.identity.generation.uuidString.lowercased()), mailbox: mailbox, now: Self.now)
            await mailbox.setEnabled(true)
            guard generation == current else { await state.close(); return }
            session = state; defaults.set(hash, forKey: "mobile.account"); defaults.set(false, forKey: "mobile.rotateIdentity")
            // Stored pairing is public metadata; private signing/checkpoint keys remain device-only.
            defaults.set(try JSONEncoder().encode(pending.mac), forKey: "mobile.mac")
            defaults.set(true, forKey: "mobile.enabled")
            status = "Waiting for a verified Mac snapshot"
            let watchMailbox = CloudMailbox(backend: try CloudKitMailboxBackend(database: SystemMobileCloudDatabase(database: container.privateCloudDatabase)))
            await watchMailbox.setEnabled(true)
            guard generation == current else { await watchMailbox.setEnabled(false); return }
            let relay = PhoneWatchRelay(mac: pending.mac, mailbox: watchMailbox) { [weak self] envelope in
                try await self?.receiveWatchProposal(envelope, generation: current)
            }
            watchRelay = relay
            watchChannel = WatchConnectivityChannel { [weak self] packet in
                guard let self, await self.generation == current else { throw CompanionError.closed }
                guard try await container.userRecordID().recordName == account else {
                    await self.forgetAccount(); throw CompanionError.closed
                }
                guard await self.generation == current else { throw CompanionError.closed }
                return try await relay.handle(packet, now: Self.now)
            }
            notificationRefresh = { [weak self] in
                guard let self, !Task.isCancelled, self.generation == current else { throw CompanionError.closed }
                guard try await container.userRecordID().recordName == account else { await self.forgetAccount(); throw CompanionError.closed }
                guard !Task.isCancelled, self.generation == current else { throw CompanionError.closed }
                try await state.reconcile(now: Self.now)
                guard !Task.isCancelled, self.generation == current else { throw CompanionError.closed }
                await self.updateView(state)
            }
            notificationSetup = { [weak self] in
                guard let self, self.generation == current, self.notifications.enabled else { throw CompanionError.closed }
                guard try await container.userRecordID().recordName == account else { await self.forgetAccount(); throw CompanionError.closed }
                guard !Task.isCancelled, self.generation == current, self.notifications.enabled else { throw CompanionError.closed }
                let subscription = CKRecordZoneSubscription(zoneID: CKRecordZone.ID(zoneName: "ShuaCrewMobile", ownerName: CKCurrentUserDefaultName),
                    subscriptionID: "shuacrew-decisions-\(pending.identity.generation.uuidString.lowercased())")
                let info = CKSubscription.NotificationInfo(); info.shouldSendContentAvailable = true
                subscription.notificationInfo = info
                _ = try await container.privateCloudDatabase.save(subscription)
                guard !Task.isCancelled, self.generation == current, self.notifications.enabled else { throw CompanionError.closed }
                UIApplication.shared.registerForRemoteNotifications()
            }
            var retry = MobileSyncRetry()
            poller.configure { [weak self] in
                    guard let self, !Task.isCancelled, self.generation == current else { return nil }
                    var delay: TimeInterval = 15
                    do {
                        guard try await container.userRecordID().recordName == account else { await self.forgetAccount(); return nil }
                        guard !Task.isCancelled, self.generation == current else { return nil }
                        try await state.reconcile(now: Self.now)
                        guard !Task.isCancelled, self.generation == current else { return nil }
                        await self.updateView(state)
                        guard self.generation == current else { return nil }
                        self.error = nil; retry.reset()
                    } catch is CancellationError { return nil }
                    catch {
                        guard !Task.isCancelled, self.generation == current else { return nil }
                        await self.updateView(state)
                        guard self.generation == current else { return nil }
                        self.status = "Waiting to reconnect"
                        self.error = "Sync did not finish. Pending commands keep their original identity; nothing is assumed executed."
                        delay = retry.failure(serverDelay: (error as? CKError)?.retryAfterSeconds)
                    }
                    guard delay <= 86400 else { self.status = "Retry paused — check iCloud"; return nil }
                    return delay
            }
            poller.setActive(foreground)
            if notifications.enabled { await setupNotificationHints() }
        } catch {
            guard generation == current else { return }
            self.error = "Could not start private sync. Check iCloud, provisioning and Mac pairing."
        }
    }
    func resume() async {
        guard defaults.bool(forKey: "mobile.enabled"), session == nil, cloudContainer != nil else { return }
        do {
            guard let bytes = defaults.data(forKey: "mobile.mac") else { return }
            let storage = DeviceMobileIdentityStorage(markerURL: directory.appending(path: "identity"))
            guard try storage.readGeneration() != nil else { await forgetAccount(); return }
            pending = (try JSONDecoder().decode(MacPairingIdentity.self, from: bytes), try MobileKeyStore(storage: storage).loadOrCreate())
            await connect()
        } catch { self.error = "Pairing could not be restored. Pair again with your Mac." }
    }
    func setForeground(_ active: Bool) async {
        foreground = active
        poller.setActive(active)
        if active, session == nil { await resume() }
    }
    func enableNotifications() async {
        guard !configuringNotifications else { return }
        guard notificationSetup != nil else { error = "Enable private sync before enabling decision notifications."; return }
        configuringNotifications = true; defer { configuringNotifications = false }
        let current = generation
        guard await notifications.requestPermission(), generation == current else { return }
        await setupNotificationHints()
        poller.wake()
    }
    private func setupNotificationHints() async {
        let current = generation
        do {
            guard let notificationSetup else { return }
            try await notificationSetup()
            guard generation == current else { return }
            notifications.backgroundReady(true)
        } catch {
            guard generation == current else { return }
            notifications.backgroundReady(false)
        }
    }
    func refreshForNotification() async -> Bool {
        guard notifications.enabled, let notificationRefresh else { return false }
        // Foreground reconciliation already owns this session. Avoid competing sync loops.
        if foreground { poller.wake(); return false }
        let before = snapshot?.observedAt
        do { try await notificationRefresh(); return snapshot?.observedAt != before }
        catch { return false }
    }
    func openDecisionHint(id: String, installation: String) async {
        await resume()
        guard pending?.mac.installationId == installation, session != nil else { return }
        requestedDecision = DecisionLink(id: id)
        poller.wake()
    }
    private func updateView(_ state: CompanionSession) async {
        let value = await state.view(now: Self.now)
        guard session === state else { return }
        if value.revoked {
            await forgetAccount()
            status = "Access revoked — pair again"
            return
        }
        snapshot = value.snapshot; stale = value.stale; commands = value.commands
        rejectedRecords = value.rejectedRecords
        connected = !value.stale && value.snapshot != nil
        lastContact = value.snapshot.map { Date(timeIntervalSince1970: Double($0.observedAt) / 1000) }
        status = connected ? "Verified Mac snapshot" : "Waiting for a fresh Mac snapshot"
        if let snapshot = value.snapshot { await notifications.receiveVerified(snapshot, now: Self.now) }
    }
    @discardableResult func submit(_ intent: CompanionIntent) async -> Bool {
        guard let session, !busy else { return false }
        busy = true; defer { busy = false }
        do {
            _ = try await session.submit(intent, now: Self.now, authenticator: PhoneAuthentication())
            await updateView(session)
            error = nil
            poller.wake()
            return true
        } catch { self.error = "The request was not queued. Authentication may have been cancelled, the offer expired, or sync is busy. Try again after checking its details."; return false }
    }
    func disconnect() async {
        generation = UUID(); poller.stop()
        notificationRefresh = nil; notificationSetup = nil; requestedDecision = nil
        notifications.clear(); UIApplication.shared.unregisterForRemoteNotifications()
        let previous = session; session = nil
        watchChannel?.stop(); watchChannel = nil
        let previousRelay = watchRelay; watchRelay = nil
        watchProposal = nil; watchFingerprint = nil
        snapshot = nil; commands = [:]; connected = false; stale = true; lastContact = nil
        rejectedRecords = 0
        defaults.set(false, forKey: "mobile.enabled"); status = "Cloud sync is off"
        await previous?.close()
        await previousRelay?.close()
    }
    private func receiveWatchProposal(_ envelope: SignedEnvelope, generation expected: UUID) throws {
        guard generation == expected, session != nil else { throw CompanionError.closed }
        watchProposal = String(decoding: try MobileCodec.transportBytes(envelope), as: UTF8.self)
        watchFingerprint = MobilePairing.fingerprint(envelope)
    }
    private func forgetAccount() async {
        await disconnect()
        defaults.set(true, forKey: "mobile.rotateIdentity")
        defaults.removeObject(forKey: "mobile.mac"); defaults.removeObject(forKey: "mobile.account")
        pending = nil; proposal = nil; fingerprint = nil
        status = "Account changed — pair again"
    }
}
