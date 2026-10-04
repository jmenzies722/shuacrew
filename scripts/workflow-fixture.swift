// Local test fixture; no network, files, credentials, or other app control.
import AppKit
final class Fixture: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    let input = NSTextField(string: "")
    let prepare = NSButton(title: "Prepare", target: nil, action: nil)
    let finish = NSButton(title: "Finish", target: nil, action: nil)
    let done = NSButton(title: "Verified", target: nil, action: nil)
    func applicationDidFinishLaunching(_ notification: Notification) {
        window = NSWindow(contentRect: NSRect(x: 150, y: 160, width: 480, height: 220), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.title = "Shua Workflow Test"
        let stack = NSStackView(); stack.orientation = .vertical; stack.spacing = 16; stack.translatesAutoresizingMaskIntoConstraints = false
        let title = NSTextField(labelWithString: "Record: Prepare → type a value → Finish")
        prepare.target = self; prepare.action = #selector(start); prepare.setAccessibilityIdentifier("workflow.prepare")
        input.placeholderString = "Workflow input"; input.setAccessibilityIdentifier("workflow.input"); input.setAccessibilityLabel("Workflow input")
        finish.target = self; finish.action = #selector(end); finish.setAccessibilityIdentifier("workflow.finish")
        done.setAccessibilityIdentifier("workflow.verified"); done.isHidden = true
        [title, prepare, input, finish, done].forEach { stack.addArrangedSubview($0) }
        input.isHidden = true; finish.isHidden = true
        window.contentView!.addSubview(stack)
        NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo: window.contentView!.leadingAnchor, constant: 24), stack.trailingAnchor.constraint(equalTo: window.contentView!.trailingAnchor, constant: -24), stack.centerYAnchor.constraint(equalTo: window.contentView!.centerYAnchor)])
        window.makeKeyAndOrderFront(nil); NSApp.activate()
        if CommandLine.arguments.contains("--demo") {
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) { self.demonstrate() }
        }
    }
    // End-to-end recorder probe: actual HID events, restricted to this disposable app's controls.
    // CUA's AX actions can bypass AppKit's global event monitors, so they are not a hardware-event test.
    func point(_ view: NSView) -> CGPoint {
        let local = view.convert(NSPoint(x: view.bounds.midX, y: view.bounds.midY), to: nil)
        let screen = window.convertPoint(toScreen: local)
        return CGPoint(x: screen.x, y: NSScreen.screens[0].frame.height - screen.y)
    }
    func clickOwn(_ view: NSView) {
        guard NSApp.isActive, NSWorkspace.shared.frontmostApplication?.processIdentifier == ProcessInfo.processInfo.processIdentifier else { return }
        let p = point(view)
        for kind in [CGEventType.leftMouseDown, .leftMouseUp] { CGEvent(mouseEventSource: nil, mouseType: kind, mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap) }
    }
    func demonstrate() {
        NSApp.activate(); clickOwn(prepare)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
            guard NSApp.isActive, !self.input.isHidden else { return }
            for unit in Array("fixture demonstration".utf16) {
                var value = unit
                for down in [true, false] { let event = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: down); event?.keyboardSetUnicodeString(stringLength: 1, unicodeString: &value); event?.post(tap: .cghidEventTap) }
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { self.clickOwn(self.finish) }
        }
    }
    @objc func start() { input.stringValue = ""; input.isHidden = false; finish.isHidden = false; done.isHidden = true; window.makeFirstResponder(input) }
    @objc func end() { done.isHidden = false; window.makeFirstResponder(done) }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}
let app = NSApplication.shared
let delegate = Fixture(); app.delegate = delegate; app.setActivationPolicy(.regular); app.run()
