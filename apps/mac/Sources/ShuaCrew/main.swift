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
        buddy.onOpenRun = { [weak self] run in
            NSApp.activate()
            self?.window.navigate("/sessions/\(run)")
        }
        window.onBuddyEnabled = { [weak self] on in self?.buddy.setEnabled(on) }
        NSApp.mainMenu = mainMenu()
        if quiet {
            NSApp.setActivationPolicy(.accessory)
            window.window?.orderFrontRegardless()
        } else {
            window.showWindow(nil)
            NSApp.activate()
            tray = Tray(gateway: gateway, window: window, notifications: true)
            window.onNotificationSettings = { [weak self] body in self?.tray?.notificationSettings(body) }
            // ⌥Space, anywhere: ShuaCrew comes forward with the message box ready; again, it hides.
            hotKey = HotKey { [weak self] in Task { @MainActor in self?.summon() } }
            // ⌃⌥Space, anywhere: Spark, your desktop buddy, ready for a question about whatever you're looking at.
            buddyKey = HotKey(modifiers: UInt32(controlKey | optionKey)) { [weak self] in Task { @MainActor in self?.buddy.summon() } }
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

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { quiet }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { window.showWindow(nil) }
        return true
    }

    func applicationWillTerminate(_ notification: Notification) {
        window.rememberPath()
    }

    @objc private func quickAsk() { summon() }

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
        let screens: [(String, String, String)] = [
            ("Sessions", "1", "/"), ("Ventures", "2", "/ventures"), ("Crew", "3", "/crew"), ("Crew Floor", "4", "/floor"),
            ("Playbooks", "5", "/playbooks"), ("Library", "6", "/library"), ("Tools & Skills", "7", "/integrations"),
            ("Memory", "8", "/memory"), ("Policy & Audit", "9", "/policy"),
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
        let spark = item("Ask Spark", " ", #selector(askSpark))
        spark.keyEquivalentModifierMask = [.control, .option]
        windowMenu.addItem(spark)
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

MainActor.assumeIsolated {
    let app = NSApplication.shared
    let delegate = AppDelegate()
    app.delegate = delegate
    app.run()
}
