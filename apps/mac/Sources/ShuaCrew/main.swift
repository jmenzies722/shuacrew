import AppKit
import Carbon.HIToolbox

/// ShuaCrew for Mac. Closing the window doesn't stop anything: agents keep working in the
/// gateway, and the menu-bar icon and notifications keep you in the loop.
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private let gateway = Gateway()
    private var window: MainWindow!
    private var tray: Tray?
    private var hotKey: HotKey?
    private var buddyKey: HotKey?
    private var buddy: Buddy!
    private var mobile: MobileBridge!
    private var mobileWindow: MobileSettingsWindow?
    /// For headless checks: no Dock icon, no menu-bar item, never takes focus.
    private let quiet = ProcessInfo.processInfo.environment["SHUACREW_NO_ACTIVATE"] == "1"

    func applicationDidFinishLaunching(_ notification: Notification) {
        window = MainWindow(gateway: gateway)
        mobile = MobileBridge(gateway: gateway)
        window.onMobileSettings = { [weak self] in self?.showMobileSettings() }
        buddy = Buddy(gateway: gateway)
        buddy.onOpen = { [weak self] path in
            NSApp.activate()
            self?.window.navigate(path)
        }
        window.onBuddyEnabled = { [weak self] on in self?.buddy.setEnabled(on) }
        window.onBuddyHotkey = { [weak self] combo in self?.bindBuddyKey(combo) }
        buddy.onHotkey = { [weak self] combo in self?.bindBuddyKey(combo) }
        window.onBuddyMessage = { [weak self] controller, message in self?.buddy.userContentController(controller, didReceive: message) }
        buddy.appWeb = window.web
        NSApp.mainMenu = mainMenu()
        if quiet {
            NSApp.setActivationPolicy(.accessory)
            window.window?.orderFrontRegardless()
        } else {
            window.showWindow(nil)
            NSApp.activate()
            tray = Tray(gateway: gateway, window: window, notifications: true)
            tray?.onAskSpark = { [weak self] in self?.buddy.open() }
            window.onNotificationSettings = { [weak self] body in self?.tray?.notificationSettings(body) }
            // ⌥Space, anywhere: ShuaCrew comes forward with the message box ready; again, it hides.
            hotKey = HotKey { [weak self] in Task { @MainActor in self?.summon() } }
            // ⌃⌥Space, anywhere: Spark, your desktop buddy, ready for a question about whatever you're looking at.
            bindBuddyKey(UserDefaults.standard.string(forKey: "buddyHotkey") ?? "ctrl-opt-space")
        }
        window.start()
        tray?.start()
        Task {
            // The buddy's page comes from the gateway, so it appears once the gateway answers.
            try? await Launcher.ensureRunning(gateway)
            if !quiet { buddy.start() }
        }
        Task { await mobile.start() }
    }

    // shuacrew:// links — for Shortcuts, Siri ("Run shortcut…"), Raycast, a browser bookmark:
    //   shuacrew://ask?q=…   shuacrew://idea?text=…   shuacrew://radio/play?station=lofi%20jazz   shuacrew://radio/pause
    //   shuacrew://open/studio   shuacrew://start-day
    func applicationWillFinishLaunching(_ notification: Notification) {
        NSAppleEventManager.shared().setEventHandler(self, andSelector: #selector(handleLink(_:reply:)), forEventClass: AEEventClass(kInternetEventClass), andEventID: AEEventID(kAEGetURL))
    }
    @objc private func handleLink(_ event: NSAppleEventDescriptor, reply: NSAppleEventDescriptor) {
        guard let text = event.paramDescriptor(forKeyword: keyDirectObject)?.stringValue, let url = URL(string: text), url.scheme == "shuacrew" else { return }
        let query = Dictionary((URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []).map { ($0.name, $0.value ?? "") }, uniquingKeysWith: { a, _ in a })
        let path = url.path.split(separator: "/").map(String.init)
        switch url.host ?? "" {
        case "ask": buddy.open(asking: query["q"] ?? query["text"])
        case "idea": if let idea = query["text"] ?? query["q"], !idea.isEmpty { buddy.open(asking: "idea: \(idea)") }
        case "radio": Tray.radio(gateway.base, cmd: path.first ?? "play", station: query["station"])
        case "open":
            let page = "/" + path.joined(separator: "/")
            if page.range(of: "^/[A-Za-z0-9/_-]{0,120}$", options: .regularExpression) != nil { NSApp.activate(); window.showWindow(nil); window.navigate(page) }
        case "start-day": NSApp.activate(); window.showWindow(nil); window.navigate("/activity"); window.page("setTimeout(() => window.dispatchEvent(new Event('shuacrew:start-day')), 900)")
        default: break
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { quiet }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { window.showWindow(nil) }
        return true
    }

    func applicationDidBecomeActive(_ notification: Notification) {
        window.reportScreenAccess()
        buddy.reportScreenAccess()
    }

    func applicationWillTerminate(_ notification: Notification) {
        window.rememberPath()
    }

    @objc private func quickAsk() { summon() }

    /// Spark's shortcut, chosen in Settings → Spark. Rebinding replaces the old one at once.
    private func bindBuddyKey(_ combo: String) {
        let combos: [String: (UInt32, Int)] = [
            "ctrl-opt-space": (UInt32(kVK_Space), controlKey | optionKey), "ctrl-shift-space": (UInt32(kVK_Space), controlKey | shiftKey),
            "opt-shift-space": (UInt32(kVK_Space), optionKey | shiftKey), "ctrl-opt-s": (UInt32(kVK_ANSI_S), controlKey | optionKey),
        ]
        guard !quiet, let (key, mods) = combos[combo] else { return }
        UserDefaults.standard.set(combo, forKey: "buddyHotkey")
        buddyKey = nil
        buddyKey = HotKey(keyCode: key, modifiers: UInt32(mods)) { [weak self] in Task { @MainActor in self?.buddy.summon() } }
    }

    /// Bring the app forward, ready to type — or, if it's already in front, put it away.
    private func summon() {
        if NSApp.isActive, window.window?.isKeyWindow == true {
            NSApp.hide(nil)
            return
        }
        NSApp.activate()
        window.showWindow(nil)
        window.page("compose()")
    }

    // MARK: menus

    private func mainMenu() -> NSMenu {
        let main = NSMenu()

        let app = submenu(main, "ShuaCrew")
        app.addItem(withTitle: "About ShuaCrew", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        app.addItem(.separator())
        app.addItem(item("Settings…", ",", #selector(go(_:)), "/settings"))
        app.addItem(item("Mobile Settings…", "", #selector(showMobileSettings)))
        app.addItem(.separator())
        let services = NSMenu()
        app.addItem(withTitle: "Services", action: nil, keyEquivalent: "").submenu = services
        NSApp.servicesMenu = services
        app.addItem(.separator())
        app.addItem(withTitle: "Hide ShuaCrew", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let others = app.addItem(withTitle: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        others.keyEquivalentModifierMask = [.command, .option]
        app.addItem(withTitle: "Show All", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        app.addItem(.separator())
        app.addItem(withTitle: "Quit ShuaCrew", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")

        let file = submenu(main, "File")
        file.addItem(item("New Session…", "n", #selector(newRun)))
        file.addItem(item("Command Palette…", "k", #selector(palette)))
        let ask = item("Ask the Crew", " ", #selector(quickAsk))
        ask.keyEquivalentModifierMask = [.option]
        file.addItem(ask)
        file.addItem(item("Show Companion", "", #selector(askSpark)))
        file.addItem(.separator())
        file.addItem(withTitle: "Close Window", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")

        // The web view does the editing; these give it the shortcuts every Mac text field has.
        let edit = submenu(main, "Edit")
        edit.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        let redo = edit.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        edit.addItem(.separator())
        edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")

        let view = submenu(main, "View")
        // Keep native shortcuts aligned with the six primary workspace destinations.
        let screens: [(String, String, String)] = [
            ("Today", "1", "/activity"), ("Projects", "2", "/ventures"), ("Crew", "3", "/floor"),
            ("Learning", "4", "/learn"), ("Automations", "5", "/playbooks"), ("Library", "6", "/library"),
        ]
        for (title, key, path) in screens { view.addItem(item(title, key, #selector(go(_:)), path)) }
        view.addItem(.separator())
        let terminal = item("Terminal", "`", #selector(toggleTerminal))
        terminal.keyEquivalentModifierMask = [.control]
        view.addItem(terminal)
        view.addItem(item("Reload", "r", #selector(reload)))
        view.addItem(item("Actual Size", "0", #selector(zoomReset)))
        view.addItem(item("Zoom In", "+", #selector(zoomIn)))
        view.addItem(item("Zoom Out", "-", #selector(zoomOut)))
        view.addItem(.separator())
        let full = view.addItem(withTitle: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        full.keyEquivalentModifierMask = [.command, .control]

        let windowMenu = submenu(main, "Window")
        windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        windowMenu.addItem(.separator())
        windowMenu.addItem(item("ShuaCrew", "0", #selector(showMain)))
        windowMenu.addItem(item("Ask Spark", "", #selector(askSpark)))
        windowMenu.addItem(withTitle: "Bring All to Front", action: #selector(NSApplication.arrangeInFront(_:)), keyEquivalent: "")
        NSApp.windowsMenu = windowMenu

        let help = submenu(main, "Help")
        help.addItem(item("Keyboard Shortcuts", "/", #selector(shortcuts)))
        help.addItem(item("Gateway Log", "", #selector(openLog)))
        NSApp.helpMenu = help
        return main
    }

    private func submenu(_ parent: NSMenu, _ title: String) -> NSMenu {
        let menu = NSMenu(title: title)
        parent.addItem(withTitle: title, action: nil, keyEquivalent: "").submenu = menu
        return menu
    }

    private func item(_ title: String, _ key: String, _ action: Selector, _ value: String? = nil) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
        item.target = self
        item.representedObject = value
        return item
    }

    @objc private func newRun() { window.page("launch()") }
    @objc private func showMobileSettings() {
        if mobileWindow == nil { mobileWindow = MobileSettingsWindow(model: mobile) }
        mobileWindow?.showWindow(nil)
        NSApp.activate()
        Task { await mobile.refreshRooms() }
    }
    @objc private func palette() { window.page("palette()") }
    @objc private func go(_ sender: NSMenuItem) { if let path = sender.representedObject as? String { window.navigate(path) } }
    @objc private func toggleTerminal() { window.page("terminal()") }
    @objc private func reload() { window.web.reload() }
    @objc private func zoomReset() { window.web.pageZoom = 1 }
    @objc private func zoomIn() { window.web.pageZoom = min(window.web.pageZoom + 0.1, 2) }
    @objc private func zoomOut() { window.web.pageZoom = max(window.web.pageZoom - 0.1, 0.6) }
    @objc private func showMain() { window.showWindow(nil) }
    @objc private func askSpark() { buddy.summon() }
    @objc private func openLog() { NSWorkspace.shared.open(Launcher.log) }
    @objc private func shortcuts() {
        window.showWindow(nil)
        window.page("shortcuts()")
    }
}

// `ShuaCrew --bluetooth 0|1|?`: a short-lived helper for Bluetooth power. macOS has no public switch; the private
// IOBluetooth one can abort the process on some systems, so it runs here — a crash takes only this helper down.
if CommandLine.arguments.count == 3, CommandLine.arguments[1] == "--bluetooth" {
    guard let lib = dlopen("/System/Library/Frameworks/IOBluetooth.framework/IOBluetooth", RTLD_LAZY),
          let get = dlsym(lib, "IOBluetoothPreferenceGetControllerPowerState"), let set = dlsym(lib, "IOBluetoothPreferenceSetControllerPowerState") else { exit(3) }
    let state = unsafeBitCast(get, to: (@convention(c) () -> Int32).self)
    if CommandLine.arguments[2] != "?" { unsafeBitCast(set, to: (@convention(c) (Int32) -> Void).self)(CommandLine.arguments[2] == "1" ? 1 : 0); usleep(600_000) }
    print(state()); exit(0)
}

MainActor.assumeIsolated {
    let app = NSApplication.shared
    let delegate = AppDelegate()
    app.delegate = delegate
    app.run()
}
