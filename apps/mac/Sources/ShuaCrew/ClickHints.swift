import AppKit
import ApplicationServices

/// Click hints: press ⌃⌥H and every button, link, tab, field and menu in the app you're using gets a short letter
/// tag; type it and Shua clicks it. You never reach for the mouse. Esc puts the tags away, Backspace takes a letter
/// back, holding ⇧ on the last letter right-clicks. Uses the same accessibility tree as Shua's hands, never touches
/// password managers, and clicks like a person (a real mouse click at the control's centre).
@MainActor
final class ClickHints {
    static let shared = ClickHints()

    private struct Target { let code: String; let frame: CGRect /* global, top-left origin */; let center: CGPoint }
    private final class KeyPanel: NSPanel { override var canBecomeKey: Bool { true } }

    private var panel: KeyPanel?
    private var view: HintView?
    private var targets: [Target] = []
    private var typed = ""
    private var monitor: Any?
    private static let letters = Array("ASDFGHJKLQWERTYUIOPZXCVBNM")
    private static let clickable: Set<String> = [kAXButtonRole, kAXMenuButtonRole, kAXCheckBoxRole, kAXRadioButtonRole, kAXPopUpButtonRole,
        kAXDisclosureTriangleRole, kAXTextFieldRole, kAXTextAreaRole, kAXComboBoxRole, kAXMenuBarItemRole, "AXLink", "AXTab", "AXSearchField"]

    var showing: Bool { panel != nil }
    var count: Int { targets.count }

    func toggle() { showing ? hide() : show() }

    func show(in chosen: NSRunningApplication? = nil) {
        guard AXIsProcessTrusted() else {
            let prompt = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
            _ = AXIsProcessTrustedWithOptions([prompt: true] as CFDictionary)
            return
        }
        guard let app = chosen ?? SparkHands.target, !SparkHands.offLimits.contains(app.bundleIdentifier ?? "") else { NSSound.beep(); return }
        let found = Self.collect(in: app)
        guard !found.isEmpty else { NSSound.beep(); return }
        // Top to bottom, left to right: the same place gets the same letters each time you look.
        let sorted = found.sorted { abs($0.minY - $1.minY) > 6 ? $0.minY < $1.minY : $0.minX < $1.minX }
        let codes = Self.codes(sorted.count)
        targets = zip(sorted, codes).map { Target(code: $1, frame: $0, center: CGPoint(x: $0.midX, y: $0.midY)) }
        typed = ""

        let union = NSScreen.screens.reduce(CGRect.null) { $0.union($1.frame) }
        let panel = KeyPanel(contentRect: union, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.level = .screenSaver
        panel.backgroundColor = .clear
        panel.isOpaque = false
        panel.hasShadow = false
        panel.ignoresMouseEvents = true
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        let primaryHeight = NSScreen.screens.first?.frame.height ?? union.height
        let view = HintView(frame: CGRect(origin: .zero, size: union.size))
        // Accessibility frames are top-left based on the primary display; the panel's view is bottom-left based on the union.
        view.tags = targets.map { t in (t.code, CGPoint(x: t.frame.minX - union.minX, y: primaryHeight - t.frame.minY - union.minY)) }
        panel.contentView = view
        panel.orderFrontRegardless()
        panel.makeKey()
        self.panel = panel
        self.view = view
        monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self, self.showing else { return event }
            self.key(event)
            return nil
        }
    }

    func hide() {
        if let monitor { NSEvent.removeMonitor(monitor) }
        monitor = nil
        panel?.orderOut(nil)
        panel = nil
        view = nil
        targets = []
        typed = ""
    }

    private func key(_ event: NSEvent) {
        if event.keyCode == 53 { hide(); return }                               // Esc
        if event.keyCode == 51 { typed = String(typed.dropLast()); view?.typed = typed; return } // Backspace
        guard let ch = event.charactersIgnoringModifiers?.uppercased().first, Self.letters.contains(ch) else { NSSound.beep(); return }
        let next = typed + String(ch)
        let matches = targets.filter { $0.code.hasPrefix(next) }
        guard !matches.isEmpty else { NSSound.beep(); return }
        typed = next
        view?.typed = typed
        if matches.count == 1, matches[0].code == typed {
            let hit = matches[0], right = event.modifierFlags.contains(.shift)
            hide()
            // The tags are gone before the click lands, so it reaches the control underneath.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { SparkHands.click(at: hit.center, right: right, count: 1) }
        }
    }

    /// "A".."Z" while they fit; two letters each beyond that (676 places).
    private static func codes(_ n: Int) -> [String] {
        if n <= letters.count { return letters.prefix(n).map { String($0) } }
        var out: [String] = []
        for a in letters { for b in letters { out.append(String([a, b])); if out.count == n { return out } } }
        return out
    }

    /// Every visible clickable thing in the app's front window and menu bar, as on-screen frames.
    private static func collect(in app: NSRunningApplication) -> [CGRect] {
        let root = AXUIElementCreateApplication(app.processIdentifier)
        // Chrome and Electron apps only build their web accessibility tree when an assistive app asks for it.
        AXUIElementSetAttributeValue(root, "AXManualAccessibility" as CFString, kCFBooleanTrue)
        var starts: [AXUIElement] = []
        for key in [kAXFocusedWindowAttribute, kAXMenuBarAttribute] {
            var v: CFTypeRef?
            if AXUIElementCopyAttributeValue(root, key as CFString, &v) == .success, let v { starts.append(v as! AXUIElement) }
        }
        let screens = NSScreen.screens.reduce(CGRect.null) { $0.union($1.frame) }
        var queue = starts, seen = 0, out: [CGRect] = []
        while !queue.isEmpty, seen < 4000, out.count < 300 {
            let el = queue.removeFirst(); seen += 1
            var role: CFTypeRef?
            AXUIElementCopyAttributeValue(el, kAXRoleAttribute as CFString, &role)
            if let role = role as? String, clickable.contains(role), let frame = frame(el), frame.width >= 6, frame.height >= 6,
               screens.contains(CGPoint(x: frame.midX, y: frame.midY)),
               !out.contains(where: { abs($0.midX - frame.midX) < 4 && abs($0.midY - frame.midY) < 4 }) {
                out.append(frame)
                if role == kAXMenuBarItemRole { continue } // a menu's items aren't on screen until it opens
            }
            var children: CFTypeRef?
            if AXUIElementCopyAttributeValue(el, kAXChildrenAttribute as CFString, &children) == .success, let list = children as? [AXUIElement] { queue.append(contentsOf: list) }
        }
        return out
    }

    private static func frame(_ el: AXUIElement) -> CGRect? {
        var pos: CFTypeRef?, size: CFTypeRef?
        guard AXUIElementCopyAttributeValue(el, kAXPositionAttribute as CFString, &pos) == .success,
              AXUIElementCopyAttributeValue(el, kAXSizeAttribute as CFString, &size) == .success else { return nil }
        var p = CGPoint.zero, s = CGSize.zero
        AXValueGetValue(pos as! AXValue, .cgPoint, &p); AXValueGetValue(size as! AXValue, .cgSize, &s)
        return CGRect(origin: p, size: s)
    }
}

/// The tags themselves: small, high-contrast pills at each control's top-left; the letters you've typed fade so the
/// one left to press stands out.
private final class HintView: NSView {
    var tags: [(String, CGPoint)] = [] { didSet { needsDisplay = true } }
    var typed = "" { didSet { needsDisplay = true } }
    override var isFlipped: Bool { false }

    override func draw(_ dirtyRect: NSRect) {
        let font = NSFont.monospacedSystemFont(ofSize: 11.5, weight: .bold)
        let accent = NSColor(srgbRed: 0.56, green: 0.38, blue: 1, alpha: 1)
        for (code, topLeft) in tags where typed.isEmpty || code.hasPrefix(typed) {
            let done = NSAttributedString(string: String(code.prefix(typed.count)), attributes: [.font: font, .foregroundColor: NSColor.white.withAlphaComponent(0.45)])
            let left = NSAttributedString(string: String(code.dropFirst(typed.count)), attributes: [.font: font, .foregroundColor: NSColor.white])
            let text = NSMutableAttributedString(attributedString: done); text.append(left)
            let size = text.size()
            let box = CGRect(x: topLeft.x - 4, y: topLeft.y - size.height - 2, width: size.width + 10, height: size.height + 4)
            let path = NSBezierPath(roundedRect: box, xRadius: 5, yRadius: 5)
            NSShadow().then { $0.shadowColor = NSColor.black.withAlphaComponent(0.45); $0.shadowBlurRadius = 6; $0.shadowOffset = NSSize(width: 0, height: -1) }.set()
            accent.setFill(); path.fill()
            NSShadow().set()
            NSColor.white.withAlphaComponent(0.35).setStroke(); path.lineWidth = 1; path.stroke()
            text.draw(at: CGPoint(x: box.minX + 5, y: box.minY + 2))
        }
    }
}

private extension NSShadow {
    func then(_ body: (NSShadow) -> Void) -> NSShadow { body(self); return self }
}
