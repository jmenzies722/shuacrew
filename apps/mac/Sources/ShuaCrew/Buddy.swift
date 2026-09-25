import AppKit
import ScreenCaptureKit
import WebKit

/// Spark on your desktop, over every app and Space — even with the ShuaCrew window closed.
/// A non-activating panel: you can type into it without pulling ShuaCrew in front of your work.
@MainActor
final class Buddy: NSObject, WKScriptMessageHandler, WKUIDelegate, WKNavigationDelegate {
    static let enabledKey = "buddyEnabled"
    private static let cornerKey = "buddyCorner"
    private static let closed = NSSize(width: 104, height: 108)
    private static let open = NSSize(width: 380, height: 560)
    /// Room for a speech bubble beside Spark ("Aria finished…") without the whole card.
    private static let peek = NSSize(width: 320, height: 190)

    private let gateway: Gateway
    private let panel: BuddyPanel
    private let web: WKWebView
    private let grip = BuddyGrip()
    private let pointer = PointerOverlay()
    /// The display the last screenshot came from — where pointing lands.
    private var shotScreen: NSScreen?
    private var loaded = false
    private let location = LocationOnce()
    /// Opens a path in the main window (a session, Learning, Usage…).
    var onOpen: ((String) -> Void)?

    static var enabled: Bool {
        get { UserDefaults.standard.object(forKey: enabledKey) as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: enabledKey) }
    }

    init(gateway: Gateway) {
        self.gateway = gateway
        let config = WKWebViewConfiguration()
        config.writingToolsBehavior = .none
        config.mediaTypesRequiringUserActionForPlayback = [] // Spark talks back as the answer streams in
        web = WKWebView(frame: .zero, configuration: config)
        web.setValue(false, forKey: "drawsBackground")
        panel = BuddyPanel(contentRect: NSRect(origin: .zero, size: Self.closed), styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        super.init()
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        panel.backgroundColor = .clear
        panel.isOpaque = false
        panel.hasShadow = false
        panel.hidesOnDeactivate = false
        panel.isReleasedWhenClosed = false
        panel.becomesKeyOnlyIfNeeded = true

        let root = NSView()
        panel.contentView = root
        for view in [web, grip] as [NSView] { view.translatesAutoresizingMaskIntoConstraints = false; root.addSubview(view) }
        NSLayoutConstraint.activate([
            web.leadingAnchor.constraint(equalTo: root.leadingAnchor), web.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            web.topAnchor.constraint(equalTo: root.topAnchor), web.bottomAnchor.constraint(equalTo: root.bottomAnchor),
            // The character sits in the bottom-right corner of the page; the grip covers exactly it.
            grip.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -8), grip.bottomAnchor.constraint(equalTo: root.bottomAnchor, constant: -8),
            grip.widthAnchor.constraint(equalToConstant: 88), grip.heightAnchor.constraint(equalToConstant: 92),
        ])
        grip.onClick = { [weak self] in self?.toggle() }
        grip.onMoved = { [weak self] in self?.rememberCorner() }
        web.uiDelegate = self
        web.navigationDelegate = self
        config.userContentController.add(WeakHandler(self), name: "shuacrew")
        place(size: Self.closed)
    }

    // MARK: showing

    func start() {
        guard Self.enabled else { return }
        if !loaded {
            loaded = true
            web.load(URLRequest(url: URL(string: "/buddy", relativeTo: gateway.base)!))
        }
        panel.orderFrontRegardless()
    }

    func setEnabled(_ on: Bool) {
        guard on != Self.enabled || on != panel.isVisible else { return }
        Self.enabled = on
        if on { start() } else { panel.orderOut(nil); pointer.hide() }
    }

    /// ⌃⌥Space: Spark opens with the question box focused, whatever app you're in.
    func summon() {
        if !Self.enabled { setEnabled(true) }
        start()
        panel.makeKeyAndOrderFront(nil)
        web.evaluateJavaScript("window.buddy && window.buddy.focus()")
    }

    private func toggle() {
        panel.makeKeyAndOrderFront(nil)
        web.evaluateJavaScript("window.buddy && window.buddy.toggle()")
    }

    /// Grow or shrink around the bottom-right corner, so Spark stays put and the empty, clear area never blocks your clicks.
    private func place(size: NSSize) {
        let corner = savedCorner() ?? defaultCorner()
        var frame = NSRect(x: corner.x - size.width, y: corner.y, width: size.width, height: size.height)
        if let screen = NSScreen.screens.first(where: { $0.frame.contains(corner) }) ?? NSScreen.main {
            let visible = screen.visibleFrame
            frame.origin.x = min(max(frame.minX, visible.minX), visible.maxX - frame.width)
            frame.origin.y = min(max(frame.minY, visible.minY), visible.maxY - frame.height)
        }
        panel.setFrame(frame, display: true, animate: false)
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
        UserDefaults.standard.set(NSStringFromPoint(NSPoint(x: panel.frame.maxX, y: panel.frame.minY)), forKey: Self.cornerKey)
    }

    // MARK: page bridge

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        let origin = message.frameInfo.securityOrigin
        guard message.frameInfo.isMainFrame, origin.host == gateway.base.host, origin.port == (gateway.base.port ?? 80),
              let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "buddyExpand":
            let open = body["open"] as? Bool ?? false, peek = body["peek"] as? Bool ?? false
            place(size: open ? Self.open : peek ? Self.peek : Self.closed)
            if !open { panel.resignKey() }
        case "buddyDo":
            guard let id = body["id"] as? String, let action = body["action"] as? [String: Any] else { return }
            let result = MacActions.perform(action)
            did(["id": id, "ok": result.ok, "message": result.message])
        case "buddyCapture":
            Task { await capture() }
        case "buddyPoint":
            guard let x = body["x"] as? Double, let y = body["y"] as? Double, (0...1).contains(x), (0...1).contains(y),
                  let screen = shotScreen ?? panel.screen ?? NSScreen.main else { return }
            pointer.show(on: screen, x: x, y: y, label: String((body["label"] as? String ?? "").prefix(60)))
        case "buddyOpen":
            if let run = body["run"] as? String, run.range(of: "^[A-Za-z0-9_-]{1,80}$", options: .regularExpression) != nil { onOpen?("/sessions/\(run)") }
            else if let path = body["path"] as? String, path.range(of: "^/[A-Za-z0-9/_-]{0,120}$", options: .regularExpression) != nil { onOpen?(path) }
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

    private func did(_ detail: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: detail), let json = String(data: data, encoding: .utf8) else { return }
        web.evaluateJavaScript("window.dispatchEvent(new CustomEvent('shuacrew:did', { detail: \(json) }))")
    }

    private func reply(_ detail: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: detail), let json = String(data: data, encoding: .utf8) else { return }
        web.evaluateJavaScript("window.dispatchEvent(new CustomEvent('shuacrew:capture', { detail: \(json) }))")
    }

    // MARK: looking at the screen

    /// One screenshot of the display Spark is on, only when you ask, with Spark itself left out.
    private func capture() async {
        guard CGPreflightScreenCaptureAccess() else {
            CGRequestScreenCaptureAccess()
            reply(["error": "Let ShuaCrew see your screen: System Settings → Privacy & Security → Screen & System Audio Recording, turn on ShuaCrew, then ask again. (Or tap the eye to ask without the screen.)"])
            return
        }
        do {
            let screen = panel.screen ?? NSScreen.main ?? NSScreen.screens[0]
            let number = (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value
            let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
            guard let display = content.displays.first(where: { $0.displayID == number }) ?? content.displays.first else {
                reply(["error": "No display to look at."]); return
            }
            let mine = content.windows.filter { $0.windowID == CGWindowID(panel.windowNumber) }
            let filter = SCContentFilter(display: display, excludingWindows: mine)
            // Big enough to read UI text, small enough to be quick and cheap for the model.
            let longest = 1568.0, scale = min(1, longest / Double(max(display.width, display.height)))
            let config = SCStreamConfiguration()
            config.width = Int(Double(display.width) * scale)
            config.height = Int(Double(display.height) * scale)
            config.showsCursor = true
            let image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
            guard let jpeg = NSBitmapImageRep(cgImage: image).representation(using: .jpeg, properties: [.compressionFactor: 0.72]) else {
                reply(["error": "Couldn't encode the screenshot."]); return
            }
            shotScreen = screen
            reply(["data": jpeg.base64EncodedString(), "width": image.width, "height": image.height])
        } catch {
            reply(["error": "Couldn't capture the screen: \(error.localizedDescription)"])
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

/// Borderless panels can't normally take keyboard focus; this one can, so you can type your question.
final class BuddyPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
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

/// Spark pointing at something on your screen: a pulsing ring and a label, click-through, gone in a few seconds.
@MainActor
final class PointerOverlay {
    private var panel: NSPanel?
    private var hideWork: DispatchWorkItem?

    func show(on screen: NSScreen, x: Double, y: Double, label: String) {
        hide()
        let frame = screen.frame
        let panel = NSPanel(contentRect: frame, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.level = .popUpMenu
        panel.ignoresMouseEvents = true
        panel.backgroundColor = .clear
        panel.isOpaque = false
        panel.hasShadow = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        panel.isReleasedWhenClosed = false
        let root = NSView(frame: NSRect(origin: .zero, size: frame.size))
        root.wantsLayer = true
        panel.contentView = root
        // Screenshot fractions are measured from the top-left; AppKit's origin is bottom-left.
        let point = CGPoint(x: x * frame.width, y: frame.height - y * frame.height)
        let amber = NSColor(srgbRed: 1, green: 0.72, blue: 0.2, alpha: 1)

        for delay in [0.0, 0.6] {
            let ring = CAShapeLayer()
            ring.path = CGPath(ellipseIn: CGRect(x: -22, y: -22, width: 44, height: 44), transform: nil)
            ring.position = point
            ring.fillColor = NSColor.clear.cgColor
            ring.strokeColor = amber.cgColor
            ring.lineWidth = 3
            ring.shadowColor = amber.cgColor
            ring.shadowRadius = 8
            ring.shadowOpacity = 0.9
            ring.shadowOffset = .zero
            root.layer?.addSublayer(ring)
            let grow = CABasicAnimation(keyPath: "transform.scale")
            grow.fromValue = 2.4; grow.toValue = 1
            let fade = CABasicAnimation(keyPath: "opacity")
            fade.fromValue = 0; fade.toValue = 1
            let pulse = CAAnimationGroup()
            pulse.animations = [grow, fade]
            pulse.duration = 0.7
            pulse.timingFunction = CAMediaTimingFunction(controlPoints: 0.2, 0.9, 0.3, 1.2)
            pulse.beginTime = CACurrentMediaTime() + delay
            pulse.fillMode = .backwards
            if delay > 0 {
                let breathe = CABasicAnimation(keyPath: "transform.scale")
                breathe.fromValue = 1; breathe.toValue = 1.35
                breathe.autoreverses = true; breathe.repeatCount = .infinity; breathe.duration = 0.8
                breathe.beginTime = CACurrentMediaTime() + delay + 0.7
                ring.add(breathe, forKey: "breathe")
                ring.opacity = 0.5
            }
            ring.add(pulse, forKey: "in")
        }
        let dot = CALayer()
        dot.bounds = CGRect(x: 0, y: 0, width: 10, height: 10)
        dot.cornerRadius = 5
        dot.position = point
        dot.backgroundColor = amber.cgColor
        root.layer?.addSublayer(dot)

        if !label.isEmpty {
            let text = NSTextField(labelWithString: "✦ \(label)")
            text.font = .systemFont(ofSize: 13, weight: .semibold)
            text.textColor = NSColor(srgbRed: 0.05, green: 0.05, blue: 0.06, alpha: 1)
            text.sizeToFit()
            let pill = NSView(frame: NSRect(x: 0, y: 0, width: text.frame.width + 22, height: 28))
            pill.wantsLayer = true
            pill.layer?.backgroundColor = amber.cgColor
            pill.layer?.cornerRadius = 14
            pill.layer?.shadowOpacity = 0.4
            pill.layer?.shadowRadius = 10
            pill.layer?.shadowOffset = CGSize(width: 0, height: -3)
            text.frame.origin = NSPoint(x: 11, y: (28 - text.frame.height) / 2)
            pill.addSubview(text)
            // Beside the ring, flipped inward near the screen's edges so it's always readable.
            var origin = NSPoint(x: point.x + 32, y: point.y - 14)
            if origin.x + pill.frame.width > frame.width - 8 { origin.x = point.x - 32 - pill.frame.width }
            origin.y = min(max(origin.y, 8), frame.height - 36)
            pill.frame.origin = origin
            root.addSubview(pill)
        }
        panel.alphaValue = 0
        panel.orderFrontRegardless()
        NSAnimationContext.runAnimationGroup { $0.duration = 0.15; panel.animator().alphaValue = 1 }
        self.panel = panel
        let work = DispatchWorkItem { [weak self] in self?.fadeOut() }
        hideWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 6.5, execute: work)
    }

    private func fadeOut() {
        guard let panel else { return }
        NSAnimationContext.runAnimationGroup({ $0.duration = 0.35; panel.animator().alphaValue = 0 }, completionHandler: { [weak self] in
            Task { @MainActor in if self?.panel === panel { self?.hide() } }
        })
    }

    func hide() {
        hideWork?.cancel()
        panel?.orderOut(nil)
        panel = nil
    }
}

/// The things Spark can do on your Mac, each checked here — the page's word is never enough.
@MainActor
enum MacActions {
    static func perform(_ action: [String: Any]) -> (ok: Bool, message: String) {
        switch action["type"] as? String {
        case "open_app":
            guard let name = action["name"] as? String, let url = findApp(name) else { return (false, "Couldn't find an app called \((action["name"] as? String) ?? "that").") }
            NSWorkspace.shared.openApplication(at: url, configuration: NSWorkspace.OpenConfiguration())
            return (true, "Opened \(url.deletingPathExtension().lastPathComponent)")
        case "open_url":
            guard let s = action["url"] as? String, let url = URL(string: s), ["http", "https"].contains(url.scheme?.lowercased() ?? "") else { return (false, "Only web links can be opened.") }
            NSWorkspace.shared.open(url)
            return (true, "Opened \(url.host ?? "the link")")
        case "open_path":
            guard let raw = action["path"] as? String else { return (false, "No path.") }
            let home = NSHomeDirectory()
            let path = URL(fileURLWithPath: (raw as NSString).expandingTildeInPath).standardizedFileURL.resolvingSymlinksInPath().path
            // Your home folder only, and never the sealed day-job folders.
            let sealed = ["\(home)/Nectar-Work", "\(home)/Developer/work"]
            guard path.hasPrefix(home + "/"), !sealed.contains(where: { path == $0 || path.hasPrefix($0 + "/") }) else { return (false, "Spark only opens things in your home folder.") }
            guard FileManager.default.fileExists(atPath: path) else { return (false, "\(raw) doesn't exist.") }
            NSWorkspace.shared.open(URL(fileURLWithPath: path))
            return (true, "Opened \((path as NSString).lastPathComponent)")
        default:
            return (false, "Spark can't do that.")
        }
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
