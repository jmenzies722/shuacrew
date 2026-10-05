import AppKit
import AVFoundation
import Contacts
import CoreLocation
import EventKit
import IOKit.hid
import Photos
import Speech
import UserNotifications

/// Every macOS permission Shua can use, in one place: what it's for, whether it's on, and the honest way to get it.
///
/// Where macOS has a prompt, asking shows the real system prompt (once — macOS never shows it twice). Where it has no
/// prompt (Full Disk Access) or you said no before, it opens the exact System Settings pane instead. Screen Recording,
/// the microphone and Full Disk Access only reach a running app after a relaunch, so those report `relaunch` once
/// you've switched them on in Settings but this process still can't see it.
@MainActor
enum PermissionCenter {
    enum Kind: String, CaseIterable {
        case screen, accessibility, inputMonitoring, microphone, camera, speech, calendars, reminders, contacts, photos,
             location, notifications, fullDisk, files
        var pane: String {
            switch self {
            case .screen: "Privacy_ScreenCapture"
            case .accessibility: "Privacy_Accessibility"
            case .inputMonitoring: "Privacy_ListenEvent"
            case .microphone: "Privacy_Microphone"
            case .camera: "Privacy_Camera"
            case .speech: "Privacy_SpeechRecognition"
            case .calendars: "Privacy_Calendars"
            case .reminders: "Privacy_Reminders"
            case .contacts: "Privacy_Contacts"
            case .photos: "Privacy_Photos"
            case .location: "Privacy_LocationServices"
            case .notifications: ""
            case .fullDisk: "Privacy_AllFiles"
            case .files: "Privacy_FilesAndFolders"
            }
        }
        /// Granted in Settings while running, but this process can't use it until it starts again.
        var needsRelaunch: Bool { self == .screen || self == .microphone || self == .fullDisk }
    }

    /// Apps Shua drives with Apple Events. Each is its own permission: allowing System Events doesn't cover Music.
    static let automationTargets: [(id: String, name: String)] = [
        ("com.apple.systemevents", "System Events"), ("com.apple.finder", "Finder"), ("com.apple.Music", "Music"),
        ("com.apple.Safari", "Safari"), ("com.google.Chrome", "Google Chrome"), ("com.apple.mail", "Mail"),
        ("com.apple.MobileSMS", "Messages"), ("com.apple.Notes", "Notes"), ("com.spotify.client", "Spotify"),
    ]

    private static let defaults = UserDefaults.standard
    private static var location: CLLocationManager?
    private static var notificationStatus = "unknown"

    // MARK: Status

    /// "granted", "denied", "ask" (macOS will show its prompt), "relaunch", or "unknown".
    static func status(_ kind: Kind) -> String {
        let raw: String
        switch kind {
        case .screen: raw = CGPreflightScreenCaptureAccess() ? "granted" : defaults.bool(forKey: asked(kind)) ? "denied" : "ask"
        case .accessibility: raw = AXIsProcessTrusted() ? "granted" : defaults.bool(forKey: asked(kind)) ? "denied" : "ask"
        case .inputMonitoring:
            switch IOHIDCheckAccess(kIOHIDRequestTypeListenEvent) {
            case kIOHIDAccessTypeGranted: raw = "granted"
            case kIOHIDAccessTypeDenied: raw = "denied"
            default: raw = "ask"
            }
        case .microphone: raw = av(AVCaptureDevice.authorizationStatus(for: .audio))
        case .camera: raw = av(AVCaptureDevice.authorizationStatus(for: .video))
        case .speech:
            switch SFSpeechRecognizer.authorizationStatus() {
            case .authorized: raw = "granted"
            case .notDetermined: raw = "ask"
            default: raw = "denied"
            }
        case .calendars: raw = ek(EKEventStore.authorizationStatus(for: .event))
        case .reminders: raw = ek(EKEventStore.authorizationStatus(for: .reminder))
        case .contacts:
            switch CNContactStore.authorizationStatus(for: .contacts) {
            case .authorized, .limited: raw = "granted"
            case .notDetermined: raw = "ask"
            default: raw = "denied"
            }
        case .photos:
            switch PHPhotoLibrary.authorizationStatus(for: .readWrite) {
            case .authorized, .limited: raw = "granted"
            case .notDetermined: raw = "ask"
            default: raw = "denied"
            }
        case .location:
            switch CLLocationManager().authorizationStatus {
            case .authorizedAlways, .authorized: raw = "granted"
            case .notDetermined: raw = "ask"
            default: raw = "denied"
            }
        case .notifications: raw = notificationStatus
        case .fullDisk: raw = fullDiskReadable() ? "granted" : defaults.bool(forKey: asked(kind)) ? "denied" : "ask"
        case .files:
            // Never probe before you've asked: listing the folder *is* what makes macOS ask.
            guard defaults.bool(forKey: asked(kind)) else { return "ask" }
            raw = folders().allSatisfy { (try? FileManager.default.contentsOfDirectory(atPath: $0.path)) != nil } ? "granted" : "denied"
        }
        // You switched it on in Settings, but this process was started before that.
        if raw == "denied", kind.needsRelaunch, defaults.bool(forKey: settingsOpened(kind)) { return "relaunch" }
        return raw
    }

    /// Off the main actor: with `ask`, macOS blocks this call until you answer its dialog.
    nonisolated static func automationStatus(_ bundle: String, ask: Bool = false) -> String {
        guard NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundle) != nil else { return "missing" }
        var target = AEAddressDesc()
        defer { AEDisposeDesc(&target) }
        let created = bundle.withCString { AECreateDesc(typeApplicationBundleID, $0, strlen($0), &target) }
        guard created == noErr else { return "unknown" }
        switch AEDeterminePermissionToAutomateTarget(&target, typeWildCard, typeWildCard, ask) {
        case noErr: return "granted"
        case OSStatus(errAEEventWouldRequireUserConsent): return "ask"
        case OSStatus(errAEEventNotPermitted): return "denied"
        case OSStatus(procNotFound): return "closed" // macOS only answers for a running app
        default: return "unknown"
        }
    }

    /// Everything, for the Access page and for Shua's own picture of what it can do.
    static func snapshot() async -> [String: Any] {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        notificationStatus = settings.authorizationStatus == .notDetermined ? "ask" : [.authorized, .provisional].contains(settings.authorizationStatus) ? "granted" : "denied"
        let kinds = Kind.allCases.map { ["id": $0.rawValue, "status": status($0)] }
        let apps = automationTargets.compactMap { t -> [String: Any]? in
            let s = automationStatus(t.id)
            return s == "missing" ? nil : ["id": t.id, "name": t.name, "status": s]
        }
        return ["permissions": kinds, "automation": apps]
    }

    // MARK: Asking

    /// Show macOS's own prompt when it will still show one; otherwise open the exact pane. Calls back with the new status.
    static func request(_ kind: Kind, done: @escaping @MainActor (String) -> Void) {
        let before = status(kind)
        if before == "granted" { done(before); return }
        if before == "relaunch" { done(before); return }
        if before != "ask" { openSettings(kind); done(status(kind)); return }
        defaults.set(true, forKey: asked(kind))
        let finish: @Sendable (Bool) -> Void = { _ in Task { @MainActor in done(status(kind)) } }
        switch kind {
        case .screen: _ = ScreenAccess.request(); if !CGPreflightScreenCaptureAccess() { openSettings(kind) }; done(status(kind))
        case .accessibility:
            let prompt = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
            _ = AXIsProcessTrustedWithOptions([prompt: true] as CFDictionary); done(status(kind))
        case .inputMonitoring: _ = IOHIDRequestAccess(kIOHIDRequestTypeListenEvent); done(status(kind))
        case .microphone: AVCaptureDevice.requestAccess(for: .audio, completionHandler: finish)
        case .camera: AVCaptureDevice.requestAccess(for: .video, completionHandler: finish)
        case .speech: SFSpeechRecognizer.requestAuthorization { _ in finish(true) }
        case .calendars: EKEventStore().requestFullAccessToEvents { ok, _ in finish(ok) }
        case .reminders: EKEventStore().requestFullAccessToReminders { ok, _ in finish(ok) }
        case .contacts: CNContactStore().requestAccess(for: .contacts) { ok, _ in finish(ok) }
        case .photos: PHPhotoLibrary.requestAuthorization(for: .readWrite) { _ in finish(true) }
        case .location:
            let manager = CLLocationManager(); location = manager
            manager.requestWhenInUseAuthorization()
            // The answer arrives on the manager's delegate; the page re-checks when the app comes back to the front.
            done(status(kind))
        case .notifications:
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { ok, _ in
                Task { @MainActor in notificationStatus = ok ? "granted" : "denied"; done(notificationStatus) }
            }
        case .fullDisk: openSettings(kind); done(status(kind))
        case .files:
            for folder in folders() { _ = try? FileManager.default.contentsOfDirectory(atPath: folder.path) }
            done(status(kind))
        }
    }

    /// Asks macOS for permission to drive one app. It has to be running, so it's opened in the background first.
    static func requestAutomation(_ bundle: String, done: @escaping @MainActor (String) -> Void) {
        let ask = { Task.detached { let s = automationStatus(bundle, ask: true); await MainActor.run { done(s) } } }
        if automationStatus(bundle) == "closed", let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundle) {
            let config = NSWorkspace.OpenConfiguration(); config.activates = false; config.hides = true
            NSWorkspace.shared.openApplication(at: url, configuration: config) { _, _ in DispatchQueue.main.asyncAfter(deadline: .now() + 1) { _ = ask() } }
        } else { _ = ask() }
    }

    static func openSettings(_ kind: Kind) {
        defaults.set(true, forKey: settingsOpened(kind))
        let link = kind == .notifications
            ? "x-apple.systempreferences:com.apple.Notifications-Settings.extension"
            : "x-apple.systempreferences:com.apple.preference.security?\(kind.pane)"
        if let url = URL(string: link) { NSWorkspace.shared.open(url) }
    }

    static func openAutomationSettings() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation") { NSWorkspace.shared.open(url) }
    }

    /// Start again so macOS hands this process the permissions you just switched on.
    static func relaunch() {
        let path = Bundle.main.bundlePath
        let shell = Process()
        shell.executableURL = URL(fileURLWithPath: "/bin/sh")
        shell.arguments = ["-c", "sleep 1; /usr/bin/open \"$0\"", path]
        try? shell.run()
        for kind in Kind.allCases { defaults.removeObject(forKey: settingsOpened(kind)) }
        NSApp.terminate(nil)
    }

    // MARK: The page's door

    /// `{ type: "permissions", op: "list" | "request" | "automation" | "open" | "relaunch", id? }` → a
    /// `shuacrew:permissions` event with the whole snapshot, so every page and the notch agree.
    static func handle(_ body: [String: Any], reply: @escaping @MainActor ([String: Any]) -> Void) {
        let publish = { Task { @MainActor in reply(await snapshot()) } }
        let id = body["id"] as? String ?? ""
        switch body["op"] as? String {
        case "request": if let kind = Kind(rawValue: id) { request(kind) { _ in _ = publish() } } else { _ = publish() }
        case "automation": requestAutomation(id) { _ in _ = publish() }
        case "open": if id == "automation" { openAutomationSettings() } else if let kind = Kind(rawValue: id) { openSettings(kind) }; _ = publish()
        case "relaunch": relaunch()
        default: _ = publish()
        }
    }

    // MARK: Helpers

    private static func asked(_ kind: Kind) -> String { "permissions.asked.\(kind.rawValue)" }
    private static func settingsOpened(_ kind: Kind) -> String { "permissions.settings.\(kind.rawValue)" }
    private static func av(_ s: AVAuthorizationStatus) -> String { s == .authorized ? "granted" : s == .notDetermined ? "ask" : "denied" }
    private static func ek(_ s: EKAuthorizationStatus) -> String { s == .fullAccess ? "granted" : s == .notDetermined ? "ask" : "denied" }
    private static func folders() -> [URL] {
        [.desktopDirectory, .documentDirectory, .downloadsDirectory].compactMap { FileManager.default.urls(for: $0, in: .userDomainMask).first }
    }
    /// Only Full Disk Access lets an app read another app's protected data; a plain file read is the test.
    private static func fullDiskReadable() -> Bool {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        return ["\(home)/Library/Safari/Bookmarks.plist", "\(home)/Library/Application Support/com.apple.TCC/TCC.db"]
            .contains { FileHandle(forReadingAtPath: $0) != nil }
    }
}
