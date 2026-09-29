import AppKit
import Contacts
import EventKit
import AVFoundation
import IOKit.ps
import PDFKit
import ShuaCrewCore

/// Spark knows your Mac: find and read your files (Spotlight), your calendar, reminders, notes and contacts, and
/// what's going on right now (apps, battery, storage, Wi-Fi). Everything is read on this Mac and handed to Spark as
/// plain text to answer from; the only write is adding a reminder you asked for. Runs off the main thread, bounded.
///
/// Never reads: your sealed work folders, secrets (SSH, cloud keys, keychains, .env files) or other apps' private data.
enum MacKnowledge {
    static let queue = DispatchQueue(label: "shuacrew.mac-knowledge", qos: .userInitiated)
    typealias Done = @Sendable (Bool, String, String) -> Void   // ok, short message, output for Spark

    private static let home = FileManager.default.homeDirectoryForCurrentUser.path
    /// A path Spark may look at (see MacPaths, which is tested).
    static func allowed(_ raw: String) -> String? { MacPaths.allowed(raw, home: home) }

    static func run(_ a: [String: Any], done: @escaping Done) {
        nonisolated(unsafe) let a = a
        queue.async {
            switch a["op"] as? String {
            case "find": find(a, done)
            case "read": read(a, done)
            case "recent": recent(a, done)
            case "calendar": calendar(a, done)
            case "reminders": reminders(a, done)
            case "add_reminder": addReminder(a, done)
            case "notes": notes(a, done)
            case "contacts": contacts(a, done)
            case "status": done(true, "Checked your Mac", status())
            case "context": done(true, "", context())
            case "permissions": done(true, "", permissions())
            case "request_access":
                // Settings' "Allow" button: bring up macOS's own prompt right now (the only way an app gets on these lists).
                switch a["what"] as? String {
                case "reminders": done(access(.reminder), "", permissions())
                case "calendar": done(access(.event), "", permissions())
                case "contacts":
                    let wait = DispatchSemaphore(value: 0); nonisolated(unsafe) var ok = false
                    DispatchQueue.main.async { CNContactStore().requestAccess(for: .contacts) { granted, _ in ok = granted; wait.signal() } }
                    _ = wait.wait(timeout: .now() + 120)
                    done(ok, "", permissions())
                default: done(false, "", permissions())
                }
            case "notes_new": newNote(a, done)
            case "calendar_add": addEvent(a, done)
            case "new_folder": newFolder(a, done)
            case "reveal", "open_file": openFile(a, reveal: a["op"] as? String == "reveal", done)
            case "browser_tabs": browserTabs(done)
            default: done(false, "Spark can't look that up.", "")
            }
        }
    }

    // MARK: files

    /// Build output, caches and package folders: never what you meant.
    private static let noise = ["/Library/", "/node_modules/", "/.git/", "/dist/", "/build/", "/.build/", "/.next/", "/DerivedData/", "/Caches/", "/.cache/", "/__pycache__/", "/.venv/", "/venv/", "/target/", "/Pods/", "/.Trash/", "/go/pkg/", "/.cargo/", "/.rustup/", "/.npm/", "/.pnpm-store/", "/.gradle/", "/.m2/",
        // App-managed libraries and scratch space: the Music/Photos databases change constantly but are never "your file".
        ".musiclibrary", ".photoslibrary", ".tvlibrary", "/tmp/",
        // Apps that keep caches in your own folders (CapCut, Electron apps): "Cache", "User Data", "GPUCache".
        "/Cache/", "/User Data/", "/GPUCache/", "/Code Cache/"]
    private static func spotlight(_ args: [String], limit: Int) -> [String] {
        let p = Process(), out = Pipe()
        p.executableURL = URL(fileURLWithPath: "/usr/bin/mdfind"); p.arguments = args; p.standardOutput = out; p.standardError = Pipe()
        guard (try? p.run()) != nil else { return [] }
        let deadline = DispatchWorkItem { if p.isRunning { p.terminate() } }
        DispatchQueue.global().asyncAfter(deadline: .now() + 6, execute: deadline)
        let data = out.fileHandleForReading.readDataToEndOfFile(); p.waitUntilExit(); deadline.cancel()
        return String(decoding: data, as: UTF8.self).split(separator: "\n").map(String.init)
            .filter { path in allowed(path) != nil && !noise.contains(where: { path.contains($0) }) }
            .prefix(limit).map { $0 }
    }
    private static func describe(_ path: String) -> String {
        let attrs = try? FileManager.default.attributesOfItem(atPath: path)
        let modified = (attrs?[.modificationDate] as? Date).map { DateFormatter.localizedString(from: $0, dateStyle: .medium, timeStyle: .short) } ?? "?"
        let size = (attrs?[.size] as? NSNumber).map { ByteCountFormatter.string(fromByteCount: $0.int64Value, countStyle: .file) } ?? ""
        return "\(path.replacingOccurrences(of: home, with: "~")) · \(modified)\(size.isEmpty ? "" : " · \(size)")"
    }
    private static func find(_ a: [String: Any], _ done: Done) {
        guard let q = (a["query"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !q.isEmpty, q.count < 120 else { done(false, "What should I look for?", ""); return }
        let kinds: [String: String] = ["pdf": "com.adobe.pdf", "image": "public.image", "images": "public.image", "photos": "public.image", "apps": "com.apple.application", "folders": "public.folder", "documents": "public.content"]
        let args = ["-onlyin", home]
        // "Find my PDFs" names a kind, not a word to match: list that kind, newest first.
        let lower = q.lowercased()
        if a["kind"] == nil, let kind = kinds[lower] ?? kinds[String(lower.dropLast())] {
            let hits = spotlight(args + ["kMDItemContentTypeTree == '\(kind)'"], limit: 200)
                .map { ($0, (try? FileManager.default.attributesOfItem(atPath: $0)[.modificationDate] as? Date) ?? .distantPast) }
                .sorted { $0.1 > $1.1 }.prefix(25).map(\.0)
            done(true, hits.isEmpty ? "No \(q) found" : "Your \(q), newest first", hits.isEmpty ? "No \(q) found in your home folder." : "Your \(q), newest first:\n" + hits.map(describe).joined(separator: "\n")); return
        }
        // Files NAMED like what you asked come first, then files that mention it; one list, no repeats.
        let safe = q.replacingOccurrences(of: "'", with: "").replacingOccurrences(of: "\\", with: "")
        let type = (a["kind"] as? String).flatMap { kinds[$0] }.map { "kMDItemContentTypeTree == '\($0)' && " } ?? ""
        let named = spotlight(args + ["\(type)kMDItemDisplayName == '*\(safe)*'cd"], limit: 25)
        let mentions = spotlight(args + ["\(type)kMDItemTextContent == '*\(safe)*'cd"], limit: 25)
        var seen = Set<String>(), hits: [String] = []
        for path in named + mentions where seen.insert(path).inserted && hits.count < 25 { hits.append(path) }
        done(true, hits.isEmpty ? "Nothing found for “\(q)”" : "Found \(hits.count) for “\(q)”", hits.isEmpty ? "No files matched “\(q)”." : "Files matching “\(q)” (newest info first where known):\n" + hits.map(describe).joined(separator: "\n"))
    }
    /// Files you changed lately, newest first ("last used" isn't recorded for most files; "last changed" is), skipping
    /// hidden folders (app data, caches) and build output.
    private static func recentlyChanged(days: Int, limit: Int) -> [String] {
        let hits = spotlight(["-onlyin", home, "kMDItemFSContentChangeDate >= $time.today(-\(days)) && kMDItemContentTypeTree != 'public.folder' && kMDItemContentTypeTree != 'com.apple.application'"], limit: 400)
            .filter { !$0.dropFirst(home.count).split(separator: "/").contains { $0.hasPrefix(".") } }
            .filter { path in !["tsbuildinfo", "log", "lock", "map", "pyc", "db-wal", "db-shm", "sqlite-wal", "tmp", "swp"].contains((path as NSString).pathExtension.lowercased()) && !path.hasSuffix("lock.json") && !path.hasSuffix(".lock.yaml") }
        let dated = hits.map { ($0, (try? FileManager.default.attributesOfItem(atPath: $0)[.modificationDate] as? Date) ?? .distantPast) }
        return dated.sorted { $0.1 > $1.1 }.prefix(limit).map(\.0)
    }
    private static func recent(_ a: [String: Any], _ done: Done) {
        let days = min(14, max(1, a["days"] as? Int ?? 3))
        let hits = recentlyChanged(days: days, limit: 30)
        done(true, "Your recent files", hits.isEmpty ? "No files used in the last \(days) days." : "Files you changed in the last \(days) days, newest first:\n" + hits.map(describe).joined(separator: "\n"))
    }
    private static func read(_ a: [String: Any], _ done: Done) {
        guard let raw = a["path"] as? String, let path = allowed(raw) else { done(false, "That file is off-limits to Spark.", ""); return }
        var isDir: ObjCBool = false
        guard FileManager.default.fileExists(atPath: path, isDirectory: &isDir) else { done(false, "Couldn't find that file.", ""); return }
        let shown = path.replacingOccurrences(of: home, with: "~")
        if isDir.boolValue {
            let items = ((try? FileManager.default.contentsOfDirectory(atPath: path)) ?? []).filter { !$0.hasPrefix(".") }.sorted().prefix(80)
            done(true, "Looked in \(shown)", "Folder \(shown) contains:\n" + items.joined(separator: "\n")); return
        }
        let url = URL(fileURLWithPath: path)
        if url.pathExtension.lowercased() == "pdf", let pdf = PDFDocument(url: url) {
            done(true, "Read \(url.lastPathComponent)", "\(shown) (PDF, \(pdf.pageCount) pages):\n" + String((pdf.string ?? "").prefix(12_000))); return
        }
        guard let data = try? Data(contentsOf: url, options: .mappedIfSafe) else { done(false, "Couldn't open that file.", ""); return }
        if let text = String(data: data.prefix(400_000), encoding: .utf8) {
            done(true, "Read \(url.lastPathComponent)", "\(shown):\n" + String(text.prefix(12_000)))
        } else if let rich = try? NSAttributedString(url: url, options: [:], documentAttributes: nil) {
            done(true, "Read \(url.lastPathComponent)", "\(shown):\n" + String(rich.string.prefix(12_000)))
        } else {
            done(true, "That's not a text file", "\(shown) is a \(url.pathExtension.uppercased()) file (\(ByteCountFormatter.string(fromByteCount: Int64(data.count), countStyle: .file))) that Spark can't read as text.")
        }
    }

    // MARK: calendar, reminders, contacts, notes

    private static let events = EKEventStore()
    nonisolated(unsafe) private static var lastError: String?
    private static func access(_ type: EKEntityType) -> Bool {
        if EKEventStore.authorizationStatus(for: type) == .fullAccess { return true }
        // Ask from the main thread: macOS only shows the permission prompt for requests made there.
        let wait = DispatchSemaphore(value: 0); nonisolated(unsafe) var granted = false
        let finish: EKEventStoreRequestAccessCompletionHandler = { ok, error in granted = ok; lastError = error?.localizedDescription; wait.signal() }
        DispatchQueue.main.async { if type == .event { events.requestFullAccessToEvents(completion: finish) } else { events.requestFullAccessToReminders(completion: finish) } }
        _ = wait.wait(timeout: .now() + 120)
        return granted
    }
    private static let when: DateFormatter = { let f = DateFormatter(); f.dateFormat = "EEE d MMM, h:mm a"; return f }()
    private static func calendar(_ a: [String: Any], _ done: Done) {
        guard access(.event) else { done(false, "Let ShuaCrew see your calendar in System Settings → Privacy & Security → Calendars.", ""); return }
        let days = min(30, max(1, a["days"] as? Int ?? 2)), start = Calendar.current.startOfDay(for: Date())
        let found = events.events(matching: events.predicateForEvents(withStart: start, end: start.addingTimeInterval(Double(days) * 86_400), calendars: nil))
            .sorted { $0.startDate < $1.startDate }.prefix(60)
        let lines = found.map { e in "\(e.isAllDay ? "All day \(DateFormatter.localizedString(from: e.startDate, dateStyle: .medium, timeStyle: .none))" : when.string(from: e.startDate)) – \(e.title ?? "Untitled")\(e.location.map { " @ \($0)" } ?? "") [\(e.calendar.title)]" }
        done(true, "Checked your calendar", lines.isEmpty ? "Nothing on the calendar for the next \(days) day(s)." : "Calendar, next \(days) day(s):\n" + lines.joined(separator: "\n"))
    }
    private static func reminders(_ a: [String: Any], _ done: Done) {
        guard access(.reminder) else { done(false, "Let ShuaCrew see your reminders in System Settings → Privacy & Security → Reminders.\(lastError.map { " (\($0))" } ?? "")", ""); return }
        let wait = DispatchSemaphore(value: 0); nonisolated(unsafe) var items: [EKReminder] = []
        events.fetchReminders(matching: events.predicateForIncompleteReminders(withDueDateStarting: nil, ending: nil, calendars: nil)) { found in items = found ?? []; wait.signal() }
        _ = wait.wait(timeout: .now() + 10)
        let lines = items.prefix(60).map { r in "• \(r.title ?? "Untitled")\(r.dueDateComponents?.date.map { " (due \(when.string(from: $0)))" } ?? "") [\(r.calendar.title)]" }
        done(true, "Checked your reminders", lines.isEmpty ? "No open reminders." : "Open reminders:\n" + lines.joined(separator: "\n"))
    }
    private static func addReminder(_ a: [String: Any], _ done: Done) {
        guard let title = (a["title"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty, title.count <= 200 else { done(false, "What should the reminder say?", ""); return }
        guard access(.reminder) else { done(false, "Let ShuaCrew use Reminders in System Settings → Privacy & Security → Reminders.", ""); return }
        let r = EKReminder(eventStore: events)
        r.title = title; r.calendar = events.defaultCalendarForNewReminders()
        if let iso = a["due"] as? String, let due = ISO8601DateFormatter().date(from: iso) ?? { let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd'T'HH:mm"; return f.date(from: iso) }() {
            r.dueDateComponents = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: due)
            r.addAlarm(EKAlarm(absoluteDate: due))
        }
        do { try events.save(r, commit: true); done(true, "Added the reminder “\(title)”", "") }
        catch { done(false, "Couldn't add the reminder.", "") }
    }
    private static func contacts(_ a: [String: Any], _ done: Done) {
        guard let q = (a["query"] as? String)?.trimmingCharacters(in: .whitespaces), !q.isEmpty else { done(false, "Who should I look up?", ""); return }
        let store = CNContactStore()
        if CNContactStore.authorizationStatus(for: .contacts) != .authorized {
            let wait = DispatchSemaphore(value: 0); nonisolated(unsafe) var ok = false
            DispatchQueue.main.async { store.requestAccess(for: .contacts) { granted, error in ok = granted; lastError = error?.localizedDescription; wait.signal() } }
            _ = wait.wait(timeout: .now() + 90)
            guard ok else { done(false, "Let ShuaCrew see your contacts in System Settings → Privacy & Security → Contacts.", ""); return }
        }
        let keys = [CNContactGivenNameKey, CNContactFamilyNameKey, CNContactOrganizationNameKey, CNContactEmailAddressesKey, CNContactPhoneNumbersKey, CNContactBirthdayKey] as [CNKeyDescriptor]
        let people = (try? store.unifiedContacts(matching: CNContact.predicateForContacts(matchingName: q), keysToFetch: keys)) ?? []
        let lines = people.prefix(10).map { c in
            let name = [c.givenName, c.familyName].filter { !$0.isEmpty }.joined(separator: " ")
            let emails = c.emailAddresses.map { $0.value as String }.joined(separator: ", "), phones = c.phoneNumbers.map { $0.value.stringValue }.joined(separator: ", ")
            return "\(name.isEmpty ? c.organizationName : name)\(c.organizationName.isEmpty || name.isEmpty ? "" : " (\(c.organizationName))")\(emails.isEmpty ? "" : " · \(emails)")\(phones.isEmpty ? "" : " · \(phones)")"
        }
        done(true, lines.isEmpty ? "No contact named “\(q)”" : "Found \(q) in your contacts", lines.isEmpty ? "No contacts match “\(q)”." : lines.joined(separator: "\n"))
    }
    private static func notes(_ a: [String: Any], _ done: Done) {
        guard NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.apple.Notes") != nil else { done(false, "Notes isn't available.", ""); return }
        let q = ((a["query"] as? String) ?? "").replacingOccurrences(of: "\"", with: "").replacingOccurrences(of: "\\", with: "").prefix(80)
        let script = """
        with timeout of 8 seconds
        tell application "Notes"
          set out to ""
          set found to \(q.isEmpty ? "notes" : "(notes whose name contains \"\(q)\" or plaintext contains \"\(q)\")")
          repeat with n in (items 1 thru (min(8, count of found)) of found)
            set out to out & "## " & (name of n) & " (" & (modification date of n as string) & ")" & linefeed & (text 1 thru (min(600, length of (plaintext of n))) of (plaintext of n)) & linefeed & linefeed
          end repeat
          return out
        end tell
        end timeout
        on min(a, b)
          if a < b then return a
          return b
        end min
        """
        var error: NSDictionary?
        let result = NSAppleScript(source: script)?.executeAndReturnError(&error).stringValue
        if error != nil { done(false, "Notes didn't answer. If macOS asks, allow ShuaCrew to control Notes.", ""); return }
        done(true, "Checked your notes", (result ?? "").isEmpty ? "No notes\(q.isEmpty ? "" : " mention “\(q)”")." : result!)
    }

    // MARK: doing things directly (no clicking)

    private static func appleScript(_ source: String) -> String? {
        var error: NSDictionary?
        let r = NSAppleScript(source: "with timeout of 8 seconds\n\(source)\nend timeout")?.executeAndReturnError(&error)
        return error == nil ? (r?.stringValue ?? "") : nil
    }
    private static func quoted(_ s: String) -> String { "\"" + s.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"") + "\"" }
    private static func newNote(_ a: [String: Any], _ done: Done) {
        let title = ((a["title"] as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines).prefix(200), body = ((a["body"] as? String) ?? "").prefix(20_000)
        guard !title.isEmpty || !body.isEmpty else { done(false, "What should the note say?", ""); return }
        let esc = { (t: Substring) in t.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;").replacingOccurrences(of: "\n", with: "<br>") }
        let html = (title.isEmpty ? "" : "<h1>\(esc(title))</h1>") + esc(body)
        let ok = appleScript("tell application \"Notes\" to make new note at default account with properties {body:\(quoted(html))}") != nil
        done(ok, ok ? "Made the note “\(title.isEmpty ? String(body.prefix(40)) : String(title))”" : "Notes didn't answer. If macOS asks, allow ShuaCrew to control Notes.", "")
    }
    private static func addEvent(_ a: [String: Any], _ done: Done) {
        guard let title = (a["title"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty, title.count <= 200 else { done(false, "What's the event?", ""); return }
        let parse = { (v: Any?) -> Date? in guard let s = v as? String else { return nil }; if let d = ISO8601DateFormatter().date(from: s) { return d }; let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd'T'HH:mm"; return f.date(from: s) }
        guard let start = parse(a["start"]) else { done(false, "When is it?", ""); return }
        guard access(.event) else { done(false, "Let ShuaCrew use your calendar in System Settings → Privacy & Security → Calendars.", ""); return }
        let e = EKEvent(eventStore: events)
        e.title = title; e.startDate = start; e.endDate = parse(a["end"]) ?? start.addingTimeInterval(3600)
        if let place = a["location"] as? String, !place.isEmpty { e.location = String(place.prefix(200)) }
        e.calendar = events.defaultCalendarForNewEvents
        do { try events.save(e, span: .thisEvent); done(true, "Added “\(title)” on \(when.string(from: start))", "") } catch { done(false, "Couldn't add it to your calendar.", "") }
    }
    private static func newFolder(_ a: [String: Any], _ done: Done) {
        let name = ((a["name"] as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "/", with: "-").replacingOccurrences(of: ":", with: "-")
        guard !name.isEmpty, name.count <= 120, !name.hasPrefix(".") else { done(false, "What should the folder be called?", ""); return }
        guard let parent = allowed((a["in"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "~/Desktop") else { done(false, "Spark can't make folders there.", ""); return }
        var target = (parent as NSString).appendingPathComponent(name), n = 2
        while FileManager.default.fileExists(atPath: target) { target = (parent as NSString).appendingPathComponent("\(name) \(n)"); n += 1 }   // never overwrite
        do {
            try FileManager.default.createDirectory(atPath: target, withIntermediateDirectories: false)
            DispatchQueue.main.async { NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: target)]) }
            done(true, "Made the folder “\((target as NSString).lastPathComponent)” in \(((parent as NSString).lastPathComponent))", "")
        } catch { done(false, "Couldn't make that folder.", "") }
    }
    private static func openFile(_ a: [String: Any], reveal: Bool, _ done: Done) {
        guard let raw = a["path"] as? String, let path = allowed(raw), FileManager.default.fileExists(atPath: path) else { done(false, "Couldn't find that file (or it's off-limits).", ""); return }
        let url = URL(fileURLWithPath: path)
        DispatchQueue.main.async { if reveal { NSWorkspace.shared.activateFileViewerSelecting([url]) } else { NSWorkspace.shared.open(url) } }
        done(true, reveal ? "Showing \(url.lastPathComponent) in Finder" : "Opened \(url.lastPathComponent)", "")
    }
    private static func browserTabs(_ done: Done) {
        var out: [String] = []
        let running = Set(NSWorkspace.shared.runningApplications.compactMap(\.bundleIdentifier))
        if running.contains("com.apple.Safari"), let r = appleScript("""
            tell application "Safari"
              set out to ""
              repeat with w in windows
                repeat with t in tabs of w
                  set out to out & (name of t) & " — " & (URL of t) & linefeed
                end repeat
              end repeat
              return out
            end tell
            """), !r.isEmpty { out.append("Safari:\n" + r) }
        if running.contains("com.google.Chrome"), let r = appleScript("""
            tell application "Google Chrome"
              set out to ""
              repeat with w in windows
                repeat with t in tabs of w
                  set out to out & (title of t) & " — " & (URL of t) & linefeed
                end repeat
              end repeat
              return out
            end tell
            """), !r.isEmpty { out.append("Chrome:\n" + r) }
        done(true, "Checked your open tabs", out.isEmpty ? "No open browser tabs (or the browser didn't answer)." : String(out.joined(separator: "\n").prefix(9000)))
    }

    // MARK: what Spark can reach

    /// Which permissions ShuaCrew has right now, as JSON for Settings ("granted", "denied" or "not asked"). Read-only:
    /// it never prompts. Full Disk Access has no API, so it's checked by whether a protected folder can be listed.
    static func permissions() -> String {
        let cal = { (t: EKEntityType) -> String in switch EKEventStore.authorizationStatus(for: t) { case .fullAccess: "granted"; case .notDetermined: "not asked"; default: "denied" } }
        let contacts: String = { switch CNContactStore.authorizationStatus(for: .contacts) { case .authorized: "granted"; case .notDetermined: "not asked"; default: "denied" } }()
        let mic: String = { switch AVCaptureDevice.authorizationStatus(for: .audio) { case .authorized: "granted"; case .notDetermined: "not asked"; default: "denied" } }()
        let fullDisk = (try? FileManager.default.contentsOfDirectory(atPath: home + "/Library/Safari")) != nil ? "granted" : "denied"
        let map: [String: String] = ["screen": CGPreflightScreenCaptureAccess() ? "granted" : "denied", "accessibility": AXIsProcessTrusted() ? "granted" : "denied",
                                     "calendar": cal(.event), "reminders": cal(.reminder), "contacts": contacts, "microphone": mic, "files": fullDisk]
        return (try? String(data: JSONSerialization.data(withJSONObject: map), encoding: .utf8)) ?? "{}"
    }

    // MARK: personal context, for every question

    /// A compact picture of right now, so Spark answers with your context like a real assistant would: where you are,
    /// what's next, what's due, what's playing, what you just worked on, and anything that needs attention. Uses only
    /// permissions you've already granted (never prompts), and stays short.
    static func context() -> String {
        var lines: [String] = []
        if let front = NSWorkspace.shared.frontmostApplication {
            let title = (CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]])?
                .first { ($0[kCGWindowOwnerPID as String] as? pid_t) == front.processIdentifier && ($0[kCGWindowLayer as String] as? Int) == 0 }?[kCGWindowName as String] as? String
            lines.append("Working in: \(front.localizedName ?? "?")\(title.map { $0.isEmpty ? "" : " — “\($0.prefix(80))”" } ?? "")")
        }
        if EKEventStore.authorizationStatus(for: .event) == .fullAccess {
            let now = Date(), end = Calendar.current.startOfDay(for: now).addingTimeInterval(2 * 86_400)
            let next = events.events(matching: events.predicateForEvents(withStart: now, end: end, calendars: nil)).filter { !$0.isAllDay }.sorted { $0.startDate < $1.startDate }.prefix(3)
            if !next.isEmpty { lines.append("Next on the calendar: " + next.map { "\(when.string(from: $0.startDate)) \($0.title ?? "Untitled")" }.joined(separator: "; ")) }
        }
        if EKEventStore.authorizationStatus(for: .reminder) == .fullAccess {
            let wait = DispatchSemaphore(value: 0); nonisolated(unsafe) var due: [EKReminder] = []
            let endOfToday = Calendar.current.startOfDay(for: Date()).addingTimeInterval(86_400)
            events.fetchReminders(matching: events.predicateForIncompleteReminders(withDueDateStarting: nil, ending: endOfToday, calendars: nil)) { found in due = found ?? []; wait.signal() }
            _ = wait.wait(timeout: .now() + 2)
            if !due.isEmpty { lines.append("Due today: " + due.prefix(3).compactMap(\.title).joined(separator: "; ") + (due.count > 3 ? " (+\(due.count - 3) more)" : "")) }
        }
        let recent = recentlyChanged(days: 1, limit: 4)
        if !recent.isEmpty { lines.append("Just worked on: " + recent.map { ($0 as NSString).lastPathComponent }.joined(separator: ", ")) }
        if let info = IOPSCopyPowerSourcesInfo()?.takeRetainedValue(), let list = IOPSCopyPowerSourcesList(info)?.takeRetainedValue() as? [CFTypeRef],
           let d = list.first.flatMap({ IOPSGetPowerSourceDescription(info, $0)?.takeUnretainedValue() as? [String: Any] }), let pct = d[kIOPSCurrentCapacityKey] as? Int,
           pct <= 20, (d[kIOPSPowerSourceStateKey] as? String) != kIOPSACPowerValue { lines.append("Heads-up: battery at \(pct)%") }
        if let free = try? URL(fileURLWithPath: home).resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]).volumeAvailableCapacityForImportantUsage,
           free < 15_000_000_000 { lines.append("Heads-up: only \(ByteCountFormatter.string(fromByteCount: free, countStyle: .file)) of disk space left") }
        return lines.joined(separator: "\n")
    }

    // MARK: this Mac, right now

    static func status() -> String {
        var lines: [String] = []
        let v = ProcessInfo.processInfo.operatingSystemVersion
        lines.append("macOS \(v.majorVersion).\(v.minorVersion).\(v.patchVersion), up \(Int(ProcessInfo.processInfo.systemUptime / 3600)) h")
        if let front = NSWorkspace.shared.frontmostApplication?.localizedName { lines.append("In front: \(front)") }
        let apps = NSWorkspace.shared.runningApplications.filter { $0.activationPolicy == .regular }.compactMap(\.localizedName)
        lines.append("Open apps: \(apps.joined(separator: ", "))")
        if let info = IOPSCopyPowerSourcesInfo()?.takeRetainedValue(), let list = IOPSCopyPowerSourcesList(info)?.takeRetainedValue() as? [CFTypeRef] {
            for src in list {
                if let d = IOPSGetPowerSourceDescription(info, src)?.takeUnretainedValue() as? [String: Any], let pct = d[kIOPSCurrentCapacityKey] as? Int {
                    lines.append("Battery \(pct)%\((d[kIOPSIsChargingKey] as? Bool) == true ? ", charging" : (d[kIOPSPowerSourceStateKey] as? String) == kIOPSACPowerValue ? ", on power" : "")")
                }
            }
        }
        if let values = try? URL(fileURLWithPath: home).resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey, .volumeTotalCapacityKey]),
           let free = values.volumeAvailableCapacityForImportantUsage, let total = values.volumeTotalCapacity {
            lines.append("Storage: \(ByteCountFormatter.string(fromByteCount: free, countStyle: .file)) free of \(ByteCountFormatter.string(fromByteCount: Int64(total), countStyle: .file))")
        }
        lines.append("Memory: \(ByteCountFormatter.string(fromByteCount: Int64(ProcessInfo.processInfo.physicalMemory), countStyle: .memory))")
        // Newer macOS hides the Wi-Fi name from tools without Location access ("not associated" even when connected):
        // fall back to whether Wi-Fi actually has an address.
        let shell = { (tool: String, args: [String]) -> String in
            let p = Process(), out = Pipe(); p.executableURL = URL(fileURLWithPath: tool); p.arguments = args; p.standardOutput = out; p.standardError = Pipe()
            guard (try? p.run()) != nil else { return "" }; p.waitUntilExit()
            return String(decoding: out.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        let network = shell("/usr/sbin/networksetup", ["-getairportnetwork", "en0"])
        if network.hasPrefix("Current Wi-Fi Network: ") { lines.append("Wi-Fi: \(network.dropFirst("Current Wi-Fi Network: ".count))") }
        else { lines.append(shell("/usr/sbin/ipconfig", ["getifaddr", "en0"]).isEmpty ? "Wi-Fi: not connected" : "Wi-Fi: connected (macOS hides the network name)") }
        lines.append("Appearance: \(UserDefaults.standard.string(forKey: "AppleInterfaceStyle") == "Dark" ? "Dark" : "Light")")
        return lines.joined(separator: "\n")
    }
}
