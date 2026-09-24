import AppKit
import WebKit

/// One window: native chrome and sidebar material, the screens in WebKit on top of it.
@MainActor
final class MainWindow: NSWindowController, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    let web: WKWebView
    private let strip = DragStrip()
    private weak var material: NSVisualEffectView?
    /// The page's top bar is this tall; the traffic lights are centred in it.
    static let titleBarHeight: CGFloat = 38
    private let gateway: Gateway
    private let overlay = StartOverlay()
    private static let lastPathKey = "lastPath"

    init(gateway: Gateway) {
        self.gateway = gateway
        let config = WKWebViewConfiguration()
        // Mark the page before it renders so the CSS lays out for the Mac window from the first frame.
        config.userContentController.addUserScript(WKUserScript(
            source: "document.documentElement.dataset.shell = 'mac';",
            injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.preferences.isElementFullscreenEnabled = true
        config.writingToolsBehavior = .none // no Writing Tools badge hanging off the composer
        web = WKWebView(frame: .zero, configuration: config)
        web.setValue(false, forKey: "drawsBackground") // let the sidebar material show through
        web.allowsBackForwardNavigationGestures = true

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1440, height: 900),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered, defer: false)
        window.title = "ShuaCrew"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.minSize = NSSize(width: 880, height: 560)
        window.isReleasedWhenClosed = false
        window.tabbingMode = .disallowed
        window.center()
        window.setFrameAutosaveName("ShuaCrewMain")

        let material = NSVisualEffectView()
        material.material = .sidebar
        material.blendingMode = .behindWindow
        material.state = .followsWindowActiveState
        window.contentView = material
        self.material = material

        for view in [web, overlay, strip] as [NSView] {
            view.translatesAutoresizingMaskIntoConstraints = false
            material.addSubview(view)
        }
        NSLayoutConstraint.activate([
            web.leadingAnchor.constraint(equalTo: material.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: material.trailingAnchor),
            web.topAnchor.constraint(equalTo: material.topAnchor),
            web.bottomAnchor.constraint(equalTo: material.bottomAnchor),
            overlay.leadingAnchor.constraint(equalTo: material.leadingAnchor),
            overlay.trailingAnchor.constraint(equalTo: material.trailingAnchor),
            overlay.topAnchor.constraint(equalTo: material.topAnchor),
            overlay.bottomAnchor.constraint(equalTo: material.bottomAnchor),
            strip.leadingAnchor.constraint(equalTo: material.leadingAnchor),
            strip.trailingAnchor.constraint(equalTo: material.trailingAnchor),
            strip.topAnchor.constraint(equalTo: material.topAnchor),
            strip.heightAnchor.constraint(equalToConstant: Self.titleBarHeight),
        ])
        super.init(window: window)
        window.delegate = self
        web.navigationDelegate = self
        web.uiDelegate = self
        strip.web = web
        config.userContentController.add(WeakHandler(self), name: "shuacrew")
        placeTrafficLights()
        overlay.onRetry = { [weak self] in self?.start() }
    }

    required init?(coder: NSCoder) { fatalError() }

    /// Make sure the gateway is up, then load the screen you were last on.
    func start() {
        overlay.show(.starting)
        web.isHidden = true
        Task {
            do {
                try await Launcher.ensureRunning(gateway)
                // Always open on the chat; come back to the session you had open, if any.
                let saved = UserDefaults.standard.string(forKey: Self.lastPathKey) ?? "/"
                let path = saved.hasPrefix("/sessions/") ? saved : "/"
                web.load(URLRequest(url: URL(string: path, relativeTo: gateway.base)!))
            } catch {
                overlay.show(.failed(error.localizedDescription))
            }
        }
    }

    /// Call into the page's bridge (`window.shuacrew`).
    func page(_ script: String) {
        showWindow(nil)
        web.evaluateJavaScript("window.shuacrew && window.shuacrew.\(script)")
    }

    func navigate(_ path: String) {
        let escaped = path.replacingOccurrences(of: "'", with: "")
        page("navigate('\(escaped)')")
    }

    func rememberPath() {
        if let url = web.url, url.host == gateway.base.host { UserDefaults.standard.set(url.path, forKey: Self.lastPathKey) }
    }

    // MARK: title bar

    /// Centre the window buttons in the page's taller top bar, and keep them there.
    func placeTrafficLights() {
        guard let window else { return }
        for (i, kind) in [NSWindow.ButtonType.closeButton, .miniaturizeButton, .zoomButton].enumerated() {
            guard let button = window.standardWindowButton(kind), let bar = button.superview else { continue }
            let y = bar.frame.height - Self.titleBarHeight / 2 - button.frame.height / 2
            button.setFrameOrigin(NSPoint(x: 14 + CGFloat(i) * 20, y: max(0, y)))
        }
    }

    func windowDidResize(_ notification: Notification) { placeTrafficLights() }
    func windowDidExitFullScreen(_ notification: Notification) { placeTrafficLights() }
    // Full screen has no desktop behind it: the page paints its chrome solid, in the app's colour.
    func windowWillEnterFullScreen(_ notification: Notification) { page("document.documentElement.dataset.fullscreen = '1'") }
    func windowWillExitFullScreen(_ notification: Notification) { page("delete document.documentElement.dataset.fullscreen") }

    // MARK: messages from the page

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "noDrag":
            strip.controls = (body["rects"] as? [[Double]] ?? []).compactMap { r in
                r.count == 4 ? CGRect(x: r[0], y: r[1], width: r[2], height: r[3]) : nil
            }
        case "appearance":
            // The chosen palette, not just macOS, decides the window's own chrome.
            window?.appearance = NSAppearance(named: (body["mode"] as? String) == "light" ? .aqua : .darkAqua)
            // Frost Black is glass on purpose: a darker, heavier frost; every other palette paints over it.
            material?.material = (body["palette"] as? String) == "frost" ? .hudWindow : .sidebar
        case "pickFolder":
            let panel = NSOpenPanel()
            panel.canChooseDirectories = true
            panel.canChooseFiles = false
            panel.prompt = "Work Here"
            panel.message = "Choose the project this session works in."
            panel.directoryURL = URL(fileURLWithPath: NSHomeDirectory() + "/Developer/projects")
            panel.beginSheetModal(for: window!) { [weak self] response in
                let path = response == .OK ? panel.url?.path : nil
                let arg = path.flatMap { try? String(data: JSONSerialization.data(withJSONObject: [$0]), encoding: .utf8) }.map { String($0.dropFirst().dropLast()) } ?? "null"
                self?.web.evaluateJavaScript("window.shuacrew && window.shuacrew.folderPicked(\(arg))")
            }
        default:
            break
        }
    }

    // MARK: microphone

    /// The voice button in the composer: our own page may use the mic (macOS still asks you once).
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping @MainActor (WKPermissionDecision) -> Void) {
        let ours = origin.host == gateway.base.host && origin.port == (gateway.base.port ?? 80)
        decisionHandler(ours && type == .microphone ? .grant : .deny)
    }

    // MARK: navigation

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        web.isHidden = false
        overlay.hide()
        if ProcessInfo.processInfo.environment["SHUACREW_DEBUG_HIT"] == "1" { reportHits() }
    }

    /// For checking without clicking: which view gets a click at a few title-bar points.
    private func reportHits() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            guard let self, let frame = self.window?.contentView?.superview else { return }
            let top = frame.bounds.height - Self.titleBarHeight / 2
            let points = [("traffic", 20.0), ("empty", 240.0), ("search", frame.bounds.width / 2), ("bell", frame.bounds.width - 30)]
            for (name, x) in points {
                let hit = frame.hitTest(NSPoint(x: x, y: top))
                print("hit \(name): \(hit.map { String(describing: type(of: $0)) } ?? "nil")")
            }
            fflush(stdout)
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        overlay.show(.failed("Couldn't reach the gateway at \(gateway.base.absoluteString): \(error.localizedDescription)"))
    }

    /// The gateway's pages stay here; every other link opens in your browser.
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { return decisionHandler(.cancel) }
        if url.host == gateway.base.host && url.port == gateway.base.port || url.scheme == "about" {
            decisionHandler(.allow)
        } else {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url { NSWorkspace.shared.open(url) }
        return nil
    }

    /// WebKit can kill a page's process under memory pressure; come back rather than go blank.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }
}

/// The top bar is the title bar: its empty space drags the window (double-click zooms), while
/// clicks on the page's own controls there — search, bell, chips — pass straight through.
final class DragStrip: NSView {
    weak var web: WKWebView?
    /// The page's controls in the top bar, in CSS pixels from the page's top-left.
    var controls: [CGRect] = []

    override var mouseDownCanMoveWindow: Bool { true }

    override func hitTest(_ point: NSPoint) -> NSView? {
        let local = convert(point, from: superview)
        guard bounds.contains(local) else { return nil }
        let zoom = web?.pageZoom ?? 1
        let css = CGPoint(x: local.x / zoom, y: (bounds.height - local.y) / zoom)
        return controls.contains { $0.insetBy(dx: -2, dy: -2).contains(css) } ? nil : self
    }

    override func mouseDown(with event: NSEvent) {
        if event.clickCount == 2 {
            let action = UserDefaults.standard.string(forKey: "AppleActionOnDoubleClick") ?? "Maximize"
            if action == "Minimize" { window?.performMiniaturize(nil) } else if action != "None" { window?.performZoom(nil) }
        } else {
            window?.performDrag(with: event)
        }
    }
}

/// WKUserContentController retains its handlers; this keeps it from retaining the window.
final class WeakHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}

/// Shown while the gateway starts, or when it can't.
@MainActor
final class StartOverlay: NSView {
    enum State { case starting, failed(String) }
    var onRetry: (() -> Void)?
    private let spinner = NSProgressIndicator()
    private let title = NSTextField(labelWithString: "")
    private let detail = NSTextField(wrappingLabelWithString: "")
    private let retry = NSButton(title: "Try Again", target: nil, action: nil)
    private let openLog = NSButton(title: "Open Log", target: nil, action: nil)

    init() {
        super.init(frame: .zero)
        spinner.style = .spinning
        spinner.controlSize = .small
        title.font = .systemFont(ofSize: 15, weight: .semibold)
        detail.font = .systemFont(ofSize: 12.5)
        detail.textColor = .secondaryLabelColor
        detail.alignment = .center
        detail.preferredMaxLayoutWidth = 420
        retry.bezelStyle = .push
        retry.keyEquivalent = "\r"
        retry.target = self
        retry.action = #selector(retryTapped)
        openLog.bezelStyle = .push
        openLog.target = self
        openLog.action = #selector(openLogTapped)
        let buttons = NSStackView(views: [openLog, retry])
        let stack = NSStackView(views: [spinner, title, detail, buttons])
        stack.orientation = .vertical
        stack.spacing = 10
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([stack.centerXAnchor.constraint(equalTo: centerXAnchor), stack.centerYAnchor.constraint(equalTo: centerYAnchor)])
    }

    required init?(coder: NSCoder) { fatalError() }

    func show(_ state: State) {
        isHidden = false
        switch state {
        case .starting:
            spinner.isHidden = false
            spinner.startAnimation(nil)
            title.stringValue = "Starting ShuaCrew…"
            detail.stringValue = ""
            retry.isHidden = true
            openLog.isHidden = true
        case .failed(let why):
            spinner.stopAnimation(nil)
            spinner.isHidden = true
            title.stringValue = "ShuaCrew couldn't start"
            detail.stringValue = why
            retry.isHidden = false
            openLog.isHidden = false
        }
    }

    func hide() {
        spinner.stopAnimation(nil)
        isHidden = true
    }

    @objc private func retryTapped() { onRetry?() }
    @objc private func openLogTapped() { NSWorkspace.shared.open(Launcher.log) }
}
