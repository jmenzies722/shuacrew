import AppKit
import ApplicationServices
import CoreImage
import ScreenCaptureKit

/// Spark watching live: a ScreenCaptureKit stream of the display at one frame a second, kept only in memory — the
/// newest frame replaces the last, nothing is written to disk. macOS shows its recording indicator while it runs.
@MainActor
final class LiveScreen: NSObject, SCStreamOutput, SCStreamDelegate {
    private var stream: SCStream?
    private let queue = DispatchQueue(label: "shuacrew.live-screen")
    private let context = CIContext()
    /// The newest frame, kept unconverted: turning it into an image costs GPU time, so that happens only when Spark
    /// actually looks (frame()), never once a second in the background while its voice model needs the GPU.
    private var latest: CIImage?
    private(set) var latestAt = Date.distantPast
    private(set) var screen: NSScreen?
    var running: Bool { stream != nil }
    var onStop: ((String?) -> Void)?

    func start(on screen: NSScreen, excluding windowNumbers: [Int]) async throws {
        stop()
        let number = (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        guard let display = content.displays.first(where: { $0.displayID == number }) ?? content.displays.first else { throw LiveError.noDisplay }
        let mine = content.windows.filter { w in windowNumbers.contains(Int(w.windowID)) }
        let config = SCStreamConfiguration()
        // At most 1600 px on the long side: plenty to read the screen, a fraction of a full Retina frame's cost.
        let full = CGSize(width: Double(display.width) * screen.backingScaleFactor, height: Double(display.height) * screen.backingScaleFactor)
        let scale = min(1, 1600 / max(full.width, full.height))
        config.width = Int(full.width * scale)
        config.height = Int(full.height * scale)
        config.minimumFrameInterval = CMTime(value: 1, timescale: 1) // one frame a second is plenty to follow along
        config.showsCursor = true
        config.queueDepth = 3
        let stream = SCStream(filter: SCContentFilter(display: display, excludingWindows: mine), configuration: config, delegate: self)
        try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: queue)
        try await stream.startCapture()
        self.stream = stream
        self.screen = screen
    }

    func stop() {
        guard let stream else { return }
        self.stream = nil
        latest = nil
        Task { try? await stream.stopCapture() }
    }

    /// The newest frame, if it's fresh enough to trust.
    func frame(maxAge: TimeInterval = 3) -> CGImage? {
        guard let latest, Date().timeIntervalSince(latestAt) <= maxAge else { return nil }
        return context.createCGImage(latest, from: latest.extent)
    }

    nonisolated func stream(_ stream: SCStream, didOutputSampleBuffer buffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, buffer.isValid, let pixels = buffer.imageBuffer else { return }
        // Only complete frames: ScreenCaptureKit also sends "idle" buffers when nothing changed.
        if let attachments = CMSampleBufferGetSampleAttachmentsArray(buffer, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
           let raw = attachments.first?[.status] as? Int, let status = SCFrameStatus(rawValue: raw), status != .complete { return }
        let image = CIImage(cvPixelBuffer: pixels)
        Task { @MainActor in
            self.latest = image
            self.latestAt = Date()
        }
    }

    nonisolated func stream(_ stream: SCStream, didStopWithError error: Error) {
        Task { @MainActor in
            self.stream = nil
            self.latest = nil
            self.onStop?(error.localizedDescription)
        }
    }

    enum LiveError: LocalizedError { case noDisplay; var errorDescription: String? { "No display to watch." } }
}

/// What's actually on screen, from macOS itself: the frontmost app, its window, and every named control in it with its
/// exact position. Accurate where pixels are ambiguous — Spark can point at or press these by name.
@MainActor
enum ScreenElements {
    private static let interesting: Set<String> = [kAXButtonRole, kAXMenuItemRole, kAXMenuBarItemRole, kAXCheckBoxRole, kAXRadioButtonRole, kAXPopUpButtonRole,
        "AXLink", "AXTab", kAXTextFieldRole, kAXTextAreaRole, "AXSearchField", kAXComboBoxRole, kAXSliderRole, kAXDisclosureTriangleRole,
        "AXMenuButton", "AXDockItem", "AXSegmentedControl", kAXIncrementorRole, "AXSwitch", "AXToggle", kAXImageRole, kAXCellRole]

    /// Every control you could be told to click, positions as fractions of `screen` (from the top-left): the front
    /// window first, then that app's menu bar, the Dock and the menu-bar icons (Wi-Fi, battery, Control Center…), which
    /// live in other processes. Icons without a text name still count, named from their help text or role.
    static func read(on screen: NSScreen) -> [String: Any] {
        guard AXIsProcessTrusted(), let app = NSWorkspace.shared.frontmostApplication else { return [:] }
        let root = AXUIElementCreateApplication(app.processIdentifier)
        var windowValue: CFTypeRef?
        AXUIElementCopyAttributeValue(root, kAXFocusedWindowAttribute as CFString, &windowValue)
        let window = windowValue.map { $0 as! AXUIElement }
        let title = window.flatMap { string($0, kAXTitleAttribute) } ?? ""
        var out: [[String: Any]] = []
        walk(window ?? root, on: screen, into: &out, limit: 170, budget: 4000)
        if let menuBar = element(root, kAXMenuBarAttribute) { walk(menuBar, on: screen, into: &out, limit: 200, budget: 200, depth: 2) }
        for id in ["com.apple.dock", "com.apple.controlcenter", "com.apple.systemuiserver"] {
            guard let pid = NSRunningApplication.runningApplications(withBundleIdentifier: id).first?.processIdentifier else { continue }
            let other = AXUIElementCreateApplication(pid)
            let start = element(other, "AXExtrasMenuBar") ?? other
            walk(start, on: screen, into: &out, limit: 260, budget: 600, depth: 4)
        }
        return ["app": app.localizedName ?? "", "window": title, "elements": out]
    }

    private static func walk(_ start: AXUIElement, on screen: NSScreen, into out: inout [[String: Any]], limit: Int, budget: Int, depth maxDepth: Int = 40) {
        let mainHeight = NSScreen.screens.first?.frame.height ?? screen.frame.height, f = screen.frame
        var queue: [(AXUIElement, Int)] = [(start, 0)], seen = 0
        while !queue.isEmpty, seen < budget, out.count < limit {
            let (el, depth) = queue.removeFirst(); seen += 1
            let role = string(el, kAXRoleAttribute) ?? ""
            if interesting.contains(role), let c = frame(el), c.width > 2, c.height > 2 {
                // Global top-left points → this screen's fractions from its top-left.
                let appKitY = mainHeight - c.midY
                let x = (c.midX - f.minX) / f.width, y = (f.maxY - appKitY) / f.height
                if (0...1).contains(x), (0...1).contains(y), let name = label(el, role: role) {
                    // Its size too (fractions), so a highlight can hug the real control instead of the model's guess.
                    let w = min(1, c.width / f.width), h = min(1, c.height / f.height)
                    let subrole = (string(el, kAXSubroleAttribute) ?? "").replacingOccurrences(of: "AX", with: "").lowercased()
                    out.append(["name": name, "role": subrole == "menuextra" ? "menuextra" : role.replacingOccurrences(of: "AX", with: "").lowercased(),
                                "x": (x * 10000).rounded() / 10000, "y": (y * 10000).rounded() / 10000, "w": (w * 10000).rounded() / 10000, "h": (h * 10000).rounded() / 10000])
                }
            }
            guard depth < maxDepth else { continue }
            var children: CFTypeRef?
            if AXUIElementCopyAttributeValue(el, kAXChildrenAttribute as CFString, &children) == .success, let list = children as? [AXUIElement] { queue.append(contentsOf: list.map { ($0, depth + 1) }) }
        }
    }

    /// What to call a control: its title or description, else its help text or identifier, else what kind of control it
    /// is ("button", "image") — so icon-only buttons are listed too. Plain images and cells only when they're named.
    private static func label(_ el: AXUIElement, role: String) -> String? {
        let clean = { (s: String?) -> String? in s.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.flatMap { $0.isEmpty || $0.count >= 80 ? nil : $0 } }
        if let named = [kAXTitleAttribute, kAXDescriptionAttribute, "AXPlaceholderValue", kAXValueAttribute].lazy.compactMap({ clean(string(el, $0)) }).first { return named }
        if role == kAXImageRole || role == kAXCellRole { return nil }
        if let hint = [kAXHelpAttribute, "AXIdentifier"].lazy.compactMap({ clean(string(el, $0)) }).first(where: { !$0.hasPrefix("_NS:") }) { return hint }
        return clean(string(el, kAXRoleDescriptionAttribute)).map { "\($0) (unlabelled icon)" }
    }
    private static func element(_ el: AXUIElement, _ key: String) -> AXUIElement? {
        var v: CFTypeRef?
        guard AXUIElementCopyAttributeValue(el, key as CFString, &v) == .success, let v else { return nil }
        return (v as! AXUIElement)
    }

    private static func string(_ el: AXUIElement, _ key: String) -> String? {
        var v: CFTypeRef?
        guard AXUIElementCopyAttributeValue(el, key as CFString, &v) == .success else { return nil }
        return v as? String
    }
    private static func frame(_ el: AXUIElement) -> CGRect? {
        var pos: CFTypeRef?, size: CFTypeRef?
        guard AXUIElementCopyAttributeValue(el, kAXPositionAttribute as CFString, &pos) == .success,
              AXUIElementCopyAttributeValue(el, kAXSizeAttribute as CFString, &size) == .success else { return nil }
        var p = CGPoint.zero, s = CGSize.zero
        AXValueGetValue(pos as! AXValue, .cgPoint, &p); AXValueGetValue(size as! AXValue, .cgSize, &s)
        guard s.width > 1, s.height > 1 else { return nil }
        return CGRect(origin: p, size: s)
    }
}

/// The text you've selected in the app in front, read through macOS accessibility — no keystrokes, no clipboard.
@MainActor
enum Selection {
    static func read() -> (text: String, app: String)? {
        guard AXIsProcessTrusted(), let app = NSWorkspace.shared.frontmostApplication, app.bundleIdentifier != Bundle.main.bundleIdentifier,
              !SparkHands.offLimits.contains(app.bundleIdentifier ?? "") else { return nil }
        let root = AXUIElementCreateApplication(app.processIdentifier)
        var focused: CFTypeRef?
        guard AXUIElementCopyAttributeValue(root, kAXFocusedUIElementAttribute as CFString, &focused) == .success, let el = focused else { return nil }
        var selected: CFTypeRef?
        guard AXUIElementCopyAttributeValue(el as! AXUIElement, kAXSelectedTextAttribute as CFString, &selected) == .success,
              let text = (selected as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return nil }
        return (String(text.prefix(8000)), app.localizedName ?? "")
    }
}

/// Screen memory: about once a minute, while you've turned it on, read the TEXT on your screen and hand it to the local
/// gateway so Spark can answer "what was that error an hour ago?". No images are kept, nothing leaves the Mac, and it
/// skips password managers, private browser windows, ShuaCrew itself, and any minute you weren't at the Mac.
@MainActor
final class ScreenMemoryRecorder {
    static let key = "shuacrew.screenMemory"
    private let base: URL
    private var timer: Timer?
    private var busy = false
    var excluding: () -> [Int] = { [] }
    var enabled: Bool { UserDefaults.standard.bool(forKey: Self.key) }

    init(base: URL) { self.base = base; if enabled { start() } }

    func set(_ on: Bool) { UserDefaults.standard.set(on, forKey: Self.key); on ? start() : stop() }
    private func start() {
        guard timer == nil else { return }
        timer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in Task { @MainActor in await self?.tick() } }
    }
    private func stop() { timer?.invalidate(); timer = nil }

    func tick() async {
        guard enabled, !busy, ScreenAccess.granted(), let app = NSWorkspace.shared.frontmostApplication,
              app.bundleIdentifier != Bundle.main.bundleIdentifier, !SparkHands.offLimits.contains(app.bundleIdentifier ?? ""),
              CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: CGEventType(rawValue: ~0)!) < 300 else { return }
        let title = Self.windowTitle(of: app)
        if title.range(of: "private|incognito|inprivate", options: [.regularExpression, .caseInsensitive]) != nil { return }
        busy = true; defer { busy = false }
        do {
            let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
            let screen = NSScreen.main ?? NSScreen.screens[0]
            let number = (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value
            guard let display = content.displays.first(where: { $0.displayID == number }) ?? content.displays.first else { return }
            let mine = content.windows.filter { w in self.excluding().contains(Int(w.windowID)) || w.owningApplication?.bundleIdentifier == Bundle.main.bundleIdentifier }
            let config = SCStreamConfiguration()
            config.width = Int(Double(display.width) * screen.backingScaleFactor); config.height = Int(Double(display.height) * screen.backingScaleFactor)
            let image = try await SCScreenshotManager.captureImage(contentFilter: SCContentFilter(display: display, excludingWindows: mine), configuration: config)
            let lines = await ScreenText.read(ScreenText.scaled(image, longest: 2200) ?? image, timeout: 4)
            let text = lines.compactMap { $0["t"] as? String }.joined(separator: "\n")
            guard text.count >= 20 else { return }
            var request = URLRequest(url: URL(string: "/api/screen-memory", relativeTo: base)!)
            request.httpMethod = "POST"; request.setValue("1", forHTTPHeaderField: "X-ShuaCrew"); request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: ["at": Date().timeIntervalSince1970 * 1000, "app": app.localizedName ?? "", "window": title, "text": text])
            _ = try? await URLSession.shared.data(for: request)
        } catch { /* a missed minute is fine */ }
    }

    private static func windowTitle(of app: NSRunningApplication) -> String {
        let root = AXUIElementCreateApplication(app.processIdentifier)
        var window: CFTypeRef?, title: CFTypeRef?
        guard AXUIElementCopyAttributeValue(root, kAXFocusedWindowAttribute as CFString, &window) == .success, let w = window else { return "" }
        AXUIElementCopyAttributeValue(w as! AXUIElement, kAXTitleAttribute as CFString, &title)
        return (title as? String) ?? ""
    }
}

import EventKit
/// Today's calendar, read on this Mac with EventKit — only titles and times, only after you allow it.
@MainActor
enum DayCalendar {
    private static let store = EKEventStore()
    static var authorized: Bool { EKEventStore.authorizationStatus(for: .event) == .fullAccess }
    static func request(_ done: @escaping (Bool) -> Void) {
        store.requestFullAccessToEvents { granted, _ in Task { @MainActor in done(granted) } }
    }
    static func today() -> [[String: Any]] {
        guard authorized else { return [] }
        let start = Calendar.current.startOfDay(for: Date()), end = Calendar.current.date(byAdding: .day, value: 1, to: start)!
        let events = store.events(matching: store.predicateForEvents(withStart: start, end: end, calendars: nil))
        return events.filter { $0.status != .canceled }.sorted { $0.startDate < $1.startDate }.prefix(30).map { e in
            ["title": e.title ?? "Busy", "start": e.startDate.timeIntervalSince1970 * 1000, "end": e.endDate.timeIntervalSince1970 * 1000, "allDay": e.isAllDay]
        }
    }
}
