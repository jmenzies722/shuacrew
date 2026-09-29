import AppKit
import ApplicationServices
import Carbon.HIToolbox
import ShuaCrewCore

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
            var p = eventPoint(x: x, y: y, on: screen), note = ""
            let right = a["button"] as? String == "right", count = (a["double"] as? Bool ?? false) ? 2 : 1
            // Check before clicking: what's under that spot NOW? The screen may have changed since Spark looked.
            if let label = (a["label"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !label.isEmpty {
                switch SparkPress.verify(label: label, at: p) {
                case .confirmed, .unknown: break                                   // it's there (or this app can't tell us): click
                case .moved(let now): p = now; note = " (it had moved, so I clicked where it is now)"
                case .gone(let there):
                    return (false, "Didn't click: “\(label)” isn't where it was\(there.map { " — that spot is now “\($0)”" } ?? ""). Take a fresh look before the next step.")
                }
            }
            click(at: p, right: right, count: count)
            return (true, "\(count == 2 ? "Double-clicked" : right ? "Right-clicked" : "Clicked") \((a["label"] as? String).map { "“\($0)”" } ?? "")\(note)")
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

    /// Every Music/Spotify AppleScript runs here, one at a time and never on the main thread: an app that's slow to
    /// answer (Music once took 120 s) used to freeze the notch and the whole UI until it gave up. Each call is also
    /// capped at 2 s, and a player that stops answering is left alone for a minute.
    nonisolated static let musicQueue = DispatchQueue(label: "shuacrew.music", qos: .userInitiated)
    nonisolated(unsafe) private static var quietUntil: [String: Date] = [:]
    nonisolated private static func timed(_ app: String, _ body: String) -> String? {
        if let until = quietUntil[app], until > Date() { return nil }
        var error: NSDictionary?
        let result = NSAppleScript(source: "with timeout of 2 seconds\n\(body)\nend timeout")?.executeAndReturnError(&error)
        if let code = error?[NSAppleScript.errorNumber] as? Int, code == -1712 || code == -600 { quietUntil[app] = Date().addingTimeInterval(60) }
        return error == nil ? (result?.stringValue ?? "") : nil
    }

    nonisolated static func media(_ a: [String: Any]) -> (ok: Bool, message: String) {
        let command = a["command"] as? String ?? "toggle"
        if command.hasPrefix("volume") {
            let level = max(0, min(100, Int(a["level"] as? Double ?? (command == "volume_up" ? -1 : command == "volume_down" ? -2 : 50))))
            let script = level == -1 ? "set volume output volume ((output volume of (get volume settings)) + 12)" : level == -2 ? "set volume output volume ((output volume of (get volume settings)) - 12)" : "set volume output volume \(level)"
            return runResult(script) != nil ? (true, "Volume \(level >= 0 ? "\(level)%" : command == "volume_up" ? "up" : "down")") : (false, "Couldn't change the volume.")
        }
        if command == "mute" { return runResult("set volume with output muted") != nil ? (true, "Muted") : (false, "Couldn't mute.") }
        let asked = ["spotify": "Spotify", "music": "Music"][(a["app"] as? String ?? "").lowercased()]
        // Never claim Spotify when it isn't installed: say so if you asked for it by name, otherwise use Music.
        let hasSpotify = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.spotify.client") != nil
        if asked == "Spotify" && !hasSpotify { return (false, "Spotify isn't installed on this Mac, so I can't use it. I can play it in Apple Music instead.") }
        let app = asked ?? runningPlayer() ?? "Music"
        // Apple Music (and Spotify where it allows): playlists, shuffle, repeat, favourite, add to library, seek.
        let safeQuery = ((a["query"] as? String) ?? "").replacingOccurrences(of: "\\", with: "").replacingOccurrences(of: "\"", with: "").trimmingCharacters(in: .whitespaces)
        switch command {
        case "playlist":
            guard !safeQuery.isEmpty else { return (false, "Which playlist?") }
            if app == "Spotify" {
                NSWorkspace.shared.open(URL(string: "spotify:search:\(safeQuery.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? safeQuery)")!)
                return (true, "Spotify doesn't let apps start playlists by name, so I searched for “\(safeQuery)”.")
            }
            let r = timed("Music", """
            tell application "Music"
              set hits to (every user playlist whose name contains "\(safeQuery)")
              if (count of hits) = 0 then return "none"
              play item 1 of hits
              return name of item 1 of hits
            end tell
            """)
            return r == nil ? (false, "Music didn't answer.") : r == "none" ? (false, "You don't have a playlist called “\(safeQuery)”.") : (true, "Playing your \(r!) playlist.")
        case "shuffle":
            let on = a["on"] as? Bool ?? true
            let ok = timed(app, app == "Spotify" ? "tell application \"Spotify\" to set shuffling to \(on)" : "tell application \"Music\" to set shuffle enabled to \(on)") != nil
            return ok ? (true, "Shuffle \(on ? "on" : "off").") : (false, "\(app) didn't answer.")
        case "repeat":
            let mode = ["off", "one", "all"].contains(a["mode"] as? String ?? "") ? a["mode"] as! String : "all"
            let ok = timed(app, app == "Spotify" ? "tell application \"Spotify\" to set repeating to \(mode != "off")" : "tell application \"Music\" to set song repeat to \(mode)") != nil
            return ok ? (true, mode == "off" ? "Repeat off." : mode == "one" ? (app == "Spotify" ? "Repeat on." : "Repeating this song.") : "Repeat on.") : (false, "\(app) didn't answer.")
        case "love":
            guard app == "Music" else { return (false, "Spotify doesn't let apps like songs; tap the heart in Spotify.") }
            let ok = timed("Music", "tell application \"Music\" to set favorited of current track to true") != nil || timed("Music", "tell application \"Music\" to set loved of current track to true") != nil
            return ok ? (true, "Added to your favourites.") : (false, "Couldn't favourite this song.")
        case "add_to_library":
            guard app == "Music" else { return (false, "Spotify doesn't let apps save songs; tap the plus in Spotify.") }
            let r = timed("Music", "tell application \"Music\" to duplicate current track to source \"Library\"")
            return r != nil ? (true, "Added to your library.") : (false, "Music wouldn't add this one from here; use ⋯ → Add to Library.")
        case "play_similar":
            // "Another song", "something like this": from YOUR library, chosen here, never a song the model remembers
            // (those usually aren't yours, and no app may start a catalog song). Same artist, then same genre, then
            // anything of yours; never the song already playing. by: "vibe" skips straight to the genre.
            guard app == "Music" else { return timed(app, "tell application \"\(app)\" to next track") != nil ? (true, "Skipped to the next song.") : (false, "\(app) didn't answer.") }
            let sameArtist = (a["by"] as? String) != "vibe"
            // A mood ("something chill") is a set of genres in your own library; no match falls through to the rest.
            let genres = SongMatch.moodGenres((a["mood"] as? String) ?? "").map { "genre contains \"\($0)\"" }.joined(separator: " or ")
            let r = timed("Music", """
            tell application "Music"
              set pool to {}
              set pid to ""
              \(genres.isEmpty ? "" : "set pool to (every track of library playlist 1 whose \(genres))")
              if (count of pool) = 0 then
                try
                  set cur to current track
                  set pid to persistent ID of cur
                  if \(sameArtist) then set pool to (every track of library playlist 1 whose artist is (artist of cur) and persistent ID is not pid)
                  if (count of pool) = 0 and (genre of cur) is not "" then set pool to (every track of library playlist 1 whose genre is (genre of cur) and persistent ID is not pid)
                end try
              end if
              if (count of pool) = 0 then
                if (count of tracks of library playlist 1) = 0 then return "none"
                set t to some track of library playlist 1
              else
                set t to some item of pool
              end if
              play t
              return (name of t) & " by " & (artist of t)
            end tell
            """)
            return r == nil ? (false, "Music didn't answer.") : r == "none" ? (false, "Your Music library is empty, so there's nothing of yours to play.") : (true, "Playing “\(r!)” from your library.")
        case "seek":
            let seconds = max(0, min(36_000, a["seconds"] as? Double ?? 0))
            return timed(app, "tell application \"\(app)\" to set player position to \(Int(seconds))") != nil ? (true, "Skipped to \(Int(seconds) / 60):\(String(format: "%02d", Int(seconds) % 60)).") : (false, "\(app) didn't answer.")
        default: break
        }
        // Open (not play) an artist, album or search: Spotify through its own search link; Music by handing the Apple
        // Music link straight to the Music app, so it opens there rather than in a browser.
        if command == "open_query", let q = (a["query"] as? String)?.trimmingCharacters(in: .whitespaces), !q.isEmpty {
            let term = q.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? q
            if app == "Spotify" || (a["app"] as? String)?.lowercased() == "spotify" {
                NSWorkspace.shared.open(URL(string: "spotify:search:\(term)")!)
                return (true, "Opening \(q) in Spotify.")
            }
            let link = URL(string: "https://music.apple.com/search?term=\(term)")!
            if let music = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.apple.Music") {
                NSWorkspace.shared.open([link], withApplicationAt: music, configuration: NSWorkspace.OpenConfiguration())
            } else { NSWorkspace.shared.open(link) }
            return (true, "Opening \(q) in Music.")
        }
        if command == "play_query", let q = (a["query"] as? String)?.trimmingCharacters(in: .whitespaces), !q.isEmpty {
            let safe = q.replacingOccurrences(of: "\\", with: "").replacingOccurrences(of: "\"", with: "")
            if app == "Spotify" {
                let term = safe.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? safe
                NSWorkspace.shared.open(URL(string: "spotify:search:\(term)")!)
                return (true, "Searching Spotify for “\(safe)”")
            }
            // 1. Your library, if the ask is an artist, album or title as you'd type it ("Drake", "Views").
            let script = """
            tell application "Music"
              set hits to (every track of library playlist 1 whose name contains "\(safe)" or artist contains "\(safe)" or album contains "\(safe)" or genre contains "\(safe)")
              if (count of hits) > 0 then
                -- A title you named plays that song; an artist or album plays a different one of theirs each time.
                set exact to (every track of library playlist 1 whose name is "\(safe)")
                if (count of exact) > 0 then
                  set t to item 1 of exact
                else
                  set t to some item of hits
                  try
                    if (count of hits) > 1 and persistent ID of t is (persistent ID of current track) then set t to some item of hits
                  end try
                end if
                play t
                return (name of t) & " by " & (artist of t)
              end if
            end tell
            return "none"
            """
            if let r = timed("Music", script), r != "none" { return (true, "Playing “\(r)”.") }
            // 2. The exact song, from Apple's catalog: fixes misheard names ("Sleepy Hollow" → Sleepy Hallow) and splits
            //    "Ain't Nun by Sleepy Hallow" into title and artist, then plays it from your library if it's there.
            if let song = catalogSong(safe) {
                let title = SongMatch.coreTitle(song.title).replacingOccurrences(of: "\"", with: ""), artist = (song.artist.components(separatedBy: CharacterSet(charactersIn: "&,")).first ?? song.artist).trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "\"", with: "")
                let exact = """
                tell application "Music"
                  set hits to (every track of library playlist 1 whose name contains "\(title)" and artist contains "\(artist)")
                  if (count of hits) > 0 then
                    play item 1 of hits
                    return "ok"
                  end if
                end tell
                return "none"
                """
                if timed("Music", exact) == "ok" { return (true, "Playing “\(song.title)” by \(song.artist).") }
                // 3. Not in your library: Apple doesn't let any app start a catalog song, so open that exact song in Music.
                if let link = song.link, let url = URL(string: link.replacingOccurrences(of: "https://", with: "music://")),
                   let music = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.apple.Music") {
                    // Quietly, behind what you're doing: Music doesn't jump in front or take over the screen.
                    let quiet = NSWorkspace.OpenConfiguration(); quiet.activates = false
                    NSWorkspace.shared.open([url], withApplicationAt: music, configuration: quiet)
                    return (true, "“\(song.title)” by \(song.artist) isn't in your library, so it's waiting in Music, just press play there. Add it to your library and I'll play it straight away next time.")
                }
            }
            // Nothing by that name anywhere: say so, and don't pop a Music search window open on you every time.
            return (false, "I couldn't find “\(safe)” in your library or on Apple Music.")
        }
        let verb = ["play": "play", "pause": "pause", "toggle": "playpause", "next": "next track", "previous": "previous track"][command] ?? "playpause"
        return timed(app, "tell application \"\(app)\" to \(verb)") != nil ? (true, "\(app): \(command)") : (false, "\(app) didn't answer. If it asks, allow ShuaCrew in Privacy & Security → Automation.")
    }

    /// The song someone meant, from Apple's public catalog search (no account needed, 3 s at most).
    nonisolated static func catalogSong(_ query: String) -> (title: String, artist: String, link: String?)? {
        var c = URLComponents(string: "https://itunes.apple.com/search")!
        c.queryItems = [URLQueryItem(name: "term", value: query), URLQueryItem(name: "entity", value: "song"), URLQueryItem(name: "limit", value: "10"),
                        URLQueryItem(name: "country", value: Locale.current.region?.identifier ?? "US")]
        guard let url = c.url else { return nil }
        let done = DispatchSemaphore(value: 0)
        nonisolated(unsafe) var body: Data?
        URLSession.shared.dataTask(with: URLRequest(url: url, timeoutInterval: 3)) { d, _, _ in body = d; done.signal() }.resume()
        guard done.wait(timeout: .now() + 3.5) == .success, let body,
              let json = try? JSONSerialization.jsonObject(with: body) as? [String: Any], let results = json["results"] as? [[String: Any]] else { return nil }
        let candidates = results.map { SongMatch.Candidate(title: $0["trackName"] as? String ?? "", artist: $0["artistName"] as? String ?? "") }
        guard let i = SongMatch.best(for: query, in: candidates) else { return nil }
        return (candidates[i].title, candidates[i].artist, results[i]["trackViewUrl"] as? String)
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
        case "volume", "volume_up", "volume_down":
            let level = max(0, min(100, a["level"] as? Int ?? 50))
            let script = a["what"] as? String == "volume" ? "set volume output volume \(level)" : "set volume output volume ((output volume of (get volume settings)) \(a["what"] as? String == "volume_up" ? "+" : "-") 12)"
            return run(script) ? (true, a["what"] as? String == "volume" ? "Volume \(level)%" : "Volume \(a["what"] as? String == "volume_up" ? "up" : "down")") : (false, "Couldn't change the volume.")
        case "mute":
            let on = a["on"] as? Bool ?? true
            return run("set volume output muted \(on)") ? (true, on ? "Muted" : "Unmuted") : (false, "Couldn't change mute.")
        case "lock":
            // The real lock (⌃⌘Q) when Spark may press keys; otherwise the display sleeps, which locks if your Mac asks for a password.
            if trusted, run("tell application \"System Events\" to keystroke \"q\" using {control down, command down}") { return (true, "Locked") }
            let p = Process(); p.executableURL = URL(fileURLWithPath: "/usr/bin/pmset"); p.arguments = ["displaysleepnow"]
            return (try? p.run()) != nil ? (true, "Screen off (it locks if your Mac asks for a password after sleep)") : (false, "Couldn't lock the screen.")
        case "screenshot":
            let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd 'at' HH.mm.ss"
            let path = NSHomeDirectory() + "/Desktop/Screenshot \(f.string(from: Date())).png"
            let p = Process(); p.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture"); p.arguments = ["-x", path]
            guard (try? p.run()) != nil else { return (false, "Couldn't take a screenshot. Allow ShuaCrew in Privacy & Security → Screen Recording.") }
            p.waitUntilExit()
            return p.terminationStatus == 0 ? (true, "Screenshot saved to your Desktop") : (false, "Couldn't take a screenshot. Allow ShuaCrew in Privacy & Security → Screen Recording.")
        case "wifi":
            let on = a["on"] as? Bool ?? true
            let ports = Process(), pipe = Pipe(); ports.executableURL = URL(fileURLWithPath: "/usr/sbin/networksetup"); ports.arguments = ["-listallhardwareports"]; ports.standardOutput = pipe
            try? ports.run(); ports.waitUntilExit()
            let listing = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            let device = listing.components(separatedBy: "Hardware Port: Wi-Fi").dropFirst().first?.components(separatedBy: "Device: ").dropFirst().first?.components(separatedBy: "\n").first ?? "en0"
            let p = Process(); p.executableURL = URL(fileURLWithPath: "/usr/sbin/networksetup"); p.arguments = ["-setairportpower", device, on ? "on" : "off"]
            guard (try? p.run()) != nil else { return (false, "Couldn't change Wi-Fi.") }
            p.waitUntilExit()
            return p.terminationStatus == 0 ? (true, "Wi-Fi \(on ? "on" : "off")") : (false, "Couldn't change Wi-Fi.")
        case "bluetooth":
            // macOS has no command for Bluetooth power; the small free `blueutil` does it (brew install blueutil).
            let on = a["on"] as? Bool ?? true
            guard let tool = ["/opt/homebrew/bin/blueutil", "/usr/local/bin/blueutil"].first(where: { FileManager.default.isExecutableFile(atPath: $0) }) else {
                return (false, "Turning Bluetooth on and off needs a small free helper. Run “brew install blueutil” in Terminal once, then ask me again.")
            }
            let p = Process(); p.executableURL = URL(fileURLWithPath: tool); p.arguments = ["--power", on ? "1" : "0"]
            guard (try? p.run()) != nil else { return (false, "Couldn't change Bluetooth.") }
            p.waitUntilExit()
            return p.terminationStatus == 0 ? (true, "Bluetooth \(on ? "on" : "off")") : (false, "Couldn't change Bluetooth.")
        case "empty_trash":
            return run("tell application \"Finder\" to empty the trash") ? (true, "Emptied the Trash") : (false, "Couldn't empty the Trash. Allow ShuaCrew to control Finder in Privacy & Security → Automation.")
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

    nonisolated static func shortcutNames() -> [String] {
        let p = Process(), out = Pipe()
        p.executableURL = URL(fileURLWithPath: "/usr/bin/shortcuts"); p.arguments = ["list"]; p.standardOutput = out
        guard (try? p.run()) != nil else { return [] }
        p.waitUntilExit()
        return String(data: out.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?.split(separator: "\n").map(String.init).prefix(80).map { $0 } ?? []
    }

    /// While you and Spark talk, music steps aside: Music/Spotify dip to a quarter of their own volume (never paused),
    /// and go back to exactly the volume you had afterwards. Only players already playing; never launches one.
    nonisolated(unsafe) private static var ducked: [(app: String, volume: Int)] = []
    nonisolated static func duck(_ on: Bool) {
        let ids = Set(NSWorkspace.shared.runningApplications.compactMap(\.bundleIdentifier))
        if on {
            guard ducked.isEmpty else { return }
            for (app, id) in [("Music", "com.apple.Music"), ("Spotify", "com.spotify.client")] where ids.contains(id) {
                guard timed(app, "tell application \"\(app)\" to get player state as string") == "playing",
                      let volume = timed(app, "tell application \"\(app)\" to get sound volume").flatMap({ Int($0) }) else { continue }
                if timed(app, "tell application \"\(app)\" to set sound volume to \(max(5, volume / 4))") != nil { ducked.append((app, volume)) }
            }
        } else {
            for d in ducked where ids.contains(d.app == "Music" ? "com.apple.Music" : "com.spotify.client") { _ = timed(d.app, "tell application \"\(d.app)\" to set sound volume to \(d.volume)") }
            ducked = []
        }
    }

    /// What Music or Spotify is playing, for the notch: title, artist, state, position and artwork. Reads only a player
    /// that's already running (a `tell` would launch it), and fetches artwork once per track, shrunk to a small JPEG.
    /// For Spark to answer from: the song in detail, or your playlists.
    nonisolated static func musicInfo(_ op: String) -> (ok: Bool, message: String, output: String) {
        if op == "music_playlists" {
            // AppleScript lists don't come back as text: join the names inside the script.
            guard let names = timed("Music", """
            tell application "Music"
              set AppleScript's text item delimiters to " | "
              set found to (name of every user playlist whose smart is false and special kind is none)
              return found as text
            end tell
            """) else { return (false, "Music didn't answer.", "") }
            return (true, "Checked your playlists", names.isEmpty ? "You don't have any playlists of your own in Apple Music." : "Your Apple Music playlists: \(names)")
        }
        guard let app = runningPlayer() else { return (true, "Nothing's playing", "No music app is open.") }
        let detail = timed(app, app == "Music" ? """
            tell application "Music"
              if player state is stopped then return ""
              set t to current track
              set out to (name of t) & " — " & (artist of t) & " · album: " & (album of t) & " · genre: " & (genre of t)
              if (year of t) > 0 then set out to out & " · year: " & ((year of t) as string)
              return out & " · " & (player state as string)
            end tell
            """ : """
            tell application "Spotify"
              if player state is stopped then return ""
              return (name of current track) & " — " & (artist of current track) & " · album: " & (album of current track) & " · " & (player state as string)
            end tell
            """)
        guard let detail else { return (false, "\(app) didn't answer.", "") }
        guard !detail.isEmpty else { return (true, "Nothing's playing", "Nothing is playing in \(app).") }
        return (true, "Checked what's playing", "Now in \(app): \(detail)")
    }
    nonisolated(unsafe) private static var artCache: (id: String, url: String)?
    nonisolated static func nowPlaying() -> [String: Any]? {
        guard let app = runningPlayer() else { return nil }
        let script = app == "Spotify" ? """
            tell application "Spotify"
              if player state is stopped then return "stopped"
              set t to current track
              return (player state as string) & tab & (name of t) & tab & (artist of t) & tab & (album of t) & tab & (player position as string) & tab & ((duration of t) / 1000 as string) & tab & (id of t) & tab & (artwork url of t)
            end tell
            """ : """
            tell application "Music"
              if player state is stopped then return "stopped"
              set t to current track
              return (player state as string) & tab & (name of t) & tab & (artist of t) & tab & (album of t) & tab & (player position as string) & tab & (duration of t as string) & tab & (persistent ID of t) & tab & ""
            end tell
            """
        guard let out = timed(app, script), out != "stopped" else { return nil }
        let f = out.components(separatedBy: "\t")
        guard f.count >= 8, !f[1].isEmpty else { return nil }
        let number = { (s: String) in Double(s.replacingOccurrences(of: ",", with: ".")) ?? 0 }
        if artCache?.id != f[6] { artCache = (f[6], app == "Spotify" ? f[7] : musicArtwork() ?? "") }
        return ["app": app, "playing": f[0] == "playing", "title": f[1], "artist": f[2], "album": f[3], "position": number(f[4]), "duration": number(f[5]), "art": artCache?.url ?? ""]
    }
    nonisolated private static func musicArtwork() -> String? {
        var error: NSDictionary?
        guard let data = NSAppleScript(source: "with timeout of 2 seconds\ntell application \"Music\" to get raw data of artwork 1 of current track\nend timeout")?.executeAndReturnError(&error).data, error == nil,
              let image = NSImage(data: data), let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff) else { return nil }
        let side = 160, small = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: side, pixelsHigh: side, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)
        guard let small else { return nil }
        NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: small)
        rep.draw(in: NSRect(x: 0, y: 0, width: side, height: side)); NSGraphicsContext.restoreGraphicsState()
        guard let jpeg = small.representation(using: .jpeg, properties: [.compressionFactor: 0.8]) else { return nil }
        return "data:image/jpeg;base64,\(jpeg.base64EncodedString())"
    }

    nonisolated private static func runningPlayer() -> String? {
        let ids = NSWorkspace.shared.runningApplications.compactMap(\.bundleIdentifier)
        return ids.contains("com.spotify.client") ? "Spotify" : ids.contains("com.apple.Music") ? "Music" : nil
    }
    @discardableResult nonisolated private static func run(_ source: String) -> Bool { runResult(source) != nil }
    nonisolated private static func runResult(_ source: String) -> String? {
        var error: NSDictionary?
        let result = NSAppleScript(source: source)?.executeAndReturnError(&error)
        return error == nil ? (result?.stringValue ?? "") : nil
    }
}

// MARK: pressing things by name

/// Finds a control by what it's called in the frontmost app's accessibility tree ("Send", "Share", "New Tab") and presses it.
/// Far more reliable than coordinates: it keeps working when the window moves or the layout shifts.
@MainActor
enum SparkPress {
    struct Found { let element: AXUIElement; let center: CGPoint /* global, top-left origin */; let name: String }
    private static let pressable: Set<String> = [kAXButtonRole, kAXMenuItemRole, kAXMenuBarItemRole, kAXCheckBoxRole, kAXRadioButtonRole, kAXPopUpButtonRole, "AXLink", "AXTab", kAXCellRole, kAXStaticTextRole, kAXImageRole, kAXDisclosureTriangleRole]

    static func find(_ label: String) -> Found? {
        guard let app = NSWorkspace.shared.frontmostApplication, !SparkHands.offLimits.contains(app.bundleIdentifier ?? "") else { return nil }
        let root = AXUIElementCreateApplication(app.processIdentifier)
        let want = label.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        guard !want.isEmpty else { return nil }
        var queue: [AXUIElement] = [root], seen = 0
        var partial: Found?
        while !queue.isEmpty, seen < 5000 {
            let el = queue.removeFirst(); seen += 1
            let role = string(el, kAXRoleAttribute) ?? ""
            if pressable.contains(role) {
                for key in [kAXTitleAttribute, kAXDescriptionAttribute, kAXValueAttribute, "AXHelp"] {
                    guard let name = string(el, key)?.trimmingCharacters(in: .whitespacesAndNewlines), !name.isEmpty, name.count < 120 else { continue }
                    let n = name.lowercased()
                    if n == want, let c = center(el) { return Found(element: el, center: c, name: name) }
                    if partial == nil, n.contains(want) || (want.count > 3 && want.contains(n) && n.count > 2), let c = center(el) { partial = Found(element: el, center: c, name: name) }
                }
            }
            var children: CFTypeRef?
            if AXUIElementCopyAttributeValue(el, kAXChildrenAttribute as CFString, &children) == .success, let list = children as? [AXUIElement] { queue.append(contentsOf: list) }
        }
        return partial
    }

    enum Check { case confirmed, moved(CGPoint), gone(String?), unknown }
    /// Does a control's name fit what Spark called it? (See LabelMatch, which is tested.)
    static func fits(_ name: String, _ label: String) -> Bool { LabelMatch.fits(name, label) }
    /// The names at a point in the front app: the element there and a few of its ancestors (a label inside a button, a row…).
    private static func names(at p: CGPoint) -> [String] {
        guard let app = NSWorkspace.shared.frontmostApplication else { return [] }
        var hit: AXUIElement?
        guard AXUIElementCopyElementAtPosition(AXUIElementCreateApplication(app.processIdentifier), Float(p.x), Float(p.y), &hit) == .success, var el = hit else { return [] }
        var out: [String] = []
        for _ in 0..<4 {
            for key in [kAXTitleAttribute, kAXDescriptionAttribute, kAXValueAttribute, "AXHelp"] { if let n = string(el, key)?.trimmingCharacters(in: .whitespacesAndNewlines), !n.isEmpty, n.count < 120 { out.append(n) } }
            var parent: CFTypeRef?
            guard AXUIElementCopyAttributeValue(el, kAXParentAttribute as CFString, &parent) == .success, let up = parent else { break }
            el = up as! AXUIElement
        }
        return out
    }
    /// Right before a click: is the thing Spark means still under the point? If it moved, where is it now? If it's gone
    /// (something else is there and it's nowhere to be found), don't click. Apps that describe nothing: can't tell.
    static func verify(label: String, at p: CGPoint) -> Check {
        let here = names(at: p)
        if here.contains(where: { fits($0, label) }) { return .confirmed }
        if let found = locate(label, near: p) { return hypot(found.center.x - p.x, found.center.y - p.y) < 6 ? .confirmed : .moved(found.center) }
        return here.isEmpty ? .unknown : .gone(here.first)
    }
    /// The control that fits a label in the front app, nearest to where Spark aimed.
    static func locate(_ label: String, near p: CGPoint) -> Found? {
        guard let app = NSWorkspace.shared.frontmostApplication, !SparkHands.offLimits.contains(app.bundleIdentifier ?? "") else { return nil }
        var queue: [AXUIElement] = [AXUIElementCreateApplication(app.processIdentifier)], seen = 0, best: (Found, CGFloat)?
        while !queue.isEmpty, seen < 5000 {
            let el = queue.removeFirst(); seen += 1
            if pressable.contains(string(el, kAXRoleAttribute) ?? "") {
                for key in [kAXTitleAttribute, kAXDescriptionAttribute, kAXValueAttribute, "AXHelp"] {
                    guard let name = string(el, key)?.trimmingCharacters(in: .whitespacesAndNewlines), !name.isEmpty, name.count < 120, fits(name, label), let c = center(el) else { continue }
                    let d = hypot(c.x - p.x, c.y - p.y)
                    if best == nil || d < best!.1 { best = (Found(element: el, center: c, name: name), d) }
                    break
                }
            }
            var children: CFTypeRef?
            if AXUIElementCopyAttributeValue(el, kAXChildrenAttribute as CFString, &children) == .success, let list = children as? [AXUIElement] { queue.append(contentsOf: list) }
        }
        return best?.0
    }

    static func press(_ found: Found) -> Bool {
        if AXUIElementPerformAction(found.element, kAXPressAction as CFString) == .success { return true }
        // Some controls only answer to a real click.
        let p = found.center
        for type in [CGEventType.leftMouseDown, .leftMouseUp] { CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap); usleep(18_000) }
        return true
    }

    private static func string(_ el: AXUIElement, _ key: String) -> String? {
        var v: CFTypeRef?
        guard AXUIElementCopyAttributeValue(el, key as CFString, &v) == .success else { return nil }
        return v as? String
    }
    private static func center(_ el: AXUIElement) -> CGPoint? {
        var pos: CFTypeRef?, size: CFTypeRef?
        guard AXUIElementCopyAttributeValue(el, kAXPositionAttribute as CFString, &pos) == .success,
              AXUIElementCopyAttributeValue(el, kAXSizeAttribute as CFString, &size) == .success else { return nil }
        var p = CGPoint.zero, s = CGSize.zero
        AXValueGetValue(pos as! AXValue, .cgPoint, &p); AXValueGetValue(size as! AXValue, .cgSize, &s)
        guard s.width > 0, s.height > 0 else { return nil }
        return CGPoint(x: p.x + s.width / 2, y: p.y + s.height / 2)
    }
}

// MARK: running a command

/// A terminal command Spark runs for you, after ShuaCrew's policy has allowed it (and you have, when it asks).
/// Runs in your login shell from your home folder, 60 seconds at most; the output comes back so Spark can read it to you.
enum SparkShell {
    static func run(_ command: String, completion: @escaping @Sendable (Int32, String) -> Void) {
        let p = Process(), out = Pipe()
        p.executableURL = URL(fileURLWithPath: "/bin/zsh")
        p.arguments = ["-lc", command]
        p.currentDirectoryURL = URL(fileURLWithPath: NSHomeDirectory())
        p.standardOutput = out; p.standardError = out
        let reader = out.fileHandleForReading
        let collected = LockedData()
        reader.readabilityHandler = { h in collected.append(h.availableData) }
        let timer = DispatchWorkItem { if p.isRunning { p.terminate() } }
        p.terminationHandler = { proc in
            timer.cancel()
            reader.readabilityHandler = nil
            collected.append(reader.readDataToEndOfFile())
            let text = String(decoding: collected.data.prefix(64_000), as: UTF8.self)
            completion(proc.terminationStatus, text)
        }
        do { try p.run(); DispatchQueue.global().asyncAfter(deadline: .now() + 60, execute: timer) }
        catch { completion(-1, "Couldn't start the shell: \(error.localizedDescription)") }
    }
}

final class LockedData: @unchecked Sendable {
    private let lock = NSLock()
    private var buffer = Data()
    func append(_ d: Data) { lock.lock(); buffer.append(d); lock.unlock() }
    var data: Data { lock.lock(); defer { lock.unlock() }; return buffer }
}
