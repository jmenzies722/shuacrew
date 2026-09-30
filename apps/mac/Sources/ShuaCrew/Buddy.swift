import AVFoundation
import AppKit
import ShuaCrewCore
import ScreenCaptureKit
import Vision
import WebKit

/// Spark on your desktop, over every app and Space — even with the ShuaCrew window closed.
/// Passive updates never activate the app. Opening the interactive card uses normal
/// macOS activation so keyboard focus cannot remain claimed in another application.
@MainActor
final class Buddy: NSObject, WKScriptMessageHandler, WKUIDelegate, WKNavigationDelegate {
    private let teaching = TeachingOverlay()
    static let enabledKey = "buddyEnabled"
    private static let cornerKey = "buddyCorner"
    /// Spark's own size on the desktop (S/M/L in Settings); the panel hugs it when the card is closed.
    private var closed = NSSize(width: 104, height: 108)
    private static let sizes: [String: NSSize] = ["s": NSSize(width: 88, height: 92), "m": NSSize(width: 104, height: 108), "l": NSSize(width: 132, height: 136)]
    private var gripWidth: NSLayoutConstraint!
    private var gripHeight: NSLayoutConstraint!
    private var isOpen = false
    private var docked = UserDefaults.standard.bool(forKey: "buddyNotchDock")
    private var staysOnTop = false
    private var requestedSize = NSSize(width: 104, height: 108)
    private static let dockSize = NSSize(width: 240, height: 48)
    /// The notch nook: what the pill opens into when you hover it.
    private static let nookSize = NSSize(width: 520, height: 250)
    private var isNook = false
    /// Notch island (after Knurl): the camera housing it grows from, and how far the page's shape currently reaches.
    private var notchHousing: CGRect?
    private var islandFlare: CGFloat = 130, islandDrop: CGFloat = 250
    private static let open = NSSize(width: 420, height: 620)
    /// A canvas for diagrams: system designs need room.
    private static let wide = NSSize(width: 940, height: 720)
    /// Room for a speech bubble beside Spark ("Aria finished…") without the whole card.
    private static let peek = NSSize(width: 360, height: 240)
    /// The fn quick card: small, beside your pointer.
    private static let mini = NSSize(width: 360, height: 220)
    private var isMini = false

    private let gateway: Gateway
    private lazy var wake: WakeWord = {
        let w = WakeWord()
        w.onWake = { [weak self] in
            guard let self else { return }
            self.raise()
            self.web.evaluateJavaScript("window.dispatchEvent(new Event('shuacrew:wake'))")
        }
        return w
    }()
    private lazy var memory: ScreenMemoryRecorder = {
        let m = ScreenMemoryRecorder(base: gateway.base)
        m.excluding = { [weak self] in self?.ownWindows ?? [] }
        return m
    }()
    private let panel: BuddyPanel
    private let web: WKWebView
    private let grip = BuddyGrip()
    private let pointer = PointerOverlay()
    /// Live mode: a real screen stream while you choose, so every question sees what's there right now.
    private let live = LiveScreen()
    /// The display the last screenshot came from — where pointing lands.
    private var shotScreen: NSScreen?
    private var loaded = false
    private var ready = false
    private var pendingFocus = false
    private let location = LocationOnce()
    /// Opens a path in the main window (a session, Learning, Usage…).
    var onOpen: ((String) -> Void)?
    /// "Change your shortcut to ⌃⇧Space", said to Spark.
    var onHotkey: ((String) -> Void)?

    static var enabled: Bool {
        get { UserDefaults.standard.object(forKey: enabledKey) as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: enabledKey) }
    }

    init(gateway: Gateway) {
        SparkHands.watchApps() // know the app you're working in before the notch ever takes the keyboard
        self.gateway = gateway
        let config = WKWebViewConfiguration()
        config.userContentController.addUserScript(WKUserScript(
            source: "document.documentElement.dataset.shell = 'mac';",
            injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.writingToolsBehavior = .none
        config.mediaTypesRequiringUserActionForPlayback = [] // Spark talks back as the answer streams in
        web = WKWebView(frame: .zero, configuration: config)
        web.setValue(false, forKey: "drawsBackground")
        panel = BuddyPanel(contentRect: NSRect(origin: .zero, size: closed), styleMask: [.borderless], backing: .buffered, defer: false)
        super.init()
        panel.isFloatingPanel = true
        // Not always on top by default: Spark sits on your desktop like any window and comes forward when you call it,
        // when it talks, or when it's teaching. "Stay on top" in Spark settings pins it above everything.
        panel.level = .normal
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        panel.backgroundColor = .clear
        panel.isOpaque = false
        panel.hasShadow = false
        panel.hidesOnDeactivate = false
        panel.isReleasedWhenClosed = false
        // WebKit's hit views are not AppKit text fields and need not report
        // needsPanelToBecomeKey. A click anywhere in the card must acquire focus.
        panel.becomesKeyOnlyIfNeeded = false

        let root = NSView()
        panel.contentView = root
        for view in [web, grip] as [NSView] { view.translatesAutoresizingMaskIntoConstraints = false; root.addSubview(view) }
        NSLayoutConstraint.activate([
            web.leadingAnchor.constraint(equalTo: root.leadingAnchor), web.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            web.topAnchor.constraint(equalTo: root.topAnchor), web.bottomAnchor.constraint(equalTo: root.bottomAnchor),
            // The character sits in the bottom-right corner of the page; the grip covers exactly it.
            grip.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -8), grip.bottomAnchor.constraint(equalTo: root.bottomAnchor, constant: -8),
        ])
        gripWidth = grip.widthAnchor.constraint(equalToConstant: 88)
        gripHeight = grip.heightAnchor.constraint(equalToConstant: 92)
        NSLayoutConstraint.activate([gripWidth, gripHeight])
        grip.onClick = { [weak self] in self?.toggle() }
        pointer.onGuideClick = { [weak self] in
            (self?.guideTarget ?? self?.web)?.evaluateJavaScript("window.dispatchEvent(new Event('shuacrew:guideClick'))")
        }
        // A click on one of Spark's labels or cards: Spark takes it from there (does that step, or tells you more).
        pointer.onMarkClick = { [weak self] text in
            guard let data = try? JSONSerialization.data(withJSONObject: ["text": text]), let json = String(data: data, encoding: .utf8) else { return }
            self?.web.evaluateJavaScript("window.dispatchEvent(new CustomEvent('shuacrew:mark', { detail: \(json) }))")
        }
        grip.onMoved = { [weak self] in self?.rememberCorner() }
        web.uiDelegate = self
        web.navigationDelegate = self
        config.userContentController.add(WeakHandler(self), name: "shuacrew")
        place(size: closed)
        NotificationCenter.default.addObserver(self, selector: #selector(displaysChanged), name: NSApplication.didChangeScreenParametersNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(appActivity), name: NSApplication.didBecomeActiveNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(appActivity), name: NSApplication.didResignActiveNotification, object: nil)
        // Away and back (locked, or the displays slept): Spark can catch you up when you return.
        DistributedNotificationCenter.default().addObserver(self, selector: #selector(wentAway), name: .init("com.apple.screenIsLocked"), object: nil)
        DistributedNotificationCenter.default().addObserver(self, selector: #selector(cameBack), name: .init("com.apple.screenIsUnlocked"), object: nil)
        NSWorkspace.shared.notificationCenter.addObserver(self, selector: #selector(wentAway), name: NSWorkspace.screensDidSleepNotification, object: nil)
        NSWorkspace.shared.notificationCenter.addObserver(self, selector: #selector(cameBack), name: NSWorkspace.screensDidWakeNotification, object: nil)
    }

    private var awaySince: Date?
    @objc private func wentAway() { if awaySince == nil { awaySince = Date() } }
    /// Once per return: waking the displays and unlocking are the same homecoming.
    @objc private func cameBack() {
        guard let since = awaySince else { return }
        awaySince = nil
        send("shuacrew:welcome", ["awayMs": (Date().timeIntervalSince(since) * 1000).rounded()])
    }

    @objc private func displaysChanged() { place(size: requestedSize) }
    /// Tell the pages whether ShuaCrew is the app in front: decorative motion (blinks, orbits, the aurora) rests while
    /// you're elsewhere. The notch panel never takes focus, so it can't work this out on its own.
    @objc private func appActivity() {
        let js = "window.__appActive && window.__appActive(\(NSApp.isActive))"
        for w in [web, appWeb].compactMap({ $0 }) { w.evaluateJavaScript(js) }
    }

    // MARK: showing

    func start() {
        guard Self.enabled else { return }
        if !loaded {
            loaded = true
            web.load(URLRequest(url: URL(string: "/buddy", relativeTo: gateway.base)!))
            startFnKey()
        }
        panel.orderFrontRegardless()
        updateCursorBuddy()
        if !liveSpeech.ready { liveSpeech.prepare() }
    }

    func setEnabled(_ on: Bool) {
        guard on != Self.enabled || on != panel.isVisible else { return }
        Self.enabled = on
        if on { start() } else { panel.orderOut(nil); pointer.hide(); cursorBuddy.stop() }
    }

    /// ⌃⌥Space: Spark opens with the question box focused, whatever app you're in.
    func summon() {
        if !Self.enabled { setEnabled(true) }
        start()
        NSApp.activate()
        panel.makeKeyAndOrderFront(nil)
        guard ready else { pendingFocus = true; return }
        web.evaluateJavaScript("window.buddy && window.buddy.focus()")
    }

    private var guiding = false
    private func raise() { panel.orderFrontRegardless() }

    // MARK: the cursor buddy (notch mode)
    /// In notch mode Spark's home is the notch; beside your pointer rides a tiny native buddy (CursorBuddy) that shows
    /// what Spark is doing and launches to whatever it points at. The Spark window itself never chases the cursor.
    private let cursorBuddy = CursorBuddy()
    /// Your words live, on this Mac (Apple's streaming recognizer); the page decides whether its final is sure enough.
    private let liveSpeech = LiveTranscriber()
    private func updateCursorBuddy() {
        if following && docked { cursorBuddy.start() } else { cursorBuddy.stop() }
    }
    static func appendSelfTest(_ line: String) {
        let path = NSHomeDirectory() + "/.shuacrew/spark-selftest.log"
        if let h = FileHandle(forWritingAtPath: path) { h.seekToEndOfFile(); h.write(Data(line.utf8)); try? h.close() } else { try? line.write(toFile: path, atomically: true, encoding: .utf8) }
    }
    /// Where a pointing flight starts: from the buddy beside your pointer when it's there, else from Spark.
    private func launchPoint() -> NSPoint { cursorBuddy.launch() ?? sparkCenter }
    /// Spark's own windows, which its screenshots always leave out.
    private var ownWindows: [Int] { [panel.windowNumber] + (cursorBuddy.windowNumber.map { [$0] } ?? []) }

    // MARK: follow my cursor (Clicky-style)
    /// Collapsed, Spark rides beside the pointer. Clicks pass through it while it follows; it pauses to walk
    /// over and point, stops while you talk to it (opening where it is), and never takes keyboard focus.
    private var following = UserDefaults.standard.object(forKey: "buddyFollowCursor") as? Bool ?? true
    private var followTimer: Timer?
    private func updateFollow() {
        let active = following && !isOpen && !guiding && !docked && !isMini
        panel.ignoresMouseEvents = active || (docked && !isOpen && !isNook)
        guard active else { followTimer?.invalidate(); followTimer = nil; return }
        guard followTimer == nil else { return }
        let timer = Timer(timeInterval: 1.0 / 60, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.followStep() }
        }
        RunLoop.main.add(timer, forMode: .common)
        followTimer = timer
    }
    // MARK: notch nook: hover to open
    /// In notch mode, watch the pointer against the pill (and the nook once open) and tell the page when you arrive
    /// or leave; the page opens the nook and tucks it away. A light 10 Hz check, only while docked and closed.
    private var nookTimer: Timer?
    private var pointerInNook = false
    private func updateNookWatch() {
        let watch = docked && !isOpen
        guard watch else { nookTimer?.invalidate(); nookTimer = nil; pointerInNook = false; return }
        guard nookTimer == nil else { return }
        let timer = Timer(timeInterval: 0.1, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                guard let housing = self.notchHousing else { return }
                let target = self.isNook ? NotchIsland.openTarget(housing: housing, flare: self.islandFlare, drop: self.islandDrop) : NotchIsland.hoverTarget(housing: housing)
                let inside = target.contains(NSEvent.mouseLocation)
                guard inside != self.pointerInNook else { return }
                self.pointerInNook = inside
                self.web.evaluateJavaScript("window.buddy && window.buddy.nook && window.buddy.nook(\(inside))")
            }
        }
        RunLoop.main.add(timer, forMode: .common)
        nookTimer = timer
    }

    // MARK: fn key (Globe): tap for the quick card, hold to talk
    /// fn on its own: a tap shows or hides the small card beside your pointer; holding it talks until you let go.
    /// fn used as a modifier (fn+F-keys, fn+arrows) is left alone (see FnGesture). Watching keys outside
    /// ShuaCrew needs Accessibility access, which Spark already asks for to click for you.
    private var fnGesture = FnGesture()
    private var fnMonitors: [Any] = []
    private var fnTimer: Timer?
    private var fnEnabled = UserDefaults.standard.object(forKey: "buddyFnKey") as? Bool ?? true
    private func startFnKey() {
        for m in fnMonitors { NSEvent.removeMonitor(m) }
        fnMonitors = []
        guard fnEnabled else { return }
        let seen: @Sendable (NSEvent) -> Void = { [weak self] event in
            let type = event.type, flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
            Task { @MainActor in self?.fnEvent(type: type, flags: flags) }
        }
        if let global = NSEvent.addGlobalMonitorForEvents(matching: [.flagsChanged, .keyDown], handler: seen) { fnMonitors.append(global) }
        if let local = NSEvent.addLocalMonitorForEvents(matching: [.flagsChanged, .keyDown], handler: { event in seen(event); return event }) { fnMonitors.append(local) }
    }
    private func fnEvent(type: NSEvent.EventType, flags: NSEvent.ModifierFlags) {
        let now = ProcessInfo.processInfo.systemUptime
        if type == .keyDown { fnSignal(fnGesture.otherKey()); return }
        let fn = flags.contains(.function), others = !flags.subtracting([.function, .capsLock, .numericPad]).isEmpty
        if fn && !others {
            fnSignal(fnGesture.down(at: now))
            if fnTimer == nil {
                let timer = Timer(timeInterval: 0.05, repeats: true) { [weak self] _ in
                    MainActor.assumeIsolated { guard let self else { return }; self.fnSignal(self.fnGesture.tick(at: ProcessInfo.processInfo.systemUptime)) }
                }
                RunLoop.main.add(timer, forMode: .common); fnTimer = timer
            }
        } else if fn {
            fnSignal(fnGesture.otherKey())
        } else {
            fnTimer?.invalidate(); fnTimer = nil
            fnSignal(fnGesture.up(at: now))
        }
    }
    private func fnSignal(_ signal: FnGesture.Signal) {
        let kind: String
        switch signal {
        case .none: return
        // fn might still be a modifier (fn+arrow): warm or cool the mic quietly, without bringing Spark forward.
        case .press, .cancel:
            guard Self.enabled else { return }
            web.evaluateJavaScript("window.buddy && window.buddy.fn && window.buddy.fn('\(signal == .press ? "down" : "cancel")')")
            return
        case .tap: kind = "tap"; case .holdStart: kind = "hold"; case .holdEnd: kind = "release"
        }
        if !Self.enabled { setEnabled(true) }
        start(); raise()
        web.evaluateJavaScript("window.buddy && window.buddy.fn && window.buddy.fn('\(kind)')")
    }
    /// What the Globe key does in System Settings: anything but "Do Nothing" also opens emoji or dictation.
    private func globeKeyUse() -> Int { UserDefaults(suiteName: "com.apple.HIToolbox")?.integer(forKey: "AppleFnUsageType") ?? 0 }

    private func followStep() {
        guard following, !isOpen, !guiding, !docked, !isMini else { updateFollow(); return }
        let cursor = NSEvent.mouseLocation
        guard let screen = NSScreen.screens.first(where: { $0.frame.contains(cursor) }) ?? NSScreen.main else { return }
        let size = panel.frame.size
        let target = CompanionPlacement.follow(cursor: cursor, size: size, visible: screen.visibleFrame).origin
        let now = panel.frame.origin
        guard abs(target.x - now.x) > 0.5 || abs(target.y - now.y) > 0.5 else { return }
        // A jump across displays lands at once; on the same display it eases after the pointer.
        let far = hypot(target.x - now.x, target.y - now.y) > 900
        panel.setFrameOrigin(far ? target : CompanionPlacement.ease(from: now, to: target))
    }

    /// Teaching: Spark walks over to stand beside the step it's showing you, then goes home when the lesson ends.
    private func walk(beside x: Double, _ y: Double, _ w: Double, _ h: Double, on screen: NSScreen) {
        guard !isOpen else { return }
        let f = screen.frame, v = screen.visibleFrame, size = panel.frame.size
        let target = NSRect(x: f.minX + (x - w / 2) * f.width, y: f.maxY - (y + h / 2) * f.height, width: w * f.width, height: h * f.height)
        var origin = NSPoint(x: target.maxX + 28, y: target.midY - size.height / 2)
        if origin.x + size.width > v.maxX { origin.x = target.minX - 28 - size.width }   // no room on the right: stand on the left
        origin.x = min(max(origin.x, v.minX), v.maxX - size.width)
        origin.y = min(max(origin.y, v.minY), v.maxY - size.height)
        guiding = true
        raise()
        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 0.55; ctx.timingFunction = CAMediaTimingFunction(controlPoints: 0.2, 0.9, 0.3, 1)
            panel.animator().setFrame(NSRect(origin: origin, size: size), display: true)
        }
    }
    private func walkHome() {
        guard guiding else { return }
        guiding = false
        if following && !docked { updateFollow(); return }   // back to your pointer, not the corner
        if docked { place(size: requestedSize); return }
        let corner = savedCorner() ?? defaultCorner(), size = panel.frame.size
        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 0.5
            panel.animator().setFrame(NSRect(x: corner.x - size.width, y: corner.y, width: size.width, height: size.height), display: true)
        }
    }

    /// Open Spark from the menu bar or a shuacrew:// link, optionally asking something right away.
    func open(asking text: String? = nil) {
        NSApp.activate()
        raise(); panel.makeKeyAndOrderFront(nil)
        if let text, let data = try? JSONSerialization.data(withJSONObject: [text]), let json = String(data: data, encoding: .utf8) {
            web.evaluateJavaScript("window.buddy && window.buddy.ask(\(json)[0])")
        } else {
            web.evaluateJavaScript("window.buddy && window.buddy.focus()")
        }
    }

    private func toggle() {
        if !isOpen { NSApp.activate() }
        raise()
        panel.makeKeyAndOrderFront(nil)
        web.evaluateJavaScript("window.buddy && window.buddy.toggle()")
    }

    /// Grow or shrink around the bottom-right corner, so Spark stays put and the empty, clear area never blocks your clicks.
    private func place(size: NSSize) {
        requestedSize = size
        guard let primary = NSScreen.main ?? NSScreen.screens.first else { return }
        let corner = savedCorner() ?? defaultCorner()
        let screen = docked
            ? (NSScreen.screens.first(where: { $0.safeAreaInsets.top > 0 }) ?? primary)
            : (NSScreen.screens.first(where: { $0.frame.contains(corner) }) ?? primary)
        panel.flushTop = docked
        let actual = docked && !isOpen ? (isNook ? Self.nookSize : size == Self.peek ? NSSize(width: 360, height: 240) : Self.dockSize) : size
        // Notch mode, collapsed or hovering: one fixed canvas flush with the top of the screen; the page draws the island
        // shape inside it and grows it in place, so the window never resizes and nothing is clipped. Clicks pass through
        // everywhere except the open nook, so the menu bar stays yours.
        if docked && !isOpen {
            let housing = NotchIsland.housing(screen: screen.frame, leftAux: screen.auxiliaryTopLeftArea, rightAux: screen.auxiliaryTopRightArea, safeAreaTop: screen.safeAreaInsets.top)
                ?? NotchIsland.virtualHousing(screen: screen.frame, menuBar: screen.frame.maxY - screen.visibleFrame.maxY)
            notchHousing = housing
            grip.isHidden = true
            panel.level = .statusBar
            panel.ignoresMouseEvents = !isNook
            let canvas = NotchIsland.canvas(housing: housing, screen: screen.frame)
            if panel.frame != canvas { panel.setFrame(canvas, display: true, animate: false) }
            web.evaluateJavaScript("window.buddy && window.buddy.notch && window.buddy.notch({ w: \(Int(housing.width)), h: \(Int(housing.height)), real: \(screen.safeAreaInsets.top > 10) })")
            return
        }
        panel.ignoresMouseEvents = false
        let pointer = NSEvent.mouseLocation, pointerScreen = NSScreen.screens.first(where: { $0.frame.contains(pointer) }) ?? primary
        let frame = isMini && !isOpen
            ? CompanionPlacement.follow(cursor: pointer, size: size, visible: pointerScreen.visibleFrame)   // the fn card opens beside your pointer
            : docked
            ? NotchIsland.chat(size: actual, housing: notchHousing ?? NotchIsland.virtualHousing(screen: screen.frame, menuBar: screen.frame.maxY - screen.visibleFrame.maxY), screen: screen.frame)
            : CompanionPlacement.clamp(NSRect(x: corner.x - size.width, y: corner.y, width: size.width, height: size.height), to: screen.visibleFrame)
        // Dock mode uses real web buttons; the free-placement character keeps its native drag grip.
        grip.isHidden = docked || isOpen
        panel.level = docked ? .statusBar : staysOnTop || isMini ? .floating : .normal
        panel.setFrame(frame, display: true, animate: false)
        // The open chat grows out of the notch: the page draws the housing's black cap at the top, sized to the real cutout.
        if docked, let housing = notchHousing { web.evaluateJavaScript("window.buddy && window.buddy.notch && window.buddy.notch({ w: \(Int(housing.width)), h: \(Int(housing.height)), real: \(screen.safeAreaInsets.top > 10) })") }
        if isMini { raise() }
    }

    private func defaultCorner() -> NSPoint {
        let visible = (NSScreen.main ?? NSScreen.screens[0]).visibleFrame
        return NSPoint(x: visible.maxX - 16, y: visible.minY + 16)
    }
    private func savedCorner() -> NSPoint? {
        guard let s = UserDefaults.standard.string(forKey: Self.cornerKey) else { return nil }
        let p = NSPointFromString(s)
        return NSScreen.screens.contains(where: { $0.frame.insetBy(dx: -1, dy: -1).contains(p) }) ? p : nil
    }
    private func rememberCorner() {
        guard !docked else { return }
        UserDefaults.standard.set(NSStringFromPoint(NSPoint(x: panel.frame.maxX, y: panel.frame.minY)), forKey: Self.cornerKey)
    }

    // MARK: page bridge

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        let origin = message.frameInfo.securityOrigin
        guard message.frameInfo.isMainFrame, origin.host == gateway.base.host, origin.port == (gateway.base.port ?? 80),
              let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        // Replies go back to whoever asked: the desktop panel or the app window's Spark panel.
        let sender = message.webView
        switch type {
        case "buddyReady":
            if sender === web {
                ready = true
                if pendingFocus { pendingFocus = false; summon() }
            }
        case "buddyExpand":
            // The embedded companion shares this bridge, but must never change
            // the desktop panel's geometry or keyboard ownership.
            guard sender === web else { return }
            if let placement = body["desktopPlacement"] as? String, ["free", "notch"].contains(placement) {
                docked = placement == "notch"
                UserDefaults.standard.set(docked, forKey: "buddyNotchDock")
                updateCursorBuddy()
            }
            let open = body["open"] as? Bool ?? false, peek = body["peek"] as? Bool ?? false
            if let key = body["size"] as? String, let size = Self.sizes[key] {
                closed = size
                gripWidth.constant = size.width - 16
                gripHeight.constant = size.height - 16
            }
            // Opened while following: it opens right where it is (beside your pointer), not back in the corner.
            if open && !isOpen && following && !docked && !isMini { rememberCorner() }
            isMini = !open && (body["mini"] as? Bool ?? false)
            isNook = docked && !open && (body["nook"] as? Bool ?? false)
            // Record open/closed BEFORE re-checking the hover watch: checking first saw the chat as still open when it
            // closed, stopped watching, and nothing restarted it, so hovering the notch did nothing after a click.
            isOpen = open
            updateNookWatch()
            place(size: open ? (body["wide"] as? Bool ?? false ? Self.wide : Self.open) : isMini ? Self.mini : peek ? Self.peek : closed)
            updateFollow()
            if !open, panel.isKeyWindow {
                // resignKey() is an AppKit notification/override point, not an
                // operation for changing focus. Calling it directly can leave
                // AppKit's keyboard ownership inconsistent.
                // Ordering out releases that claim; ordering front does not
                // make the collapsed character key again.
                panel.orderOut(nil)
                panel.orderFrontRegardless()
            }
        case "buddyDo":
            guard let id = body["id"] as? String, let action = body["action"] as? [String: Any] else { return }
            let screen = shotScreen ?? panel.screen ?? NSScreen.main ?? NSScreen.screens[0]
            switch action["type"] as? String {
            case "click", "type", "key", "scroll":
                // You see Spark's cursor travel to the spot and land; the real click happens as it lands.
                var lead = 0.1
                if action["type"] as? String == "click", let x = action["x"] as? Double, let y = action["y"] as? Double {
                    lead = pointer.show(on: screen, x: x, y: y, label: action["label"] as? String ?? "", color: action["color"] as? String, from: launchPoint()) + 0.12
                }
                watchForStop()
                DispatchQueue.main.asyncAfter(deadline: .now() + max(0.1, lead)) { [weak self] in
                    guard let self else { return }
                    let run = { let r = SparkHands.act(action, screen: screen); self.did(["id": id, "ok": r.ok, "message": r.message], to: sender) }
                    // Typing in a web page goes onto the field itself (exact, never doubled); the keyboard is the fallback.
                    if action["type"] as? String == "type", let app = SparkHands.target, ShuaWeb.supports(app), let text = action["text"] as? String {
                        let submit = text.hasSuffix("\n"), value = submit ? String(text.dropLast()) : text
                        Task { @MainActor in
                            do { self.did(["id": id, "ok": true, "message": try await ShuaWeb.type(value, into: action["label"] as? String ?? "", submit: submit, in: app)], to: sender) }
                            catch ShuaWeb.Failure.javascriptOff(let name) { let r = SparkHands.act(action, screen: screen); self.did(["id": id, "ok": r.ok, "message": r.message + ". (Typed with the keyboard: turn on browser_js so I can type into \(name) pages exactly.)"], to: sender) }
                            catch { SparkHands.focusTarget(run) }
                        }
                        return
                    }
                    // Typing and keys land in the key window: hand the keyboard back to your app first if the notch has it.
                    if ["type", "key"].contains(action["type"] as? String ?? "") { SparkHands.focusTarget(run) } else { run() }
                }
            case "run":
                // The page has already checked this command against ShuaCrew's policy (and asked you if needed).
                guard let command = action["command"] as? String, !command.isEmpty, command.count <= 2000 else { did(["id": id, "ok": false, "message": "No command."], to: sender); break }
                SparkShell.run(command) { [weak self] status, output in
                    Task { @MainActor in
                        let tail = output.count > 4000 ? "…" + output.suffix(4000) : output
                        self?.did(["id": id, "ok": status == 0, "message": status == 0 ? "Ran it" : "Exited \(status)", "output": tail], to: sender)
                    }
                }
            case "press":
                // Find it by name, fly the cursor there, then press it as the cursor lands.
                guard SparkHands.trusted else { SparkHands.askForAccess(); did(["id": id, "ok": false, "message": "Spark needs Accessibility access: System Settings → Privacy & Security → Accessibility → ShuaCrew."], to: sender); break }
                let label = action["label"] as? String ?? ""
                // In a web page: press the page's own element by name (macOS can't see inside the page).
                if let app = SparkHands.target, ShuaWeb.supports(app), !label.isEmpty {
                    Task { @MainActor in
                        do { let did = try await ShuaWeb.click(label, in: app); self.did(["id": id, "ok": true, "message": did], to: sender); return }
                        catch ShuaWeb.Failure.javascriptOff(let name) { if SparkPress.find(label) == nil { self.did(["id": id, "ok": false, "message": ShuaWeb.Failure.javascriptOff(name).localizedDescription], to: sender); return } }
                        catch { if SparkPress.find(label) == nil { self.did(["id": id, "ok": false, "message": error.localizedDescription], to: sender); return } }
                        guard let found = SparkPress.find(label) else { return }
                        _ = SparkPress.press(found); self.did(["id": id, "ok": true, "message": "Pressed “\(found.name)”"], to: sender)
                    }
                    break
                }
                guard let found = SparkPress.find(label) else { did(["id": id, "ok": false, "message": "Couldn't find “\(label)” in \(SparkHands.target?.localizedName ?? "the app in front")."], to: sender); break }
                let main = NSScreen.screens.first ?? screen
                let target = NSScreen.screens.first { s in
                    let f = s.frame, y = main.frame.height - found.center.y
                    return f.contains(CGPoint(x: found.center.x, y: y))
                } ?? main
                let f = target.frame, appKitY = main.frame.height - found.center.y
                let lead = pointer.show(on: target, x: (found.center.x - f.minX) / f.width, y: (f.maxY - appKitY) / f.height, label: found.name, color: action["color"] as? String, from: launchPoint()) + 0.12
                watchForStop()
                DispatchQueue.main.asyncAfter(deadline: .now() + lead) { [weak self] in
                    let ok = SparkPress.press(found)
                    self?.did(["id": id, "ok": ok, "message": ok ? "Pressed “\(found.name)”" : "Couldn't press “\(found.name)”"], to: sender)
                }
            case "media":
                // Off the main thread: a slow music app can't freeze the notch.
                nonisolated(unsafe) let a = action
                SparkHands.musicQueue.async { let r = SparkHands.media(a); Task { @MainActor [weak self] in self?.did(["id": id, "ok": r.ok, "message": r.message], to: sender) } }
            case "system":
                let r = SparkHands.system(action); did(["id": id, "ok": r.ok, "message": r.message], to: sender)
            case "shortcut":
                Task { let r = await SparkHands.shortcut(action); did(["id": id, "ok": r.ok, "message": r.message], to: sender) }
            case "open_settings":
                // A System Settings page, straight to it. Only genuine System Settings links are opened.
                let link = action["url"] as? String ?? ""
                if link.range(of: #"^x-apple\.systempreferences:com\.apple\.[A-Za-z0-9.\-]+(\?Privacy_[A-Za-z]+)?$"#, options: .regularExpression) != nil, let url = URL(string: link) {
                    MacActions.open(url); did(["id": id, "ok": true, "message": "Opened"], to: sender)
                } else { did(["id": id, "ok": false, "message": "That isn't a System Settings page."], to: sender) }
            case "mac" where (action["op"] as? String ?? "").hasPrefix("music_"):
                // What's playing / your playlists: on the music queue (one AppleScript at a time, never the main thread).
                let op = action["op"] as? String ?? ""
                SparkHands.musicQueue.async { let r = SparkHands.musicInfo(op); Task { @MainActor [weak self] in self?.did(["id": id, "ok": r.ok, "message": r.message, "output": r.output], to: sender) } }
            case "mac" where action["op"] as? String == "chess":
                // The board on the page + Stockfish on this Mac → the move and its exact squares (fair play enforced).
                let screen = shotScreen ?? panel.screen ?? NSScreen.main ?? NSScreen.screens[0]
                Task { @MainActor in let r = await ShuaChess.best(on: screen); self.did(["id": id, "ok": r.ok, "message": r.message, "output": r.output ?? ""], to: sender) }
            case "mac":
                // Your files, calendar, reminders, notes, contacts and this Mac's state (see MacKnowledge): off the main thread.
                MacKnowledge.run(action) { [weak self] ok, message, output in
                    Task { @MainActor in self?.did(["id": id, "ok": ok, "message": message, "output": output], to: sender) }
                }
            case "mail":
                // Your mail, through the Mail app: read and draft only, never send (see MailBridge).
                MailBridge.run(action) { [weak self] ok, message, output in
                    Task { @MainActor in self?.did(["id": id, "ok": ok, "message": message, "output": output], to: sender) }
                }
            default:
                let result = MacActions.perform(action)
                did(["id": id, "ok": result.ok, "message": result.message], to: sender)
            }
        case "buddyHands":
            // What Spark is allowed to do right now, for the page to show (and to ask for access when you choose to).
            if body["ask"] as? Bool == true { SparkHands.askForAccess() }
            // `shortcuts list` can take a second or two: read it off the main thread so nothing stutters.
            let trusted = SparkHands.trusted
            DispatchQueue.global(qos: .utility).async {
                let names = SparkHands.shortcutNames()
                Task { @MainActor [weak self] in self?.send("shuacrew:hands", ["trusted": trusted, "shortcuts": names], to: sender) }
            }
        case "buddyDuck":
            let on = body["on"] as? Bool ?? false
            SparkHands.musicQueue.async { SparkHands.duck(on) }
        case "buddyHotkey":
            if let combo = body["combo"] as? String { onHotkey?(combo) }
        case "buddyStopWatch":
            stopWatch.map(NSEvent.removeMonitor); stopWatch = nil
        case "buddyLive":
            let on = body["on"] as? Bool ?? false
            if !on { live.stop(); send("shuacrew:live", ["on": false], to: sender); break }
            guard ScreenAccess.granted() || ScreenAccess.request() else {
                send("shuacrew:live", ["on": false, "error": "Turn on ShuaCrew in System Settings → Privacy & Security → Screen & System Audio Recording, then try Live again."], to: sender); break
            }
            let screen = panel.screen ?? NSScreen.main ?? NSScreen.screens[0]
            live.onStop = { [weak self] error in self?.send("shuacrew:live", ["on": false, "error": error ?? ""], to: sender) }
            Task {
                do { try await live.start(on: screen, excluding: ownWindows); send("shuacrew:live", ["on": true], to: sender) }
                catch { send("shuacrew:live", ["on": false, "error": "Couldn't start watching: \(error.localizedDescription)"], to: sender) }
            }
        case "buddyTeachPracticeStart", "buddyTeachPracticePause", "buddyTeachPracticeStatus", "buddyTeachPracticeCheck", "buddyTeachExport", "buddyTeachDisplays", "buddyTeachSelection", "buddyTeachDocument", "buddyTeachClear", "buddyTeachCapture", "buddyTeachOverlay":
            if let sender { teaching.handle(body, to: sender) }
        case "buddyCapture":
            let hires = body["hires"] as? Bool ?? false
            Task { await capture(to: sender, hires: hires) }
        case "buddyZoom":
            // A region of the last look at full resolution: tiny labels, icons and squares read exactly before a click.
            guard let full = lastFull, let x = body["x"] as? Double, let y = body["y"] as? Double, let w = body["w"] as? Double, let h = body["h"] as? Double, w > 0, h > 0 else { send("shuacrew:zoom", ["error": "Take a look at the screen first."], to: sender); break }
            let W = Double(full.width), H = Double(full.height)
            let rect = CGRect(x: max(0, x * W), y: max(0, y * H), width: min(W, w * W), height: min(H, h * H)).integral.intersection(CGRect(x: 0, y: 0, width: W, height: H))
            guard let crop = full.cropping(to: rect), let small = ScreenText.scaled(crop, longest: 1400) ?? Optional(crop),
                  let jpeg = NSBitmapImageRep(cgImage: small).representation(using: .jpeg, properties: [.compressionFactor: 0.85]) else { send("shuacrew:zoom", ["error": "Couldn't zoom there."], to: sender); break }
            send("shuacrew:zoom", ["data": jpeg.base64EncodedString(), "width": small.width, "height": small.height], to: sender)
        case "buddyGlance":
            // Proactive help: a quiet look at the live frame's TEXT only (no image leaves the Mac), so Spark can notice when
            // you're stuck. Only while you've turned on live watching, never on password managers or ShuaCrew itself.
            guard live.running, let frame = live.frame(), let front = NSWorkspace.shared.frontmostApplication,
                  front.bundleIdentifier != Bundle.main.bundleIdentifier, !SparkHands.offLimits.contains(front.bundleIdentifier ?? "") else { break }
            let app = front.localizedName ?? ""
            Task {
                let lines = await ScreenText.read(ScreenText.scaled(frame, longest: 1600) ?? frame, timeout: 3)
                let text = lines.compactMap { $0["t"] as? String }.joined(separator: "\n")
                self.send("shuacrew:glance", ["app": app, "text": String(text.prefix(5000))], to: sender)
            }
        case "buddyScreenAccess":
            send("shuacrew:screenAccess", ["granted": ScreenAccess.handle(body)], to: sender)
        case "buddyPoint":
            guard let x = body["x"] as? Double, let y = body["y"] as? Double, (0...1).contains(x), (0...1).contains(y),
                  let screen = shotScreen ?? panel.screen ?? NSScreen.main else { return }
            pointer.show(on: screen, x: x, y: y, label: String((body["label"] as? String ?? "").prefix(60)), color: body["color"] as? String, from: launchPoint())
        case "buddyGuide":
            guideTarget = sender
            guard let x = body["x"] as? Double, let y = body["y"] as? Double, let w = body["w"] as? Double, let h = body["h"] as? Double,
                  [x, y, w, h].allSatisfy({ (0...1).contains($0) }), let screen = shotScreen ?? panel.screen ?? NSScreen.main else { return }
            watchGuideActivity(true)
            pointer.guide(on: screen, x: x, y: y, w: w, h: h, label: String((body["label"] as? String ?? "").prefix(60)), step: body["step"] as? Int ?? 1,
                          color: body["color"] as? String, from: launchPoint(), waitForClick: body["wait"] as? Bool ?? true,
                          shape: body["shape"] as? String, exact: body["exact"] as? Bool ?? false)
            // The cursor flies first; then Spark walks over to stand beside the step.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in self?.walk(beside: x, y, w, h, on: screen) }
        case "saveFile":
            // Diagrams you export: always through your own Save panel; the page never picks the path.
            guard let text = body["text"] as? String, text.utf8.count <= 5_000_000 else { return }
            let save = NSSavePanel()
            save.nameFieldStringValue = String(((body["name"] as? String) ?? "diagram.svg").replacingOccurrences(of: "/", with: "-").prefix(120))
            save.canCreateDirectories = true
            save.directoryURL = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first
            NSApp.activate()
            save.begin { response in
                guard response == .OK, let url = save.url else { return }
                try? text.write(to: url, atomically: true, encoding: .utf8)
            }
        case "buddyDraw":
            guard let shapes = body["shapes"] as? [[String: Any]], let screen = shotScreen ?? panel.screen ?? NSScreen.main else { return }
            pointer.draw(on: screen, shapes: shapes, color: body["color"] as? String, from: launchPoint())
        case "buddySpeaking":
            pointer.speaking = body["on"] as? Bool ?? false
        case "buddyAudio":
            // The mic frames the page already captures, streamed here for live on-device transcription.
            guard sender === web, let turn = body["turn"] as? Int else { return }
            switch body["op"] as? String {
            case "begin":
                liveSpeech.onText = { [weak self] t, text in self?.send("shuacrew:speech", ["turn": t, "text": text], to: sender) }
                liveSpeech.begin(turn: turn, rate: body["rate"] as? Double ?? 48_000, names: body["names"] as? [String] ?? [])
                send("shuacrew:speech", ["turn": turn, "ready": liveSpeech.ready], to: sender)
            case "chunk":
                if let b64 = body["pcm"] as? String, let data = Data(base64Encoded: b64) { liveSpeech.push(turn: turn, pcm: data) }
            case "end":
                Task { @MainActor [weak self] in
                    guard let self else { return }
                    let r = await self.liveSpeech.end(turn: turn)
                    self.send("shuacrew:speech", ["turn": turn, "final": true, "text": r?.text ?? "", "confidence": r?.confidence ?? 0, "ms": r?.ms ?? -1], to: sender)
                }
            case "cancel": liveSpeech.cancel(turn: turn)
            case "verdict":
                var entry: [String: Any] = [:]
                for k in ["apple", "confidence", "whisper", "used", "ms"] { if let v = body[k] { entry[k] = v } }
                LiveTranscriber.log(entry)
            default: break
            }
        case "buddyState":
            // What Spark is doing, shown by the buddy beside your pointer (listening / thinking / speaking / idle).
            if let c = body["color"] as? String { cursorBuddy.color = PointerOverlay.color(c) }
            cursorBuddy.set(CursorBuddy.State(rawValue: body["state"] as? String ?? "") ?? .idle)
        case "buddyGuideStop":
            pointer.hide()
            walkHome()
            watchGuideActivity(false)
        case "buddyOnTop":
            let on = body["on"] as? Bool ?? false
            staysOnTop = on
            panel.level = on || docked ? .floating : .normal
            if on { raise() }
        case "buddyRaise":
            raise()
        case "buddyFnKey":
            if let on = body["on"] as? Bool { fnEnabled = on; UserDefaults.standard.set(on, forKey: "buddyFnKey"); startFnKey() }
            // 0 = Do Nothing; 1 input source, 2 emoji, 3 dictation — those also fire when fn is pressed.
            send("shuacrew:fnKey", ["on": fnEnabled, "globe": globeKeyUse(), "trusted": SparkHands.trusted], to: sender)
        case "buddyIsland":
            // The page measured its open island: keep the hover area matched to what you actually see.
            if let f = body["flare"] as? Double { islandFlare = CGFloat(f) }
            if let d = body["drop"] as? Double { islandDrop = CGFloat(d) }
        case "buddyNowPlaying":
            // The notch asks what Music or Spotify is playing (only while it shows media).
            SparkHands.musicQueue.async {
                nonisolated(unsafe) let now = SparkHands.nowPlaying() ?? ["title": ""]
                Task { @MainActor [weak self] in self?.send("shuacrew:media", now, to: sender) }
            }
        case "buddyAgenda":
            // Spark checks what's coming up (every minute), to give you a heads-up before it starts.
            DispatchQueue.global(qos: .utility).async {
                nonisolated(unsafe) let agenda = MacKnowledge.agenda()
                Task { @MainActor [weak self] in self?.send("shuacrew:agenda", agenda, to: sender) }
            }
        case "buddyNookFocus":
            // You clicked into the nook's Ask box: let it take the keyboard so you can type.
            NSApp.activate(); panel.makeKey()
        case "buddyFollow":
            following = body["on"] as? Bool ?? true
            UserDefaults.standard.set(following, forKey: "buddyFollowCursor")
            updateFollow(); updateCursorBuddy()
        case "buddyWake":
            if let names = body["names"] as? [String] { wake.names = Array(Set(["spark"] + names.map { $0.lowercased() }.filter { !$0.isEmpty })) }
            let reply = { [weak self] (error: String?) in
                guard let self else { return }
                var info: [String: Any] = ["on": self.wake.enabled && self.wake.running]
                if let error { info["error"] = error }
                self.send("shuacrew:wakeWord", info, to: sender)
            }
            if let on = body["on"] as? Bool { wake.set(on, completion: reply) }
            else { if wake.enabled && !wake.running { reply(wake.start()) } else { reply(nil) } }
        case "buddyScreenMemory":
            if let on = body["on"] as? Bool { memory.set(on); if on { Task { await memory.tick() } } }
            send("shuacrew:screenMemory", ["on": memory.enabled, "access": ScreenAccess.granted()], to: sender)
        case "buddyCalendar":
            let reply = { [weak self] in self?.send("shuacrew:calendar", ["authorized": DayCalendar.authorized, "events": DayCalendar.today()], to: sender) }
            if body["ask"] as? Bool == true && !DayCalendar.authorized { DayCalendar.request { _ in reply() } } else { reply() }
        case "buddySelection":
            if let sel = Selection.read() { send("shuacrew:selection", ["text": sel.text, "app": sel.app], to: sender) }
            else { send("shuacrew:selection", ["text": "", "app": NSWorkspace.shared.frontmostApplication?.localizedName ?? ""], to: sender) }
        case "buddyOpen":
            if let run = body["run"] as? String, run.range(of: "^[A-Za-z0-9_-]{1,80}$", options: .regularExpression) != nil { onOpen?("/sessions/\(run)") }
            else if let path = body["path"] as? String, path.range(of: "^/[A-Za-z0-9/_-]{0,120}$", options: .regularExpression) != nil { onOpen?(path) }
        case "buddySelfTest":
            let line = "SPARK SELFTEST ok=\(body["ok"] as? Bool ?? false) message=\(body["message"] as? String ?? "")\n\(body["output"] as? String ?? "")\n"
            Self.appendSelfTest(line)
        case "notify":
            guard let title = body["title"] as? String else { return }
            NativeBanner.post(title: title, body: (body["body"] as? String) ?? "")
        case "location":
            location.request { [weak self] result in
                let detail: String
                switch result {
                case .success(let c): detail = "{\"lat\": \((c.latitude * 100).rounded() / 100), \"lon\": \((c.longitude * 100).rounded() / 100)}"
                case .failure: detail = "{\"error\": \"Location unavailable\"}"
                }
                self?.web.evaluateJavaScript("window.dispatchEvent(new CustomEvent('shuacrew:location', { detail: \(detail) }))")
            }
        default:
            break
        }
    }

    /// Where the character is on screen: the comet starts here.
    private var sparkCenter: NSPoint { NSPoint(x: panel.frame.maxX - closed.width / 2, y: panel.frame.minY + closed.height / 2) }

    /// Esc, from any app, stops Spark mid-task. Armed while it's using your mouse and keyboard.
    private var stopWatch: Any?
    /// The web view that started the current guided walkthrough.
    private var guideTarget: WKWebView?
    /// Staying with you: while a step is showing, any action of yours (a click anywhere, Return, a pause after typing)
    /// makes Spark look again and give the next step — not only a click on the exact highlighted spot.
    private var guideMonitors: [Any] = []
    private var guideSettle: DispatchWorkItem?
    private func watchGuideActivity(_ on: Bool) {
        for m in guideMonitors { NSEvent.removeMonitor(m) }
        guideMonitors = []; guideSettle?.cancel(); guideSettle = nil
        guard on else { return }
        let seen: @Sendable (NSEvent) -> Void = { [weak self] event in
            let click = event.type == .leftMouseUp, key = event.type == .keyDown ? event.keyCode : 0
            Task { @MainActor in
                guard let self else { return }
                // Return / Enter / Tab settle quickly; other keys wait for you to stop typing.
                let delay = click ? 1.2 : [36, 76, 48].contains(key) ? 1.2 : 2.0
                self.guideSettle?.cancel()
                let work = DispatchWorkItem { [weak self] in
                    (self?.guideTarget ?? self?.web)?.evaluateJavaScript("window.dispatchEvent(new Event('shuacrew:guideActivity'))")
                }
                self.guideSettle = work
                DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
            }
        }
        if let m = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseUp, .keyDown], handler: seen) { guideMonitors.append(m) }
    }
    /// The app window's web view: Esc-stops go to both places Spark can be working from.
    weak var appWeb: WKWebView?
    private func watchForStop() {
        guard stopWatch == nil else { return }
        stopWatch = NSEvent.addGlobalMonitorForEvents(matching: .keyDown) { [weak self] e in
            guard e.keyCode == 53 else { return }
            Task { @MainActor in
                for w in [self?.web, self?.appWeb].compactMap({ $0 }) { w.evaluateJavaScript("window.dispatchEvent(new Event('shuacrew:actStop'))") }
                self?.stopWatch.map(NSEvent.removeMonitor); self?.stopWatch = nil
            }
        }
    }

    private func did(_ detail: [String: Any], to target: WKWebView? = nil) {
        guard let data = try? JSONSerialization.data(withJSONObject: detail), let json = String(data: data, encoding: .utf8) else { return }
        (target ?? web).evaluateJavaScript("window.dispatchEvent(new CustomEvent('shuacrew:did', { detail: \(json) }))")
    }

    private func reply(_ detail: [String: Any], to target: WKWebView? = nil) {
        guard let data = try? JSONSerialization.data(withJSONObject: detail), let json = String(data: data, encoding: .utf8) else { return }
        (target ?? web).evaluateJavaScript("window.dispatchEvent(new CustomEvent('shuacrew:capture', { detail: \(json) }))")
    }

    // MARK: looking at the screen

    func reportScreenAccess() {
        send("shuacrew:screenAccess", ["granted": ScreenAccess.granted()])
    }

    private func send(_ name: String, _ detail: [String: Any], to target: WKWebView? = nil) {
        guard let data = try? JSONSerialization.data(withJSONObject: detail), let json = String(data: data, encoding: .utf8) else { return }
        (target ?? web).evaluateJavaScript("window.dispatchEvent(new CustomEvent('\(name)', { detail: \(json) }))")
    }

    /// One screenshot of the display Spark is on, only when you ask, with Spark itself left out.
    /// The last full-resolution look, for zooming into part of it.
    private var lastFull: CGImage?
    private func capture(to target: WKWebView? = nil, hires: Bool = false) async {
        if !ScreenAccess.granted() {
            guard ScreenAccess.request() else {
                reply(["error": "Let ShuaCrew see your screen: System Settings → Privacy & Security → Screen & System Audio Recording, turn on ShuaCrew, then quit ShuaCrew once and ask again. (Or tap the eye to ask without the screen.)", "needsScreen": true], to: target)
                return
            }
        }
        do {
            let screen = panel.screen ?? NSScreen.main ?? NSScreen.screens[0]
            let number = (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value
            let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
            guard let display = content.displays.first(where: { $0.displayID == number }) ?? content.displays.first else {
                reply(["error": "No display to look at."], to: target); return
            }
            let own = Set(ownWindows.map { CGWindowID($0) }), mine = content.windows.filter { own.contains($0.windowID) }
            let filter = SCContentFilter(display: display, excludingWindows: mine)
            // Full Retina resolution for reading text exactly; the model's copy is scaled down afterwards.
            let config = SCStreamConfiguration()
            config.width = Int(Double(display.width) * screen.backingScaleFactor)
            config.height = Int(Double(display.height) * screen.backingScaleFactor)
            config.showsCursor = true
            // Live: the stream's newest frame is already here — no capture wait.
            let full: CGImage
            if let frame = live.frame(), live.screen == screen { full = frame } else { full = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config) }
            var context = ScreenElements.read(on: screen)
            // A browser in front: the page's own controls, exact, ahead of the rest (macOS can't see inside the page).
            if let app = SparkHands.target, ShuaWeb.supports(app), let web = await ShuaWeb.snapshot(of: app, on: screen) {
                context["elements"] = web.elements + (context["elements"] as? [[String: Any]] ?? [])
                context["page"] = web.page
            }
            // 2800px reads every line a full 5K frame does, in ~0.2s instead of ~60s (measured on this Mac).
            async let text = ScreenText.read(ScreenText.scaled(full, longest: 2800) ?? full, timeout: 5)
            // The model points in pixels of the image it sees, so it must see exactly this image: under the API's limits or
            // it's shrunk again server-side and every coordinate drifts. Older models: 1568 px long edge AND ~1.15 MP.
            // Opus/Sonnet 5.5 and newer (`hires`): 2576 px and 4784 visual tokens (28 px tiles) — about 1.5× sharper.
            lastFull = full
            let long = Double(max(full.width, full.height))
            let fit = hires ? min(2576 / long, sqrt(4600 * 784 / Double(full.width * full.height))) : min(1568 / long, sqrt(1_150_000 / Double(full.width * full.height)))
            guard let small = ScreenText.scaled(full, longest: Int((long * min(1, fit)).rounded(.down))),
                  let jpeg = NSBitmapImageRep(cgImage: small).representation(using: .jpeg, properties: [.compressionFactor: 0.8]) else {
                reply(["error": "Couldn't encode the screenshot."], to: target); return
            }
            shotScreen = screen
            reply(["data": jpeg.base64EncodedString(), "width": small.width, "height": small.height, "text": await text, "context": context, "live": live.running], to: target)
        } catch {
            reply(["error": "Couldn't capture the screen: \(error.localizedDescription)"], to: target)
        }
    }

    // MARK: web view

    /// Hold-to-talk uses the mic on our own page only (macOS still asks you once).
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping @MainActor (WKPermissionDecision) -> Void) {
        let ours = origin.host == gateway.base.host && origin.port == (gateway.base.port ?? 80)
        decisionHandler(ours && type == .microphone ? .grant : .deny)
    }

    /// Links in answers open in your browser; the panel never navigates away from Spark.
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if url.host == gateway.base.host && url.port == gateway.base.port && url.path == "/buddy" || url.scheme == "about" { decisionHandler(.allow); return }
        if action.navigationType == .linkActivated, ["http", "https"].contains(url.scheme) { NSWorkspace.shared.open(url) }
        decisionHandler(.cancel)
    }

    /// SHUACREW_SPARK_SELFTEST="open_app:Activity Monitor" at launch runs one action through the real page → app → page path and logs the result.
    /// Only whoever launches the app can set it; web pages can't.
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard let spec = ProcessInfo.processInfo.environment["SHUACREW_SPARK_SELFTEST"] else { return }
        if spec.hasPrefix("{") { // any action as JSON, through the real page → app → page path
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
                self?.web.evaluateJavaScript("window.buddy.perform(\(spec)).then(r => window.webkit.messageHandlers.shuacrew.postMessage({ type: 'buddySelfTest', ok: r.ok, message: r.message }))")
            }
            return
        }
        if spec.hasPrefix("voiceturn:") { // recordings through the page's real voice turn path (streamed live → sure? → else Whisper)
            let clips: [[String: Any]] = spec.dropFirst(10).split(separator: ",").compactMap { raw in
                let path = String(raw)
                guard let file = try? AVAudioFile(forReading: URL(fileURLWithPath: path)),
                      let buf = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length)), (try? file.read(into: buf)) != nil,
                      let floats = buf.floatChannelData?[0] else { return nil }
                let data = Data(bytes: floats, count: Int(buf.frameLength) * 4)
                return ["pcm": data.base64EncodedString(), "rate": file.processingFormat.sampleRate, "name": (path as NSString).lastPathComponent]
            }
            guard let json = try? JSONSerialization.data(withJSONObject: clips), let arg = String(data: json, encoding: .utf8) else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 4) { [weak self] in self?.web.evaluateJavaScript("window.buddy.selfTestVoice(\(arg))") }
            return
        }
        if spec == "buddy:shot" { // the cursor buddy in each state, captured (with the buddy in it) to ~/.shuacrew/selftest-buddy-<state>.png
            Task { @MainActor [weak self] in
                guard let self else { return }
                try? await Task.sleep(for: .seconds(2))
                for state in [CursorBuddy.State.idle, .listening, .thinking, .speaking] {
                    self.cursorBuddy.set(state)
                    try? await Task.sleep(for: .milliseconds(600))
                    let saved = await self.cursorBuddy.snapshot(to: NSHomeDirectory() + "/.shuacrew/selftest-buddy-\(state.rawValue).png")
                    _ = self.cursorBuddy.preview(to: NSHomeDirectory() + "/.shuacrew/selftest-buddy-\(state.rawValue)-contrast.png")
                    Self.appendSelfTest("SPARK SELFTEST buddy state=\(state.rawValue) saved=\(saved) active=\(self.cursorBuddy.active)\n")
                }
                self.cursorBuddy.set(.idle)
            }
            return
        }
        if spec.hasPrefix("speech:") { // a recording through the live on-device recognizer, in real time, as the mic would
            let path = String(spec.dropFirst(7))
            Task { @MainActor [weak self] in
                guard let self else { return }
                let log = { (line: String) in try? (line + "\n").write(toFile: NSHomeDirectory() + "/.shuacrew/spark-selftest.log", atomically: true, encoding: .utf8) }
                for _ in 0..<60 where !self.liveSpeech.ready { try? await Task.sleep(for: .milliseconds(500)) }
                guard self.liveSpeech.ready, let file = try? AVAudioFile(forReading: URL(fileURLWithPath: path)),
                      let buf = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length)), (try? file.read(into: buf)) != nil,
                      let floats = buf.floatChannelData?[0] else { log("SPARK SELFTEST speech ready=\(self.liveSpeech.ready) could not read \(path)"); return }
                let rate = file.processingFormat.sampleRate, n = Int(buf.frameLength), chunk = Int(rate / 10)
                var heard = ""
                self.liveSpeech.onText = { _, text in heard = text }
                self.liveSpeech.begin(turn: 1, rate: rate, names: [])
                var at = 0
                while at < n {
                    let m = min(chunk, n - at)
                    var pcm = Data(count: m * 2)
                    pcm.withUnsafeMutableBytes { raw in let out = raw.bindMemory(to: Int16.self); for i in 0..<m { out[i] = Int16(max(-1, min(1, floats[at + i])) * 32767).littleEndian } }
                    self.liveSpeech.push(turn: 1, pcm: pcm); at += m
                    try? await Task.sleep(for: .milliseconds(100))
                }
                let r = await self.liveSpeech.end(turn: 1)
                log("SPARK SELFTEST speech ready=true live=\"\(heard)\" final=\"\(r?.text ?? "")\" confidence=\(String(format: "%.2f", r?.confidence ?? 0)) finalMs=\(r?.ms ?? -1)")
            }
            return
        }
        if spec.hasPrefix("wake:") { // what happens when "Hey Spark" is heard: open, answer, listen for one request
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
                self?.wake.onWake?()
                DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
                    guard let self else { return }
                    self.web.evaluateJavaScript("JSON.stringify({ open: !!document.querySelector('.buddy-card'), label: document.querySelector('.spk-voicebar-label')?.innerText ?? null, said: [...document.querySelectorAll('.buddy-msg')].slice(-1).map(e => e.innerText) })") { result, _ in
                        let line = "WAKE panelOpen=\(self.isOpen) page=\(result as? String ?? "?")\n"
                        try? line.write(toFile: NSHomeDirectory() + "/.shuacrew/spark-selftest.log", atomically: true, encoding: .utf8)
                    }
                }
            }
            return
        }
        if spec.hasPrefix("walk:") { // a guide step at a fixed spot: Spark should walk beside it, then go home when it ends
            let log = { (label: String) in
                let f = self.panel.frame, line = "\(label) x=\(Int(f.minX)) y=\(Int(f.minY)) w=\(Int(f.width)) h=\(Int(f.height)) level=\(self.panel.level.rawValue)\n"
                if let h = FileHandle(forWritingAtPath: NSHomeDirectory() + "/.shuacrew/spark-selftest.log") { h.seekToEndOfFile(); h.write(Data(line.utf8)); h.closeFile() }
            }
            try? "".write(toFile: NSHomeDirectory() + "/.shuacrew/spark-selftest.log", atomically: true, encoding: .utf8)
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
                log("before")
                self?.web.evaluateJavaScript("window.webkit.messageHandlers.shuacrew.postMessage({ type: 'buddyGuide', x: 0.3, y: 0.3, w: 0.12, h: 0.06, label: 'Click here', step: 1, wait: false })")
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
                    log("guiding")
                    self?.web.evaluateJavaScript("window.webkit.messageHandlers.shuacrew.postMessage({ type: 'buddyGuideStop' })")
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { log("after") }
                }
            }
            return
        }
        guard let colon = spec.firstIndex(of: ":") else { return }
        let action = ["type": String(spec[..<colon]), "name": String(spec[spec.index(after: colon)...]), "url": String(spec[spec.index(after: colon)...]), "path": String(spec[spec.index(after: colon)...])]
        guard let data = try? JSONSerialization.data(withJSONObject: action), let json = String(data: data, encoding: .utf8) else { return }
        if spec.hasPrefix("elements:") { // what Spark's screen scan finds in the menu bar, written to spark-selftest.log
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                guard let screen = NSScreen.main else { return }
                let els = (ScreenElements.read(on: screen)["elements"] as? [[String: Any]] ?? []).filter { $0["role"] as? String == "menuextra" }
                let lines = els.map { "\($0["name"] ?? "?") @ x=\($0["x"] ?? "?") y=\($0["y"] ?? "?") w=\($0["w"] ?? "?")" }.joined(separator: "\n")
                try? (lines + "\n").write(toFile: NSHomeDirectory() + "/.shuacrew/spark-selftest.log", atomically: true, encoding: .utf8)
            }
            return
        }
        if spec.hasPrefix("marks:") { // every mark in Spark's visual language at once, to check the overlay
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
                self?.web.evaluateJavaScript("window.webkit.messageHandlers.shuacrew.postMessage({ type: 'buddyDraw', color: '#a78bfa', shapes: [{ shape: 'spotlight', x: 0.3, y: 0.3, w: 0.2, h: 0.12, label: 'look here' }, { shape: 'highlight', x: 0.7, y: 0.2, w: 0.16, h: 0.03 }, { shape: 'underline', x: 0.7, y: 0.28, w: 0.16, h: 0.03, label: 'typo' }, { shape: 'step', n: 1, x: 0.15, y: 0.62, label: 'Open settings' }, { shape: 'step', n: 2, x: 0.3, y: 0.7, label: 'Pick a size' }, { shape: 'path', points: [[0.5, 0.55], [0.6, 0.75], [0.8, 0.6]], label: 'data flows here' }, { shape: 'card', x: 0.8, y: 0.42, title: 'Why this matters', body: 'This total feeds the invoice, so a wrong cell here bills the client wrong.', items: ['Check row 14', 'Re-run the sum'] }, { shape: 'check', x: 0.55, y: 0.9, label: 'correct' }, { shape: 'cross', x: 0.65, y: 0.9, label: 'wrong' }] })")
            }
            return
        }
        if spec.hasPrefix("draw:") { // sketch a sample annotation, to check on-screen drawing
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
                self?.web.evaluateJavaScript("window.webkit.messageHandlers.shuacrew.postMessage({ type: 'buddyDraw', color: '#34d399', shapes: [{ shape: 'box', x: 0.5, y: 0.35, w: 0.3, h: 0.12, label: 'this total looks off' }, { shape: 'arrow', from: [0.25, 0.7], to: [0.38, 0.42], label: 'it comes from here' }, { shape: 'circle', x: 0.75, y: 0.62, r: 0.04 }, { shape: 'text', x: 0.5, y: 0.86, text: \(String(reflecting: String(spec.dropFirst(5)))) }] })")
            }
            return
        }
        if spec.hasPrefix("guide:") { // draw one guide step, to check the spotlight
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
                self?.web.evaluateJavaScript("window.webkit.messageHandlers.shuacrew.postMessage({ type: 'buddyGuide', x: 0.5, y: 0.45, w: 0.16, h: 0.06, label: \(String(reflecting: String(spec.dropFirst(6)))), step: 2, color: '#a78bfa', wait: true })")
            }
            return
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            self?.web.evaluateJavaScript("window.buddy.perform(\(json)).then(r => window.webkit.messageHandlers.shuacrew.postMessage({ type: 'buddySelfTest', ok: r.ok, message: r.message }))")
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { retryLoad() }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { retryLoad() }
    /// The gateway may still be starting (or restarting); try again shortly.
    private func retryLoad() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
            guard let self, Self.enabled else { return }
            self.web.load(URLRequest(url: URL(string: "/buddy", relativeTo: self.gateway.base)!))
        }
    }
}

/// Lets exactly one of several racing callbacks through.
final class Once: @unchecked Sendable {
    private let lock = NSLock()
    private var done = false
    func claim() -> Bool { lock.lock(); defer { lock.unlock() }; if done { return false }; done = true; return true }
}

/// On-device text recognition (Apple Vision) over the full-resolution screenshot: exact words and numbers with
/// where they are, so Spark reads tables, code and dashboards precisely instead of squinting at a scaled image.
enum ScreenText {
    static func read(_ image: CGImage, timeout: Double = 5) async -> [[String: Any]] {
        await withCheckedContinuation { done in
            // Whichever comes first: the text, or the deadline (then Spark still gets the screenshot).
            let once = Once()
            DispatchQueue.global().asyncAfter(deadline: .now() + timeout) { if once.claim() { done.resume(returning: []) } }
            DispatchQueue.global(qos: .userInitiated).async {
                let request = VNRecognizeTextRequest()
                request.recognitionLevel = .accurate
                request.usesLanguageCorrection = false // code, numbers and identifiers stay exactly as shown
                try? VNImageRequestHandler(cgImage: image).perform([request])
                let lines: [[String: Any]] = (request.results ?? []).prefix(600).compactMap { o in
                    guard let t = o.topCandidates(1).first, t.confidence > 0.3 else { return nil }
                    let b = o.boundingBox // normalised, origin bottom-left
                    let r = { (v: CGFloat) in (Double(v) * 1000).rounded() / 1000 }
                    return ["t": t.string, "x": r(b.midX), "y": r(1 - b.midY), "w": r(b.width), "h": r(b.height)]
                }
                if once.claim() { done.resume(returning: lines) }
            }
        }
    }

    static func scaled(_ image: CGImage, longest: Int) -> CGImage? {
        let scale = min(1, Double(longest) / Double(max(image.width, image.height)))
        if scale >= 1 { return image }
        let w = Int(Double(image.width) * scale), h = Int(Double(image.height) * scale)
        guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return nil }
        ctx.interpolationQuality = .high
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
        return ctx.makeImage()
    }
}

/// Borderless panels can't normally take keyboard focus; this one can, so you can type your question.
final class BuddyPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
    /// In notch mode the island and its chat must sit flush with the top of the screen, over the camera housing.
    /// macOS normally pushes windows below the menu bar, which drew a second "notch" one notch-height too low.
    var flushTop = false
    override func constrainFrameRect(_ frameRect: NSRect, to screen: NSScreen?) -> NSRect {
        flushTop ? frameRect : super.constrainFrameRect(frameRect, to: screen)
    }
}

/// Over the character: a click opens or closes the card, a drag moves Spark anywhere.
final class BuddyGrip: NSView {
    var onClick: (() -> Void)?
    var onMoved: (() -> Void)?
    private var down: NSPoint?
    private var dragged = false

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    override func resetCursorRects() { addCursorRect(bounds, cursor: .pointingHand) }
    override func mouseDown(with event: NSEvent) { down = event.locationInWindow; dragged = false }
    override func mouseDragged(with event: NSEvent) {
        guard let down, !dragged, hypot(event.locationInWindow.x - down.x, event.locationInWindow.y - down.y) > 3 else { return }
        dragged = true
        window?.performDrag(with: event)
        onMoved?()
    }
    override func mouseUp(with event: NSEvent) {
        if !dragged { onClick?() }
        down = nil
    }
}

/// Spark showing you something on screen. Two ways:
/// - point: a pulsing ring and a label, gone in a few seconds;
/// - guide: one step of a walkthrough — the screen dims around a spotlight on exactly what to use,
///   a numbered instruction beside it, and it waits for you to click there (then Spark plans the next step).
/// Either way a little comet flies from Spark to the spot first, and nothing here ever takes a click from you.
@MainActor
final class PointerOverlay {
    private var panel: NSPanel?
    private var hideWork: DispatchWorkItem?
    private var monitors: [Any] = []
    /// Spark talking right now (from the page): what it's pointing at or drawing stays until it has finished explaining.
    var speaking = false { didSet { if oldValue && !speaking { quietSince = Date() } } }
    private var quietSince: Date?
    /// Stay at least `seconds`; then, while Spark is still talking about it (or went quiet under 4 s ago), keep it up.
    private func hideWhenDone(after seconds: Double) {
        hideWork?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            if self.speaking || (self.quietSince.map { Date().timeIntervalSince($0) < 4 } ?? false) { self.hideWhenDone(after: 1); return }
            self.fadeOut()
        }
        hideWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: work)
    }
    /// The spotlighted area in global screen coordinates, while a guide step waits for your click.
    private var target: NSRect?
    var onGuideClick: (() -> Void)?
    /// Clickable marks: each label or card gets its own tiny window that takes the click (the drawing itself never does).
    var onMarkClick: ((String) -> Void)?
    private var catchers: [NSPanel] = []

    static func color(_ hex: String?) -> NSColor {
        guard let hex, hex.count == 7, hex.hasPrefix("#"), let v = UInt32(hex.dropFirst(), radix: 16) else { return NSColor(srgbRed: 0.96, green: 0.71, blue: 0.27, alpha: 1) }
        return NSColor(srgbRed: CGFloat(v >> 16 & 0xff) / 255, green: CGFloat(v >> 8 & 0xff) / 255, blue: CGFloat(v & 0xff) / 255, alpha: 1)
    }

    private func makePanel(_ frame: NSRect) -> (NSPanel, NSView) {
        let panel = NSPanel(contentRect: frame, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.level = .popUpMenu
        // Panels hide when their app isn't frontmost — and ShuaCrew almost never is while Spark shows you something.
        panel.hidesOnDeactivate = false
        panel.ignoresMouseEvents = true
        panel.backgroundColor = .clear
        panel.isOpaque = false
        panel.hasShadow = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        panel.isReleasedWhenClosed = false
        let root = NSView(frame: NSRect(origin: .zero, size: frame.size))
        root.wantsLayer = true
        panel.contentView = root
        return (panel, root)
    }

    /// Spark's cursor: a real arrow that glides from Spark to the spot on a natural arc, presses, and ripples.
    /// Returns how long the flight takes, so what it points at appears as it lands.
    private func comet(in root: NSView, from: CGPoint?, to: CGPoint, color: NSColor) -> CFTimeInterval {
        guard let from, hypot(from.x - to.x, from.y - to.y) > 40 else { return 0 }
        let distance = hypot(from.x - to.x, from.y - to.y)
        let flight = min(0.95, max(0.5, Double(distance) / 1400)) // longer trips take a little longer, never sluggish
        // The arrow, tip at the origin (AppKit's y points up, so the body hangs below the tip).
        let arrow = CGMutablePath()
        arrow.move(to: .zero); arrow.addLine(to: CGPoint(x: 0, y: -21)); arrow.addLine(to: CGPoint(x: 5.2, y: -16))
        arrow.addLine(to: CGPoint(x: 9.2, y: -24.5)); arrow.addLine(to: CGPoint(x: 12.4, y: -23)); arrow.addLine(to: CGPoint(x: 8.5, y: -14.8))
        arrow.addLine(to: CGPoint(x: 15, y: -14.8)); arrow.closeSubpath()
        let cursor = CAShapeLayer()
        cursor.path = arrow
        cursor.fillColor = color.cgColor
        cursor.strokeColor = NSColor.white.cgColor
        cursor.lineWidth = 1.6
        cursor.lineJoin = .round
        cursor.shadowColor = NSColor.black.cgColor; cursor.shadowOpacity = 0.45; cursor.shadowRadius = 6; cursor.shadowOffset = CGSize(width: 0, height: -3)
        cursor.position = to
        root.layer?.addSublayer(cursor)

        // A gentle arc, bowing up-and-over like a hand moving a mouse.
        let path = CGMutablePath()
        path.move(to: from)
        let lift = min(180, distance * 0.28)
        path.addQuadCurve(to: to, control: CGPoint(x: (from.x + to.x) / 2 + (to.y - from.y) * 0.12, y: max(from.y, to.y) + lift))
        let move = CAKeyframeAnimation(keyPath: "position")
        move.path = path
        move.duration = flight
        move.timingFunction = CAMediaTimingFunction(controlPoints: 0.25, 0.1, 0.1, 1) // quick start, soft landing
        let tilt = CAKeyframeAnimation(keyPath: "transform.rotation.z")
        tilt.values = [0.35, 0.12, 0]; tilt.keyTimes = [0, 0.6, 1]; tilt.duration = flight
        let appear = CABasicAnimation(keyPath: "opacity")
        appear.fromValue = 0; appear.toValue = 1; appear.duration = 0.12
        let fly = CAAnimationGroup()
        fly.animations = [move, tilt, appear]; fly.duration = flight
        cursor.add(fly, forKey: "fly")

        // The press: a small squash as it lands, then a ripple where it clicked.
        let press = CAKeyframeAnimation(keyPath: "transform.scale")
        press.values = [1, 0.82, 1]; press.keyTimes = [0, 0.4, 1]; press.duration = 0.22
        press.beginTime = CACurrentMediaTime() + flight
        cursor.add(press, forKey: "press")
        let ripple = CAShapeLayer()
        ripple.path = CGPath(ellipseIn: CGRect(x: -14, y: -14, width: 28, height: 28), transform: nil)
        ripple.position = to
        ripple.fillColor = color.withAlphaComponent(0.18).cgColor
        ripple.strokeColor = color.cgColor
        ripple.lineWidth = 2
        ripple.opacity = 0
        root.layer?.insertSublayer(ripple, below: cursor)
        let grow = CABasicAnimation(keyPath: "transform.scale"); grow.fromValue = 0.3; grow.toValue = 1.9
        let fade = CAKeyframeAnimation(keyPath: "opacity"); fade.values = [0, 0.9, 0]; fade.keyTimes = [0, 0.15, 1]
        let ring = CAAnimationGroup(); ring.animations = [grow, fade]; ring.duration = 0.6
        ring.beginTime = CACurrentMediaTime() + flight + 0.05
        ring.timingFunction = CAMediaTimingFunction(name: .easeOut)
        ripple.add(ring, forKey: "ripple")

        // The cursor rests a beat on the spot, then steps aside for what it's showing you.
        let leave = CABasicAnimation(keyPath: "opacity")
        leave.fromValue = 1; leave.toValue = 0; leave.duration = 0.35
        leave.beginTime = CACurrentMediaTime() + flight + 0.9
        leave.fillMode = .forwards; leave.isRemovedOnCompletion = false
        cursor.add(leave, forKey: "leave")
        return flight
    }

    private func pill(_ text: String, color: NSColor, badge: Int? = nil) -> NSView {
        let label = NSTextField(labelWithString: text)
        label.font = .systemFont(ofSize: 13.5, weight: .semibold)
        label.textColor = NSColor(srgbRed: 0.05, green: 0.05, blue: 0.06, alpha: 1)
        label.sizeToFit()
        var x: CGFloat = 12
        let pill = NSView()
        pill.wantsLayer = true
        if let badge {
            let circle = NSTextField(labelWithString: "\(badge)")
            circle.font = .systemFont(ofSize: 11.5, weight: .bold)
            circle.textColor = color
            circle.alignment = .center
            circle.wantsLayer = true
            circle.layer?.backgroundColor = NSColor(srgbRed: 0.05, green: 0.05, blue: 0.06, alpha: 0.9).cgColor
            circle.layer?.cornerRadius = 10
            circle.frame = NSRect(x: 6, y: 5, width: 20, height: 20)
            pill.addSubview(circle)
            x = 32
        }
        label.frame.origin = NSPoint(x: x, y: (30 - label.frame.height) / 2)
        pill.addSubview(label)
        pill.frame = NSRect(x: 0, y: 0, width: x + label.frame.width + 14, height: 30)
        pill.layer?.backgroundColor = color.cgColor
        pill.layer?.cornerRadius = 15
        pill.layer?.shadowOpacity = 0.45; pill.layer?.shadowRadius = 12; pill.layer?.shadowOffset = CGSize(width: 0, height: -3)
        return pill
    }

    /// Put `view` beside a spot, flipped inward near the screen's edges.
    private func place(_ view: NSView, near rect: CGRect, in size: CGSize) {
        var origin = NSPoint(x: rect.maxX + 14, y: rect.midY - view.frame.height / 2)
        if origin.x + view.frame.width > size.width - 8 { origin.x = rect.minX - 14 - view.frame.width }
        if origin.x < 8 { origin = NSPoint(x: rect.midX - view.frame.width / 2, y: rect.minY - view.frame.height - 12) }
        origin.x = min(max(origin.x, 8), size.width - view.frame.width - 8)
        origin.y = min(max(origin.y, 8), size.height - view.frame.height - 8)
        view.frame.origin = origin
    }

    private func present(_ panel: NSPanel, root: NSView, delay: CFTimeInterval, pieces: [NSView], layers: [CALayer]) {
        for p in pieces { p.alphaValue = 0; root.addSubview(p) }
        for l in layers { l.opacity = 0; root.layer?.addSublayer(l) }
        panel.orderFrontRegardless()
        self.panel = panel
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
            NSAnimationContext.runAnimationGroup { ctx in ctx.duration = 0.25; for p in pieces { p.animator().alphaValue = 1 } }
            CATransaction.begin(); CATransaction.setAnimationDuration(0.25); for l in layers { l.opacity = 1 }; CATransaction.commit()
        }
    }

    /// `from` is where Spark is, in global coordinates.
    @discardableResult
    func show(on screen: NSScreen, x: Double, y: Double, label: String, color hex: String? = nil, from: NSPoint? = nil) -> CFTimeInterval {
        hide()
        let frame = screen.frame, color = Self.color(hex)
        let (panel, root) = makePanel(frame)
        // Screenshot fractions are measured from the top-left; AppKit's origin is bottom-left.
        let point = CGPoint(x: x * frame.width, y: frame.height - y * frame.height)
        let delay = comet(in: root, from: from.map { CGPoint(x: $0.x - frame.minX, y: $0.y - frame.minY) }, to: point, color: color)
        var layers: [CALayer] = []
        for (i, d) in [0.0, 0.6].enumerated() {
            let ring = CAShapeLayer()
            ring.path = CGPath(ellipseIn: CGRect(x: -22, y: -22, width: 44, height: 44), transform: nil)
            ring.position = point
            ring.fillColor = NSColor.clear.cgColor
            ring.strokeColor = color.cgColor
            ring.lineWidth = 3
            ring.shadowColor = color.cgColor; ring.shadowRadius = 8; ring.shadowOpacity = 0.9; ring.shadowOffset = .zero
            let grow = CABasicAnimation(keyPath: "transform.scale")
            grow.fromValue = 2.4; grow.toValue = 1; grow.duration = 0.6
            grow.beginTime = CACurrentMediaTime() + delay + d
            grow.fillMode = .backwards
            ring.add(grow, forKey: "in")
            if i == 1 {
                let breathe = CABasicAnimation(keyPath: "transform.scale")
                breathe.fromValue = 1; breathe.toValue = 1.35; breathe.autoreverses = true; breathe.repeatCount = .infinity; breathe.duration = 0.8
                breathe.beginTime = CACurrentMediaTime() + delay + 1.2
                ring.add(breathe, forKey: "breathe")
            }
            layers.append(ring)
        }
        let dot = CALayer()
        dot.bounds = CGRect(x: 0, y: 0, width: 10, height: 10); dot.cornerRadius = 5; dot.position = point; dot.backgroundColor = color.cgColor
        layers.append(dot)
        var pieces: [NSView] = []
        if !label.isEmpty {
            let p = pill(label, color: color)
            place(p, near: CGRect(x: point.x - 22, y: point.y - 22, width: 44, height: 44), in: frame.size)
            pieces.append(p)
        }
        present(panel, root: root, delay: delay, pieces: pieces, layers: layers)
        hideWhenDone(after: delay + 6.5)
        return delay
    }

    /// One guided step: dim everything but the box, number it, say what to do, and wait for the click.
    /// The outline that hugs a thing in its own shape: a circle, a capsule, or a softly rounded box.
    static func outline(_ box: CGRect, shape: String?) -> CGPath {
        switch shape {
        case "circle":
            let side = max(box.width, box.height)
            return CGPath(ellipseIn: CGRect(x: box.midX - side / 2, y: box.midY - side / 2, width: side, height: side), transform: nil)
        case "pill":
            let r = min(box.height, box.width) / 2
            return CGPath(roundedRect: box, cornerWidth: r, cornerHeight: r, transform: nil)
        default:
            let r = min(8, min(box.height, box.width) / 2)
            return CGPath(roundedRect: box, cornerWidth: r, cornerHeight: r, transform: nil)
        }
    }

    func guide(on screen: NSScreen, x: Double, y: Double, w: Double, h: Double, label: String, step: Int, color hex: String? = nil, from: NSPoint? = nil, waitForClick: Bool, shape: String? = nil, exact: Bool = false) {
        hide()
        let frame = screen.frame, color = Self.color(hex)
        let (panel, root) = makePanel(frame)
        // Exact (snapped onto the real control): a snug 4 pt ring. A guess: a little more room.
        let pad: CGFloat = exact ? 4 : 8
        let box = Highlight.box(x: x, y: y, w: w, h: h, in: frame.size, pad: pad)
        let delay = comet(in: root, from: from.map { CGPoint(x: $0.x - frame.minX, y: $0.y - frame.minY) }, to: CGPoint(x: box.midX, y: box.midY), color: color)

        // The spotlight: a soft dim over the whole screen with the box cut out, so your eye lands on it.
        let dim = CAShapeLayer()
        let path = CGMutablePath()
        path.addRect(CGRect(origin: .zero, size: frame.size))
        path.addPath(Self.outline(box, shape: shape))
        dim.path = path
        dim.fillRule = .evenOdd
        dim.fillColor = NSColor.black.withAlphaComponent(0.32).cgColor
        let outline = CAShapeLayer()
        outline.path = Self.outline(box, shape: shape)
        outline.fillColor = NSColor.clear.cgColor
        outline.strokeColor = color.cgColor
        outline.lineWidth = 2.5
        outline.shadowColor = color.cgColor; outline.shadowRadius = 12; outline.shadowOpacity = 1; outline.shadowOffset = .zero
        let pulse = CABasicAnimation(keyPath: "lineWidth")
        pulse.fromValue = 2.5; pulse.toValue = 5; pulse.autoreverses = true; pulse.repeatCount = .infinity; pulse.duration = 0.9
        outline.add(pulse, forKey: "pulse")
        let p = pill(label.isEmpty ? "Here" : label, color: color, badge: step)
        place(p, near: box, in: frame.size)
        present(panel, root: root, delay: delay, pieces: [p], layers: [dim, outline])

        // Your click on the box moves the guide on. Clicks pass straight through to the app underneath.
        target = NSRect(x: frame.minX + box.minX, y: frame.minY + box.minY, width: box.width, height: box.height).insetBy(dx: -10, dy: -10)
        if waitForClick {
            let hit: (NSEvent) -> Void = { [weak self] _ in
                Task { @MainActor in
                    guard let self, let target = self.target, target.contains(NSEvent.mouseLocation) else { return }
                    self.target = nil
                    self.hide()
                    self.onGuideClick?()
                }
            }
            if let global = NSEvent.addGlobalMonitorForEvents(matching: .leftMouseDown, handler: hit) { monitors.append(global) }
            if let local = NSEvent.addLocalMonitorForEvents(matching: .leftMouseDown, handler: { hit($0); return $0 }) { monitors.append(local) }
        }
        // A step stays until you do it (or Spark moves on); only one left alone for 15 minutes fades.
        let work = DispatchWorkItem { [weak self] in self?.fadeOut() }
        hideWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 900, execute: work)
    }

    /// Spark sketching on your screen, one mark after another: boxes, circles, arrows and notes, plus a spotlight that
    /// dims everything else, marker highlights and underlines on text, numbered steps, a route across the screen,
    /// explainer cards, and ticks and crosses. Shapes use fractions of the screenshot (0–1, from the top-left), like
    /// everything else Spark shows you. `stay` (seconds) keeps them up longer, for a plan you're working through.
    func draw(on screen: NSScreen, shapes: [[String: Any]], color hex: String?, from: NSPoint?) {
        hide()
        let frame = screen.frame, color = Self.color(hex), W = frame.width, H = frame.height
        let (panel, root) = makePanel(frame)
        let pt = { (x: Double, y: Double) in CGPoint(x: x * W, y: H - y * H) }
        let num = { (d: [String: Any], k: String) -> Double? in (d[k] as? Double).flatMap { (0...1).contains($0) ? $0 : nil } }
        let good = NSColor(srgbRed: 0.2, green: 0.83, blue: 0.6, alpha: 1), bad = NSColor(srgbRed: 0.97, green: 0.44, blue: 0.44, alpha: 1)
        var layers: [CALayer] = [], labels: [(NSView, CGRect)] = [], firstSpot: CGPoint?, holes: [CGRect] = [], fills: [CALayer] = []
        var clickable: [ObjectIdentifier: String] = [:]
        var stay = 16.0
        for shape in shapes.prefix(16) {
            if let s = shape["stay"] as? Double { stay = max(stay, min(300, s)) }
            let path = CGMutablePath()
            var anchor = CGRect.zero, stroke = color, badge: Int?
            let box = { () -> CGRect? in
                guard let x = num(shape, "x"), let y = num(shape, "y"), let w = num(shape, "w"), let h = num(shape, "h") else { return nil }
                return Highlight.box(x: x, y: y, w: w, h: h, in: CGSize(width: W, height: H))
            }
            switch shape["shape"] as? String {
            case "spotlight":
                // Everything else dims; this stays bright, ringed in the accent.
                guard let r = box() else { continue }
                anchor = r.insetBy(dx: -10, dy: -10); holes.append(anchor)
                path.addRoundedRect(in: anchor, cornerWidth: 14, cornerHeight: 14)
            case "highlight":
                // A marker stroke over text: a soft fill, no outline.
                guard let r = box() else { continue }
                anchor = r.insetBy(dx: -3, dy: -2)
                let fill = CAShapeLayer()
                fill.path = CGPath(roundedRect: anchor, cornerWidth: 4, cornerHeight: 4, transform: nil)
                fill.fillColor = color.withAlphaComponent(0.3).cgColor
                fill.opacity = 0
                let show = CABasicAnimation(keyPath: "opacity"); show.fromValue = 0; show.toValue = 1; show.duration = 0.35
                show.beginTime = CACurrentMediaTime() + 0.5 + Double(layers.count + fills.count) * 0.25; show.fillMode = .forwards; show.isRemovedOnCompletion = false
                fill.add(show, forKey: "show"); fills.append(fill)
            case "underline":
                // A hand-drawn wave under a line of text.
                guard let r = box() else { continue }
                anchor = r
                let y0 = r.minY - 3, steps = max(4, Int(r.width / 14))
                path.move(to: CGPoint(x: r.minX, y: y0))
                for i in 1...steps {
                    let x = r.minX + r.width * CGFloat(i) / CGFloat(steps), mid = r.minX + r.width * (CGFloat(i) - 0.5) / CGFloat(steps)
                    path.addQuadCurve(to: CGPoint(x: x, y: y0), control: CGPoint(x: mid, y: y0 + (i % 2 == 0 ? 4 : -4)))
                }
            case "step", "check", "cross":
                guard let x = num(shape, "x"), let y = num(shape, "y") else { continue }
                let c = pt(x, y)
                if shape["shape"] as? String == "step" {
                    // A numbered marker; with w/h (a real control) it rings it too.
                    badge = (shape["n"] as? Double).map { Int($0) } ?? (shape["n"] as? Int) ?? 1
                    if let r = box() { anchor = r.insetBy(dx: -4, dy: -4); path.addRoundedRect(in: anchor, cornerWidth: 8, cornerHeight: 8) }
                    else { anchor = CGRect(x: c.x - 14, y: c.y - 14, width: 28, height: 28); path.addEllipse(in: anchor) }
                } else if shape["shape"] as? String == "check" {
                    stroke = good; anchor = CGRect(x: c.x - 14, y: c.y - 14, width: 28, height: 28)
                    path.move(to: CGPoint(x: c.x - 11, y: c.y + 1)); path.addLine(to: CGPoint(x: c.x - 3, y: c.y - 8)); path.addLine(to: CGPoint(x: c.x + 12, y: c.y + 11))
                } else {
                    stroke = bad; anchor = CGRect(x: c.x - 14, y: c.y - 14, width: 28, height: 28)
                    path.move(to: CGPoint(x: c.x - 10, y: c.y - 10)); path.addLine(to: CGPoint(x: c.x + 10, y: c.y + 10))
                    path.move(to: CGPoint(x: c.x + 10, y: c.y - 10)); path.addLine(to: CGPoint(x: c.x - 10, y: c.y + 10))
                }
            case "path":
                // A route across the screen (where data flows, the order to click things): a smooth line and an arrowhead.
                guard let raw = shape["points"] as? [[Double]] else { continue }
                let pts = raw.prefix(8).filter { $0.count == 2 && $0.allSatisfy { (0...1).contains($0) } }.map { pt($0[0], $0[1]) }
                guard pts.count >= 2 else { continue }
                path.move(to: pts[0])
                for i in 1..<pts.count {
                    if i == pts.count - 1 { path.addLine(to: pts[i]) }
                    else { path.addQuadCurve(to: CGPoint(x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2), control: pts[i]) }
                }
                let b = pts[pts.count - 1], a = pts[pts.count - 2], angle = atan2(b.y - a.y, b.x - a.x), len: CGFloat = 16
                path.move(to: CGPoint(x: b.x - len * cos(angle - 0.45), y: b.y - len * sin(angle - 0.45))); path.addLine(to: b)
                path.addLine(to: CGPoint(x: b.x - len * cos(angle + 0.45), y: b.y - len * sin(angle + 0.45)))
                anchor = CGRect(x: pts[0].x - 4, y: pts[0].y - 4, width: 8, height: 8)
            case "card":
                // An explainer pinned beside what it's about: a title, a line or two, a few points.
                guard let x = num(shape, "x"), let y = num(shape, "y") else { continue }
                anchor = box() ?? CGRect(origin: pt(x, y), size: CGSize(width: 1, height: 1))
                let items = (shape["items"] as? [String])?.prefix(4).map { String($0.prefix(80)) } ?? []
                let title = String((shape["title"] as? String ?? "").prefix(50)), body = String((shape["body"] as? String ?? "").prefix(220))
                let view = card(title: title, body: body, items: items, color: color)
                labels.append((view, anchor)); clickable[ObjectIdentifier(view)] = title.isEmpty ? body : title
                firstSpot = firstSpot ?? CGPoint(x: anchor.midX, y: anchor.midY)
                continue
            case "box":
                guard let x = num(shape, "x"), let y = num(shape, "y"), let w = num(shape, "w"), let h = num(shape, "h") else { continue }
                anchor = Highlight.box(x: x, y: y, w: w, h: h, in: CGSize(width: W, height: H))
                // Fitted to a real control: a snug ring in its shape. Otherwise the usual soft box.
                if let corner = shape["corner"] as? String { anchor = anchor.insetBy(dx: -4, dy: -4); path.addPath(Self.outline(anchor, shape: corner)) }
                else { path.addRoundedRect(in: anchor, cornerWidth: 8, cornerHeight: 8) }
            case "circle":
                guard let x = num(shape, "x"), let y = num(shape, "y"), let r = num(shape, "r") else { continue }
                let c = pt(x, y), rr = r * W
                anchor = CGRect(x: c.x - rr, y: c.y - rr, width: rr * 2, height: rr * 2)
                path.addEllipse(in: anchor.insetBy(dx: -2, dy: 3)) // a slightly hand-drawn oval
            case "arrow":
                guard let f = shape["from"] as? [Double], let t = shape["to"] as? [Double], f.count == 2, t.count == 2, (f + t).allSatisfy({ (0...1).contains($0) }) else { continue }
                let a = pt(f[0], f[1]), b = pt(t[0], t[1])
                let bend = CGPoint(x: (a.x + b.x) / 2 - (b.y - a.y) * 0.12, y: (a.y + b.y) / 2 + (b.x - a.x) * 0.12)
                path.move(to: a); path.addQuadCurve(to: b, control: bend)
                let angle = atan2(b.y - bend.y, b.x - bend.x), len: CGFloat = 16
                path.move(to: CGPoint(x: b.x - len * cos(angle - 0.45), y: b.y - len * sin(angle - 0.45))); path.addLine(to: b)
                path.addLine(to: CGPoint(x: b.x - len * cos(angle + 0.45), y: b.y - len * sin(angle + 0.45)))
                anchor = CGRect(x: a.x - 4, y: a.y - 4, width: 8, height: 8)
            case "text":
                guard let x = num(shape, "x"), let y = num(shape, "y") else { continue }
                anchor = CGRect(origin: pt(x, y), size: .zero)
            default: continue
            }
            firstSpot = firstSpot ?? CGPoint(x: anchor.midX, y: anchor.midY)
            if !path.isEmpty {
                let line = CAShapeLayer()
                line.path = path
                line.fillColor = NSColor.clear.cgColor
                line.strokeColor = stroke.cgColor
                line.lineWidth = 3.5
                line.lineCap = .round; line.lineJoin = .round
                line.shadowColor = stroke.cgColor; line.shadowRadius = 6; line.shadowOpacity = 0.8; line.shadowOffset = .zero
                let sketch = CABasicAnimation(keyPath: "strokeEnd")
                sketch.fromValue = 0; sketch.toValue = 1; sketch.duration = 0.55
                sketch.beginTime = CACurrentMediaTime() + 0.5 + Double(layers.count) * 0.35
                sketch.fillMode = .backwards
                sketch.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
                line.add(sketch, forKey: "sketch")
                layers.append(line)
            }
            if let text = (shape["label"] as? String ?? shape["text"] as? String).map({ String($0.prefix(60)) }), !text.isEmpty {
                let view = pill(text, color: stroke, badge: badge)
                labels.append((view, anchor))
                if shape["shape"] as? String != "text" { clickable[ObjectIdentifier(view)] = badge.map { "step \($0): \(text)" } ?? text }
            } else if let badge {
                labels.append((pill("Step \(badge)", color: stroke, badge: nil), anchor))
            }
        }
        // The spotlight's dimmer goes under everything: the whole screen darkened, with a window over each spot.
        if !holes.isEmpty {
            let scrim = CAShapeLayer(), p = CGMutablePath()
            p.addRect(CGRect(x: 0, y: 0, width: W, height: H))
            for h in holes { p.addRoundedRect(in: h, cornerWidth: 14, cornerHeight: 14) }
            scrim.path = p; scrim.fillRule = .evenOdd; scrim.fillColor = NSColor.black.withAlphaComponent(0.55).cgColor
            let dim = CABasicAnimation(keyPath: "opacity"); dim.fromValue = 0; dim.toValue = 1; dim.duration = 0.4
            scrim.add(dim, forKey: "dim")
            root.layer?.addSublayer(scrim)
        }
        for f in fills { root.layer?.addSublayer(f) }
        if let spot = firstSpot { _ = comet(in: root, from: from.map { CGPoint(x: $0.x - frame.minX, y: $0.y - frame.minY) }, to: spot, color: color) }
        for l in layers { root.layer?.addSublayer(l) }
        for (view, anchor) in labels {
            if anchor.size == .zero { view.frame.origin = NSPoint(x: min(max(anchor.minX - view.frame.width / 2, 8), W - view.frame.width - 8), y: min(max(anchor.minY - 15, 8), H - 38)) }
            else { place(view, near: anchor, in: frame.size) }
            view.alphaValue = 0
            root.addSubview(view)
        }
        panel.orderFrontRegardless()
        self.panel = panel
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6 + Double(layers.count) * 0.35) { [weak self] in
            NSAnimationContext.runAnimationGroup { ctx in ctx.duration = 0.3; for (v, _) in labels { v.animator().alphaValue = 1 } }
            guard let self, self.panel === panel, self.onMarkClick != nil else { return }
            for (v, _) in labels { if let text = clickable[ObjectIdentifier(v)] { self.addClickTarget(NSRect(x: frame.minX + v.frame.minX, y: frame.minY + v.frame.minY, width: v.frame.width, height: v.frame.height), text: text) } }
        }
        hideWhenDone(after: stay)
    }

    /// A tiny window exactly over one label or card: the pointer turns into a hand, and a click goes to Spark.
    private func addClickTarget(_ rect: NSRect, text: String) {
        let catcher = NSPanel(contentRect: rect, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        catcher.level = .popUpMenu; catcher.hidesOnDeactivate = false; catcher.backgroundColor = .clear; catcher.isOpaque = false; catcher.hasShadow = false
        catcher.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]; catcher.isReleasedWhenClosed = false
        let view = MarkHit(frame: NSRect(origin: .zero, size: rect.size))
        view.onClick = { [weak self] in self?.onMarkClick?(text); self?.fadeOut() }
        catcher.contentView = view
        catcher.orderFrontRegardless()
        catchers.append(catcher)
    }

    /// A small explainer card: dark glass, a title in the accent, a line or two, and up to four points.
    private func card(title: String, body: String, items: [String], color: NSColor) -> NSView {
        let width: CGFloat = 300, pad: CGFloat = 14
        let view = NSView(); view.wantsLayer = true
        view.layer?.backgroundColor = NSColor(srgbRed: 0.09, green: 0.08, blue: 0.11, alpha: 0.94).cgColor
        view.layer?.cornerRadius = 14; view.layer?.borderWidth = 1; view.layer?.borderColor = color.withAlphaComponent(0.55).cgColor
        view.layer?.shadowOpacity = 0.5; view.layer?.shadowRadius = 18; view.layer?.shadowOffset = CGSize(width: 0, height: -4)
        var fields: [NSTextField] = []
        let add = { (text: String, font: NSFont, tint: NSColor) in
            let f = NSTextField(wrappingLabelWithString: text); f.font = font; f.textColor = tint
            f.preferredMaxLayoutWidth = width - pad * 2; f.frame.size = f.fittingSize; fields.append(f)
        }
        if !title.isEmpty { add(title, .systemFont(ofSize: 13, weight: .bold), color) }
        if !body.isEmpty { add(body, .systemFont(ofSize: 12.5), NSColor(white: 0.9, alpha: 1)) }
        for item in items { add("•  " + item, .systemFont(ofSize: 12), NSColor(white: 0.78, alpha: 1)) }
        let height = fields.reduce(pad * 2) { $0 + $1.frame.height + 5 } - 5
        var y = height - pad
        for f in fields { y -= f.frame.height; f.frame.origin = NSPoint(x: pad, y: y); y -= 5; view.addSubview(f) }
        view.frame = NSRect(x: 0, y: 0, width: width, height: height)
        return view
    }

    private func fadeOut() {
        guard let panel else { return }
        NSAnimationContext.runAnimationGroup({ $0.duration = 0.35; panel.animator().alphaValue = 0 }, completionHandler: { [weak self] in
            Task { @MainActor in if self?.panel === panel { self?.hide() } }
        })
    }

    func hide() {
        hideWork?.cancel()
        for c in catchers { c.orderOut(nil) }
        catchers.removeAll()
        for m in monitors { NSEvent.removeMonitor(m) }
        monitors.removeAll()
        target = nil
        panel?.orderOut(nil)
        panel = nil
    }
}

/// The click target over one of Spark's labels or cards: a pointing hand, and a click (never a drag-through).
final class MarkHit: NSView {
    var onClick: (() -> Void)?
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    override func resetCursorRects() { addCursorRect(bounds, cursor: .pointingHand) }
    override func mouseDown(with event: NSEvent) { onClick?() }
}

/// The things Spark can do on your Mac, each checked here — the page's word is never enough.
@MainActor
enum MacActions {
    static func perform(_ action: [String: Any]) -> (ok: Bool, message: String) {
        switch action["type"] as? String {
        case "open_app":
            guard let name = action["name"] as? String, let url = findApp(name) else { return (false, "Couldn't find an app called \((action["name"] as? String) ?? "that").") }
            let config = NSWorkspace.OpenConfiguration(); config.activates = true
            NSWorkspace.shared.openApplication(at: url, configuration: config) { app, _ in Task { @MainActor in bringToFront(app?.bundleIdentifier ?? Bundle(url: url)?.bundleIdentifier) } }
            return (true, "Opened \(url.deletingPathExtension().lastPathComponent)")
        case "open_url":
            guard let s = action["url"] as? String, let url = URL(string: s), ["http", "https"].contains(url.scheme?.lowercased() ?? "") else { return (false, "Only web links can be opened.") }
            open(url)
            return (true, "Opened \(url.host ?? "the link")")
        case "open_path":
            guard let raw = action["path"] as? String else { return (false, "No path.") }
            let home = NSHomeDirectory()
            let path = URL(fileURLWithPath: (raw as NSString).expandingTildeInPath).standardizedFileURL.resolvingSymlinksInPath().path
            // Your home folder only, and never the sealed day-job folders.
            let sealed = ["\(home)/Nectar-Work", "\(home)/Developer/work"]
            guard path.hasPrefix(home + "/"), !sealed.contains(where: { path == $0 || path.hasPrefix($0 + "/") }) else { return (false, "Spark only opens things in your home folder.") }
            guard FileManager.default.fileExists(atPath: path) else { return (false, "\(raw) doesn't exist.") }
            open(URL(fileURLWithPath: path))
            return (true, "Opened \((path as NSString).lastPathComponent)")
        default:
            return (false, "Spark can't do that.")
        }
    }

    /// Open a link, file or folder in its app and bring that app to the front.
    static func open(_ url: URL) {
        let handler = NSWorkspace.shared.urlForApplication(toOpen: url).flatMap { Bundle(url: $0)?.bundleIdentifier }
        let config = NSWorkspace.OpenConfiguration(); config.activates = true
        NSWorkspace.shared.open(url, configuration: config) { app, _ in Task { @MainActor in bringToFront(app?.bundleIdentifier ?? handler) } }
    }

    /// Since macOS 14, activation is cooperative: whatever Spark opened while you were talking to it from another app
    /// (fn, the notch) came up BEHIND that app — "BBC's still behind the terminal". So ask twice: as ShuaCrew, and
    /// through accessibility (frontmost + raise its window, as window managers do), until it really is in front.
    static func bringToFront(_ bundleID: String?, tries: Int = 8) {
        guard let bundleID, let app = NSRunningApplication.runningApplications(withBundleIdentifier: bundleID).first else {
            if tries > 0 { DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { bringToFront(bundleID, tries: tries - 1) } }
            return
        }
        if NSWorkspace.shared.frontmostApplication?.processIdentifier == app.processIdentifier { return }
        app.activate(from: .current, options: [.activateAllWindows])
        if AXIsProcessTrusted() {
            let el = AXUIElementCreateApplication(app.processIdentifier)
            AXUIElementSetAttributeValue(el, kAXFrontmostAttribute as CFString, kCFBooleanTrue)
            var w: CFTypeRef?
            if AXUIElementCopyAttributeValue(el, kAXMainWindowAttribute as CFString, &w) == .success || AXUIElementCopyAttributeValue(el, kAXFocusedWindowAttribute as CFString, &w) == .success, let w {
                AXUIElementPerformAction(w as! AXUIElement, kAXRaiseAction as CFString)
            }
        }
        if tries > 0 { DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { bringToFront(bundleID, tries: tries - 1) } }
    }

    /// "vs code", "VS Code", "Visual Studio Code", "chrome": exact name first, then the closest installed app.
    static func findApp(_ query: String) -> URL? {
        let aliases = ["vs code": "Visual Studio Code", "vscode": "Visual Studio Code", "code": "Visual Studio Code", "chrome": "Google Chrome", "settings": "System Settings", "system preferences": "System Settings", "iterm": "iTerm", "xcode": "Xcode"]
        let want = (aliases[query.lowercased().trimmingCharacters(in: .whitespaces)] ?? query).lowercased().replacingOccurrences(of: ".app", with: "")
        let roots = ["/Applications", "/Applications/Utilities", "/System/Applications", "/System/Applications/Utilities", NSHomeDirectory() + "/Applications"]
        var apps: [URL] = []
        for root in roots {
            let items = (try? FileManager.default.contentsOfDirectory(at: URL(fileURLWithPath: root), includingPropertiesForKeys: nil)) ?? []
            apps += items.filter { $0.pathExtension == "app" }
        }
        let name = { (u: URL) in u.deletingPathExtension().lastPathComponent.lowercased() }
        return apps.first { name($0) == want } ?? apps.first { name($0).hasPrefix(want) } ?? apps.filter { name($0).contains(want) }.min { name($0).count < name($1).count }
    }
}
