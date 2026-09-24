import AppKit
import Carbon.HIToolbox
import WebKit

/// ⌥Space from anywhere: a frosted panel to hand the crew something, or clear what's waiting on
/// you, without leaving what you're doing. It takes your typing without bringing the app forward
/// (like Spotlight), floats over full-screen apps, and goes away when you click elsewhere.
@MainActor
final class QuickPanel: NSObject, WKScriptMessageHandler, NSWindowDelegate {
    private let panel: Panel
    private let web: WKWebView
    private let gateway: Gateway
    private let window: MainWindow
    private var loaded = false

    /// Borderless panels won't take keyboard focus unless they say they can.
    final class Panel: NSPanel {
        override var canBecomeKey: Bool { true }
        override var canBecomeMain: Bool { false }
    }

    init(gateway: Gateway, window: MainWindow) {
        self.gateway = gateway
        self.window = window
        let config = WKWebViewConfiguration()
        config.userContentController.addUserScript(WKUserScript(
            source: "document.documentElement.dataset.shell = 'mac'; document.documentElement.dataset.quick = '1';",
            injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.writingToolsBehavior = .none
        web = WKWebView(frame: .zero, configuration: config)
        web.setValue(false, forKey: "drawsBackground")

        panel = Panel(contentRect: NSRect(x: 0, y: 0, width: 680, height: 460), styleMask: [.borderless, .nonactivatingPanel, .fullSizeContentView], backing: .buffered, defer: false)
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .transient]
        panel.isMovableByWindowBackground = true
        panel.backgroundColor = .clear
        panel.isOpaque = false
        panel.hasShadow = true
        panel.hidesOnDeactivate = false

        let glass = NSVisualEffectView()
        glass.material = .hudWindow
        glass.blendingMode = .behindWindow
        glass.state = .active
        glass.appearance = NSAppearance(named: .darkAqua)
        glass.wantsLayer = true
        glass.layer?.cornerRadius = 18
        glass.layer?.masksToBounds = true
        glass.layer?.borderWidth = 1
        glass.layer?.borderColor = NSColor.white.withAlphaComponent(0.12).cgColor
        panel.contentView = glass
        web.translatesAutoresizingMaskIntoConstraints = false
        glass.addSubview(web)
        NSLayoutConstraint.activate([
            web.leadingAnchor.constraint(equalTo: glass.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: glass.trailingAnchor),
            web.topAnchor.constraint(equalTo: glass.topAnchor),
            web.bottomAnchor.constraint(equalTo: glass.bottomAnchor),
        ])
        super.init()
        config.userContentController.add(self, name: "shuacrew")
        panel.delegate = self
    }

    func toggle() {
        panel.isVisible ? hide() : show()
    }

    func show() {
        if !loaded {
            web.load(URLRequest(url: gateway.base.appending(path: "quick")))
            loaded = true
        } else {
            web.evaluateJavaScript("window.dispatchEvent(new Event('shuacrew:quick-open'))")
        }
        // On the screen you're looking at: centred, a third of the way down.
        let screen = NSScreen.screens.first { NSMouseInRect(NSEvent.mouseLocation, $0.frame, false) } ?? NSScreen.main
        if let frame = screen?.visibleFrame {
            let size = panel.frame.size
            panel.setFrameOrigin(NSPoint(x: frame.midX - size.width / 2, y: frame.maxY - frame.height / 3.2 - size.height / 2))
        }
        panel.makeKeyAndOrderFront(nil)
        panel.makeFirstResponder(web)
    }

    func hide() {
        panel.orderOut(nil)
    }

    func windowDidResignKey(_ notification: Notification) { hide() }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "quickClose":
            hide()
        case "quickOpen":
            hide()
            NSApp.activate()
            window.showWindow(nil)
            if let path = body["path"] as? String { window.navigate(path) }
        case "quickResize":
            if let height = body["height"] as? Double {
                var frame = panel.frame
                let h = min(max(CGFloat(height), 120), 620)
                frame.origin.y += frame.height - h // grow downward, keep the top edge where it is
                frame.size.height = h
                panel.setFrame(frame, display: true, animate: false)
            }
        default:
            break
        }
    }
}

/// A system-wide shortcut through Carbon's hot-key API: no Accessibility permission, and it works
/// while another app is in front.
final class HotKey {
    private var ref: EventHotKeyRef?
    private var handler: EventHandlerRef?
    private let action: () -> Void

    init(keyCode: UInt32 = UInt32(kVK_Space), modifiers: UInt32 = UInt32(optionKey), action: @escaping () -> Void) {
        self.action = action
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let me = Unmanaged.passUnretained(self).toOpaque()
        InstallEventHandler(GetApplicationEventTarget(), { _, _, user in
            guard let user else { return noErr }
            let hotKey = Unmanaged<HotKey>.fromOpaque(user).takeUnretainedValue()
            DispatchQueue.main.async { hotKey.action() }
            return noErr
        }, 1, &spec, me, &handler)
        let id = EventHotKeyID(signature: OSType(0x5348_5541), id: 1) // "SHUA"
        RegisterEventHotKey(keyCode, modifiers, id, GetApplicationEventTarget(), 0, &ref)
    }

    deinit {
        if let ref { UnregisterEventHotKey(ref) }
        if let handler { RemoveEventHandler(handler) }
    }
}
