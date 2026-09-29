import AppKit
import SwiftUI
import Security
import CryptoKit
import CloudKit
import ShuaCrewMobile

struct MobileRoomChoice: Identifiable { let id, title: String }

@MainActor
final class MobileBridge: ObservableObject {
    @Published private(set) var enabled = false
    @Published private(set) var busy = false
    @Published private(set) var status = "Off"
    @Published private(set) var error: String?
    @Published private(set) var lastSuccess: Date?
    @Published private(set) var rooms: [MobileRoomChoice] = []
    @Published private(set) var devices: [PairedMobileDevice] = []
    @Published private(set) var identity: MacPairingIdentity?
    @Published var selectedRooms: Set<String> = []
    @Published private(set) var appliedRooms: Set<String> = []
    let readiness: MobileBuildReadiness
    private let gateway: Gateway
    private let containerID: String?
    private var native: NativeMobileGateway?
    private var mailbox: CloudMailbox?
    private var loop: Task<Void, Never>?
    private var accountObserver: NSObjectProtocol?
    private var generation = UUID()
    private var disabling = false
    private let defaults = UserDefaults.standard
    private var directory: URL { Launcher.home.appending(path: "mobile", directoryHint: .isDirectory) }

    init(gateway: Gateway) {
        self.gateway = gateway
        containerID = Bundle.main.object(forInfoDictionaryKey: "ShuaCrewCloudContainer") as? String
        var code: SecCode?, info: CFDictionary?
        let valid = SecCodeCopySelf([], &code) == errSecSuccess && code != nil
        var staticCode: SecStaticCode?
        if let code, SecCodeCopyStaticCode(code, [], &staticCode) == errSecSuccess, let staticCode {
            _ = SecCodeCopySigningInformation(staticCode, SecCSFlags(rawValue: kSecCSSigningInformation), &info)
        }
        let signing = info as? [String: Any] ?? [:]
        let entitlements = signing[kSecCodeInfoEntitlementsDict as String] as? [String: Any] ?? [:]
        let flags = (signing[kSecCodeInfoFlags as String] as? NSNumber)?.uint32Value ?? 2
        readiness = MobileBuildReadiness(signed: valid, adHoc: flags & 2 != 0, container: containerID,
            entitledContainers: entitlements["com.apple.developer.icloud-container-identifiers"] as? [String] ?? [],
            services: entitlements["com.apple.developer.icloud-services"] as? [String] ?? [],
            team: entitlements["com.apple.developer.team-identifier"] as? String)
        if !readiness.canEnable { status = "Setup required" }
        selectedRooms = Set(defaults.stringArray(forKey: "mobile.rooms") ?? [])
        appliedRooms = selectedRooms
        accountObserver = NotificationCenter.default.addObserver(forName: .CKAccountChanged, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in await self?.accountChanged() }
        }
    }
    deinit { loop?.cancel(); if let accountObserver { NotificationCenter.default.removeObserver(accountObserver) } }
    func start() async {
        await refreshRooms()
        if defaults.bool(forKey: "mobile.enabled"), readiness.canEnable { await enable(resuming: true) }
    }
    func refreshRooms() async {
        do {
            let (data, response) = try await URLSession.shared.data(from: gateway.base.appending(path: "api/snapshot"))
            guard (response as? HTTPURLResponse)?.statusCode == 200,
                  let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let source = root["rooms"] as? [String: [String: Any]] else { throw MobileProtocolError.malformed }
            rooms = source.compactMap { id, room in (room["title"] as? String).map { MobileRoomChoice(id: id, title: $0) } }.sorted { $0.title.localizedStandardCompare($1.title) == .orderedAscending }
        } catch { self.error = "The local gateway is unavailable. Room choices could not be refreshed." }
    }
    func enable(resuming: Bool = false) async {
        guard readiness.canEnable, !busy, !enabled, !disabling, let containerID else { return }
        let current = generation
        busy = true; error = nil; status = "Checking iCloud"; defer { busy = false }
        do {
            // No CKContainer is constructed until the signed-build gate and explicit opt-in pass.
            let container = CKContainer(identifier: containerID)
            guard try await container.accountStatus() == .available else { throw CKError(.notAuthenticated) }
            let account = try await container.userRecordID().recordName
            guard generation == current else { return }
            let accountHash = SHA256.hash(data: Data(account.utf8)).map { String(format: "%02x", $0) }.joined()
            let changed = defaults.string(forKey: "mobile.account").map { $0 != accountHash } ?? false
            if resuming && changed { await accountChanged(); return }
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            let storage = DeviceMobileIdentityStorage(markerURL: directory.appending(path: "installation"))
            let keys = try MobileKeyStore(storage: storage).loadOrCreate(forceNew: changed || defaults.bool(forKey: "mobile.rotateIdentity"))
            let installation = keys.generation.uuidString.lowercased()
            let config = try NativeBridgeFile(url: directory.appending(path: "bridge.json")).loadOrCreate(installationId: installation)
            let client = try NativeMobileGateway(base: gateway.base, credential: config.credential)
            native = client
            identity = MacPairingIdentity(installationId: installation, publicKey: MobileCodec.encodeBase64url(keys.signingKey.publicKey.x963Representation))
            let database = container.privateCloudDatabase
            let zone = CKRecordZone(zoneName: "ShuaCrewMobile")
            do { _ = try await database.recordZone(for: zone.zoneID) }
            catch let cloud as CKError where cloud.code == .zoneNotFound || cloud.code == .unknownItem {
                guard generation == current else { return }
                _ = try await database.save(zone)
            }
            guard generation == current else { return }
            let mailbox = CloudMailbox(backend: try CloudKitMailboxBackend(database: SystemMobileCloudDatabase(database: database)))
            self.mailbox = mailbox
            try await client.configure(MobileGatewayConfig(enabled: true, roomIds: Array(selectedRooms).sorted()))
            guard generation == current else { return }
            await mailbox.setEnabled(true)
            guard generation == current else { await mailbox.setEnabled(false); return }
            appliedRooms = selectedRooms; enabled = true
            defaults.set(true, forKey: "mobile.enabled")
            defaults.set(accountHash, forKey: "mobile.account")
            defaults.set(false, forKey: "mobile.rotateIdentity")
            defaults.set(Array(selectedRooms).sorted(), forKey: "mobile.rooms")
            devices = try await client.devices()
            guard generation == current else { devices = []; return }
            let reconciler = MacMailboxReconciler(mailbox: mailbox, gateway: client, installationId: installation, signingKey: keys.signingKey)
            loop?.cancel()
            loop = Task { [weak self] in
                var retry = MobileSyncRetry()
                while !Task.isCancelled {
                    guard let self, self.enabled, self.generation == current else { return }
                    var delay: TimeInterval = 15
                    do {
                        guard try await container.userRecordID().recordName == account else { await self.accountChanged(); return }
                        try await reconciler.reconcile(now: Int64(Date().timeIntervalSince1970 * 1000))
                        try Task.checkCancellation()
                        guard self.generation == current else { return }
                        let rejected = await reconciler.rejectedRecords
                        guard self.generation == current else { return }
                        self.lastSuccess = Date(); self.status = "Connected"
                        self.error = rejected > 0 ? "Skipped \(rejected) incompatible cloud records in this sync session. Valid records continue syncing." : nil
                        retry.reset()
                    } catch is CancellationError { return }
                    catch {
                        guard self.generation == current else { return }
                        self.status = "Waiting to reconnect"
                        self.error = Self.message(for: error)
                        delay = retry.failure(serverDelay: (error as? CKError)?.retryAfterSeconds)
                    }
                    // A pathological retry-after is surfaced instead of overflowing or retrying early.
                    guard delay <= 86400 else { self.status = "Retry paused — check iCloud"; return }
                    do { try await Task.sleep(for: .seconds(delay)) } catch { return }
                }
            }
        } catch {
            guard generation == current else { return }
            self.error = Self.message(for: error); status = "Setup incomplete"
            await disable(preserveError: true)
        }
    }
    func disable(preserveError: Bool = false) async {
        generation = UUID()
        guard !disabling else { return }
        disabling = true; defer { disabling = false }
        loop?.cancel(); loop = nil; enabled = false
        defaults.set(false, forKey: "mobile.enabled")
        await mailbox?.setEnabled(false); mailbox = nil
        if let native {
            do { try await native.configure(MobileGatewayConfig(enabled: false, roomIds: Array(appliedRooms).sorted())) }
            catch { self.error = "Cloud sync stopped. The gateway could not confirm local disable; check the gateway before enabling again." }
        }
        // Retire the exact local bridge file; the gateway immediately fails closed on new requests.
        let file = directory.appending(path: "bridge.json")
        if FileManager.default.fileExists(atPath: file.path) {
            do { try FileManager.default.moveItem(at: file, to: directory.appending(path: ".disabled-bridge-" + UUID().uuidString)) }
            catch { self.error = "Cloud sync stopped, but local credential retirement failed. Inspect Mobile setup on this Mac." }
        }
        native = nil; lastSuccess = nil
        if !preserveError { status = readiness.canEnable ? "Off" : "Setup required" }
    }
    private func accountChanged() async {
        await disable()
        defaults.set(true, forKey: "mobile.rotateIdentity")
        defaults.removeObject(forKey: "mobile.rooms")
        selectedRooms = []; appliedRooms = []; identity = nil; devices = []
        status = "Account changed — pair again"
    }
    func saveScope() async {
        guard enabled, let native, !busy else { return }
        busy = true; defer { busy = false }
        let selection = selectedRooms
        let current = generation
        do {
            try await native.configure(MobileGatewayConfig(enabled: true, roomIds: Array(selection).sorted()))
            guard generation == current else { return }
            appliedRooms = selection; defaults.set(Array(selection).sorted(), forKey: "mobile.rooms"); error = nil
        } catch { if generation == current { self.error = "Room scope was not saved. Previously applied room choices remain in effect." } }
    }
    func confirmPairing(_ envelope: SignedEnvelope) async {
        guard enabled, let native, let identity, !busy else { return }
        busy = true; defer { busy = false }
        let current = generation
        do {
            let proposal = try MobilePairing.inspect(envelope, mac: identity, now: Int64(Date().timeIntervalSince1970 * 1000))
            try await native.pair(proposal.device)
            let devices = try await native.devices()
            guard generation == current else { return }
            self.devices = devices; error = nil
        } catch { if generation == current { self.error = "Pairing was not confirmed. Check the fingerprint and generate a fresh request on the device." } }
    }
    func revoke(_ device: PairedMobileDevice) async {
        guard let native, !busy else { return }
        busy = true; defer { busy = false }
        let current = generation
        do {
            try await native.revoke(device.id)
            let devices = try await native.devices()
            guard generation == current else { return }
            self.devices = devices; error = nil
        }
        catch { if generation == current { self.error = "Revocation was not confirmed by the Mac gateway. This device must still be treated as paired." } }
    }
    private static func message(for error: Error) -> String {
        if let cloud = error as? CKError {
            if cloud.code == .notAuthenticated { return "Sign in to iCloud in System Settings, then enable mobile sync again." }
            if cloud.code == .quotaExceeded { return "iCloud quota is full. Nothing is marked executed without a Mac acknowledgment." }
            return "iCloud could not complete sync (code \(cloud.code.rawValue)). Commands retain their original identity for retry."
        }
        if let gateway = error as? MobileGatewayError { return "The local gateway did not acknowledge the request (HTTP \(gateway.status))." }
        return "Mobile setup or sync could not finish. Check signing, local key storage, and gateway availability. No success has been assumed."
    }
}
