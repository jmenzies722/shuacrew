import AppKit
import Contacts
import EventKit
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
            default: done(false, "Spark can't look that up.", "")
            }
        }
    }

    // MARK: files

    /// Build output, caches and package folders: never what you meant.
    private static let noise = ["/Library/", "/node_modules/", "/.git/", "/dist/", "/build/", "/.build/", "/.next/", "/DerivedData/", "/Caches/", "/.cache/", "/__pycache__/", "/.venv/", "/venv/", "/target/", "/Pods/", "/.Trash/", "/go/pkg/", "/.cargo/", "/.rustup/", "/.npm/", "/.pnpm-store/", "/.gradle/", "/.m2/"]
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
        let kinds: [String: String] = ["pdf": "com.adobe.pdf", "images": "public.image", "apps": "com.apple.application", "folders": "public.folder", "documents": "public.content"]
        var args = ["-onlyin", home]
        // Files NAMED like what you asked come first, then files that mention it; one list, no repeats.
        let safe = q.replacingOccurrences(of: "'", with: "").replacingOccurrences(of: "\\", with: "")
        let type = (a["kind"] as? String).flatMap { kinds[$0] }.map { "kMDItemContentTypeTree == '\($0)' && " } ?? ""
        let named = spotlight(args + ["\(type)kMDItemDisplayName == '*\(safe)*'cd"], limit: 25)
        let mentions = spotlight(args + ["\(type)kMDItemTextContent == '*\(safe)*'cd"], limit: 25)
        var seen = Set<String>(), hits: [String] = []
        for path in named + mentions where seen.insert(path).inserted && hits.count < 25 { hits.append(path) }
        done(true, hits.isEmpty ? "Nothing found for “\(q)”" : "Found \(hits.count) for “\(q)”", hits.isEmpty ? "No files matched “\(q)”." : "Files matching “\(q)” (newest info first where known):\n" + hits.map(describe).joined(separator: "\n"))
    }
    private static func recent(_ a: [String: Any], _ done: Done) {
        let days = min(14, max(1, a["days"] as? Int ?? 3))
        let hits = spotlight(["-onlyin", home, "kMDItemLastUsedDate >= $time.today(-\(days)) && kMDItemContentTypeTree != 'public.folder'"], limit: 30)
        done(true, "Your recent files", hits.isEmpty ? "No files used in the last \(days) days." : "Files you used in the last \(days) days:\n" + hits.map(describe).joined(separator: "\n"))
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
    private static func access(_ type: EKEntityType) -> Bool {
        if EKEventStore.authorizationStatus(for: type) == .fullAccess { return true }
        let wait = DispatchSemaphore(value: 0); nonisolated(unsafe) var granted = false
        let finish: EKEventStoreRequestAccessCompletionHandler = { ok, _ in granted = ok; wait.signal() }
        if type == .event { events.requestFullAccessToEvents(completion: finish) } else { events.requestFullAccessToReminders(completion: finish) }
        _ = wait.wait(timeout: .now() + 60)
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
        guard access(.reminder) else { done(false, "Let ShuaCrew see your reminders in System Settings → Privacy & Security → Reminders.", ""); return }
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
            store.requestAccess(for: .contacts) { granted, _ in ok = granted; wait.signal() }
            _ = wait.wait(timeout: .now() + 60)
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
