import AppKit
import ApplicationServices
import Carbon.HIToolbox

/// Spark's hands: mouse, keyboard, music, system and your Shortcuts.
/// Every action is checked here; the page only proposes. Mouse and keyboard need macOS Accessibility permission.
@MainActor
enum SparkHands {
    /// Apps Spark never types into or clicks around in, whatever the model asks.
    static let offLimits: Set<String> = ["com.agilebits.onepassword7", "com.1password.1password", "com.bitwarden.desktop", "com.apple.keychainaccess", "com.lastpass.LastPass", "com.apple.Passwords"]

    static var trusted: Bool { AXIsProcessTrusted() }
    static func askForAccess() { _ = AXIsProcessTrustedWithOptions(["AXTrustedCheckOptionPrompt": true] as CFDictionary) }

    // MARK: mouse & keyboard

    /// Screenshot fractions (from the top-left of `screen`) to the global event space (origin top-left of the main display).
    static func eventPoint(x: Double, y: Double, on screen: NSScreen) -> CGPoint {
        let f = screen.frame, mainHeight = NSScreen.screens.first?.frame.height ?? f.height
        let appKit = CGPoint(x: f.minX + x * f.width, y: f.maxY - y * f.height)
        return CGPoint(x: appKit.x, y: mainHeight - appKit.y)
    }

    static func act(_ a: [String: Any], screen: NSScreen) -> (ok: Bool, message: String) {
        guard trusted else { askForAccess(); return (false, "Spark needs Accessibility access: System Settings → Privacy & Security → Accessibility → turn on ShuaCrew, then ask again.") }
        if let front = NSWorkspace.shared.frontmostApplication?.bundleIdentifier, offLimits.contains(front) {
            return (false, "Spark doesn't touch password managers.")
        }
        let num = { (k: String) -> Double? in (a[k] as? Double).flatMap { (0...1).contains($0) ? $0 : nil } }
        switch a["type"] as? String {
        case "click":
            guard let x = num("x"), let y = num("y") else { return (false, "No place to click.") }
            let p = eventPoint(x: x, y: y, on: screen)
            let right = a["button"] as? String == "right", count = (a["double"] as? Bool ?? false) ? 2 : 1
            click(at: p, right: right, count: count)
            return (true, "\(count == 2 ? "Double-clicked" : right ? "Right-clicked" : "Clicked") \((a["label"] as? String).map { "“\($0)”" } ?? "")")
        case "type":
            guard let text = a["text"] as? String, !text.isEmpty, text.count <= 2000 else { return (false, "Nothing to type.") }
            if focusedIsSecure() { return (false, "That's a password field. Spark won't type there.") }
            type(text)
            return (true, "Typed \(text.count) characters")
        case "key":
            guard let combo = a["keys"] as? String, let (code, flags) = parseKeys(combo) else { return (false, "Unknown keys.") }
            press(code, flags: flags)
            return (true, "Pressed \(combo)")
        case "scroll":
            let p = num("x").flatMap { x in num("y").map { eventPoint(x: x, y: $0, on: screen) } }
            if let p { CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap) }
            let amount = max(-30, min(30, Int(a["amount"] as? Double ?? -5)))
            CGEvent(scrollWheelEvent2Source: nil, units: .line, wheelCount: 1, wheel1: Int32(amount), wheel2: 0, wheel3: 0)?.post(tap: .cghidEventTap)
            return (true, "Scrolled \(amount < 0 ? "down" : "up")")
        default:
            return (false, "Spark can't do that.")
        }
    }

    private static func click(at p: CGPoint, right: Bool, count: Int) {
        let (down, up, button): (CGEventType, CGEventType, CGMouseButton) = right ? (.rightMouseDown, .rightMouseUp, .right) : (.leftMouseDown, .leftMouseUp, .left)
        CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: p, mouseButton: button)?.post(tap: .cghidEventTap)
        usleep(40_000)
        for n in 1...count {
            for type in [down, up] {
                let e = CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: p, mouseButton: button)
                e?.setIntegerValueField(.mouseEventClickState, value: Int64(n))
                e?.post(tap: .cghidEventTap)
                usleep(18_000)
            }
        }
    }

    private static func type(_ text: String) {
        // Unicode events type any character, whatever the keyboard layout; small chunks so apps keep up.
        let units = Array(text.utf16)
        var i = 0
        while i < units.count {
            let chunk = Array(units[i..<min(i + 16, units.count)])
            for keyDown in [true, false] {
                let e = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: keyDown)
                e?.keyboardSetUnicodeString(stringLength: chunk.count, unicodeString: chunk)
                e?.post(tap: .cghidEventTap)
            }
            usleep(12_000)
            i += 16
        }
    }

    private static func press(_ code: CGKeyCode, flags: CGEventFlags) {
        for keyDown in [true, false] {
            let e = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: keyDown)
            e?.flags = flags
            e?.post(tap: .cghidEventTap)
            usleep(15_000)
        }
    }

    /// "cmd+shift+4", "return", "esc", "cmd+space", "down"…
    static func parseKeys(_ combo: String) -> (CGKeyCode, CGEventFlags)? {
        var flags: CGEventFlags = []
        var key: CGKeyCode?
        let named: [String: Int] = ["return": kVK_Return, "enter": kVK_Return, "tab": kVK_Tab, "space": kVK_Space, "delete": kVK_Delete, "backspace": kVK_Delete,
            "escape": kVK_Escape, "esc": kVK_Escape, "left": kVK_LeftArrow, "right": kVK_RightArrow, "up": kVK_UpArrow, "down": kVK_DownArrow,
            "home": kVK_Home, "end": kVK_End, "pageup": kVK_PageUp, "pagedown": kVK_PageDown, "f5": kVK_F5,
            "a": kVK_ANSI_A, "b": kVK_ANSI_B, "c": kVK_ANSI_C, "d": kVK_ANSI_D, "e": kVK_ANSI_E, "f": kVK_ANSI_F, "g": kVK_ANSI_G, "h": kVK_ANSI_H, "i": kVK_ANSI_I,
            "j": kVK_ANSI_J, "k": kVK_ANSI_K, "l": kVK_ANSI_L, "m": kVK_ANSI_M, "n": kVK_ANSI_N, "o": kVK_ANSI_O, "p": kVK_ANSI_P, "q": kVK_ANSI_Q, "r": kVK_ANSI_R,
            "s": kVK_ANSI_S, "t": kVK_ANSI_T, "u": kVK_ANSI_U, "v": kVK_ANSI_V, "w": kVK_ANSI_W, "x": kVK_ANSI_X, "y": kVK_ANSI_Y, "z": kVK_ANSI_Z,
            "0": kVK_ANSI_0, "1": kVK_ANSI_1, "2": kVK_ANSI_2, "3": kVK_ANSI_3, "4": kVK_ANSI_4, "5": kVK_ANSI_5, "6": kVK_ANSI_6, "7": kVK_ANSI_7, "8": kVK_ANSI_8, "9": kVK_ANSI_9,
            ",": kVK_ANSI_Comma, ".": kVK_ANSI_Period, "/": kVK_ANSI_Slash, "-": kVK_ANSI_Minus, "=": kVK_ANSI_Equal, "[": kVK_ANSI_LeftBracket, "]": kVK_ANSI_RightBracket]
        for part in combo.lowercased().split(separator: "+").map({ $0.trimmingCharacters(in: .whitespaces) }) {
            switch part {
            case "cmd", "command", "⌘": flags.insert(.maskCommand)
            case "shift", "⇧": flags.insert(.maskShift)
            case "opt", "option", "alt", "⌥": flags.insert(.maskAlternate)
            case "ctrl", "control", "⌃": flags.insert(.maskControl)
            default: guard let k = named[part], key == nil else { return nil }; key = CGKeyCode(k)
            }
        }
        // ⌘Q quits whatever is in front; Spark leaves that to you.
        if key == CGKeyCode(kVK_ANSI_Q) && flags.contains(.maskCommand) { return nil }
        return key.map { ($0, flags) }
    }

    /// Is keyboard focus in a password field? Then Spark never types.
    private static func focusedIsSecure() -> Bool {
        let system = AXUIElementCreateSystemWide()
        var focused: CFTypeRef?
        guard AXUIElementCopyAttributeValue(system, kAXFocusedUIElementAttribute as CFString, &focused) == .success, let element = focused else { return false }
        var role: CFTypeRef?
        AXUIElementCopyAttributeValue(element as! AXUIElement, kAXSubroleAttribute as CFString, &role)
        return (role as? String) == kAXSecureTextFieldSubrole
    }

    // MARK: music, system, Shortcuts

    static func media(_ a: [String: Any]) -> (ok: Bool, message: String) {
        let command = a["command"] as? String ?? "toggle"
        if command.hasPrefix("volume") {
            let level = max(0, min(100, Int(a["level"] as? Double ?? (command == "volume_up" ? -1 : command == "volume_down" ? -2 : 50))))
            let script = level == -1 ? "set volume output volume ((output volume of (get volume settings)) + 12)" : level == -2 ? "set volume output volume ((output volume of (get volume settings)) - 12)" : "set volume output volume \(level)"
            return run(script) ? (true, "Volume \(level >= 0 ? "\(level)%" : command == "volume_up" ? "up" : "down")") : (false, "Couldn't change the volume.")
        }
        if command == "mute" { return run("set volume with output muted") ? (true, "Muted") : (false, "Couldn't mute.") }
        let app = ["spotify": "Spotify", "music": "Music"][(a["app"] as? String ?? "").lowercased()] ?? runningPlayer() ?? "Music"
        if command == "play_query", let q = (a["query"] as? String)?.trimmingCharacters(in: .whitespaces), !q.isEmpty {
            let safe = q.replacingOccurrences(of: "\\", with: "").replacingOccurrences(of: "\"", with: "")
            if app == "Spotify" {
                let term = safe.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? safe
                NSWorkspace.shared.open(URL(string: "spotify:search:\(term)")!)
                return (true, "Searching Spotify for “\(safe)”")
            }
            let script = """
            tell application "Music"
              set hits to (every track of library playlist 1 whose name contains "\(safe)" or artist contains "\(safe)" or album contains "\(safe)")
              if (count of hits) > 0 then
                play item 1 of hits
                return "ok"
              end if
            end tell
            return "none"
            """
            if runResult(script) == "ok" { return (true, "Playing “\(safe)” in Music") }
            let term = safe.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? safe
            NSWorkspace.shared.open(URL(string: "https://music.apple.com/search?term=\(term)")!)
            return (true, "Not in your library, so I opened Apple Music search for “\(safe)”")
        }
        let verb = ["play": "play", "pause": "pause", "toggle": "playpause", "next": "next track", "previous": "previous track"][command] ?? "playpause"
        return run("tell application \"\(app)\" to \(verb)") ? (true, "\(app): \(command)") : (false, "Couldn't control \(app). Allow ShuaCrew in Privacy & Security → Automation.")
    }

    static func system(_ a: [String: Any]) -> (ok: Bool, message: String) {
        switch a["what"] as? String {
        case "dark_mode":
            let on = a["on"] as? Bool
            let script = on == nil ? "tell application \"System Events\" to tell appearance preferences to set dark mode to not dark mode" : "tell application \"System Events\" to tell appearance preferences to set dark mode to \(on! ? "true" : "false")"
            return run(script) ? (true, "Dark mode \(on == nil ? "toggled" : on! ? "on" : "off")") : (false, "Couldn't change appearance. Allow ShuaCrew to control System Events in Privacy & Security → Automation.")
        case "sleep_display":
            let p = Process(); p.executableURL = URL(fileURLWithPath: "/usr/bin/pmset"); p.arguments = ["displaysleepnow"]
            return (try? p.run()) != nil ? (true, "Display sleeping") : (false, "Couldn't sleep the display.")
        default:
            return (false, "Spark can't change that.")
        }
    }

    /// Your Shortcuts: anything you've automated, Spark can run by name.
    static func shortcut(_ a: [String: Any]) async -> (ok: Bool, message: String) {
        guard let name = (a["name"] as? String)?.trimmingCharacters(in: .whitespaces), !name.isEmpty, name.count < 120 else { return (false, "Which Shortcut?") }
        return await withCheckedContinuation { done in
            let p = Process()
            p.executableURL = URL(fileURLWithPath: "/usr/bin/shortcuts")
            p.arguments = ["run", name]
            p.terminationHandler = { proc in done.resume(returning: proc.terminationStatus == 0 ? (true, "Ran “\(name)”") : (false, "Couldn't run the Shortcut “\(name)”. Check the name in the Shortcuts app.")) }
            do { try p.run() } catch { done.resume(returning: (false, "Shortcuts isn't available.")) }
        }
    }

    static func shortcutNames() -> [String] {
        let p = Process(), out = Pipe()
        p.executableURL = URL(fileURLWithPath: "/usr/bin/shortcuts"); p.arguments = ["list"]; p.standardOutput = out
        guard (try? p.run()) != nil else { return [] }
        p.waitUntilExit()
        return String(data: out.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?.split(separator: "\n").map(String.init).prefix(80).map { $0 } ?? []
    }

    private static func runningPlayer() -> String? {
        let ids = NSWorkspace.shared.runningApplications.compactMap(\.bundleIdentifier)
        return ids.contains("com.spotify.client") ? "Spotify" : ids.contains("com.apple.Music") ? "Music" : nil
    }
    @discardableResult private static func run(_ source: String) -> Bool { runResult(source) != nil }
    private static func runResult(_ source: String) -> String? {
        var error: NSDictionary?
        let result = NSAppleScript(source: source)?.executeAndReturnError(&error)
        return error == nil ? (result?.stringValue ?? "") : nil
    }
}
