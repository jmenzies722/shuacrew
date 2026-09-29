import Foundation

/// Spark's reach into your email through the Mail app, so any account in Mail (Gmail included) works with no
/// keys or Google setup. Reading and drafting only: it never sends — a draft opens in Mail for you to send.
/// macOS asks once for permission to control Mail. Scripts run off the main thread through `osascript`, and
/// every value is passed as an argument (never pasted into the script), so a subject line can't inject code.
enum MailBridge {
    private static let unread = """
    on run argv
      set limit to (item 1 of argv) as integer
      tell application "Mail"
        set msgs to (messages of inbox whose read status is false)
        set total to count of msgs
        set out to "UNREAD " & total & linefeed
        repeat with i from 1 to (my smaller(total, limit))
          set m to item i of msgs
          set out to out & (id of m) & tab & ((date received of m) as string) & tab & (sender of m) & tab & (subject of m) & linefeed
        end repeat
        return out
      end tell
    end run
    on smaller(a, b)
      if a < b then return a
      return b
    end smaller
    """

    private static let search = """
    on run argv
      set q to item 1 of argv
      set limit to (item 2 of argv) as integer
      tell application "Mail"
        set scanned to my smaller(count of messages of inbox, 400)
        set out to ""
        set found to 0
        repeat with i from 1 to scanned
          set m to message i of inbox
          if (subject of m contains q) or (sender of m contains q) then
            set out to out & (id of m) & tab & ((date received of m) as string) & tab & (sender of m) & tab & (subject of m) & linefeed
            set found to found + 1
            if found ≥ limit then exit repeat
          end if
        end repeat
        return "FOUND " & found & " in the newest " & scanned & linefeed & out
      end tell
    end run
    on smaller(a, b)
      if a < b then return a
      return b
    end smaller
    """

    private static let read = """
    on run argv
      set wanted to (item 1 of argv) as integer
      tell application "Mail"
        set m to first message of inbox whose id is wanted
        set theText to content of m
        if (length of theText) > 4000 then set theText to (text 1 thru 4000 of theText) & "…"
        return "From: " & (sender of m) & linefeed & "Date: " & ((date received of m) as string) & linefeed & "Subject: " & (subject of m) & linefeed & linefeed & theText
      end tell
    end run
    """

    private static let draft = """
    on run argv
      set toAddress to item 1 of argv
      set theSubject to item 2 of argv
      set theBody to item 3 of argv
      tell application "Mail"
        set m to make new outgoing message with properties {subject:theSubject, content:theBody, visible:true}
        if toAddress is not "" then
          tell m to make new to recipient at end of to recipients with properties {address:toAddress}
        end if
        activate
        return "Draft open in Mail — not sent."
      end tell
    end run
    """

    /// Runs one mail action; completion is (ok, short message, output for Spark to read).
    static func run(_ action: [String: Any], completion: @escaping @Sendable (Bool, String, String) -> Void) {
        let op = action["op"] as? String ?? ""
        let limit = String(min(max(action["limit"] as? Int ?? 10, 1), 25))
        let script: String, args: [String], done: String
        switch op {
        case "unread": script = unread; args = [limit]; done = "Checked your unread mail"
        case "search":
            guard let q = (action["query"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !q.isEmpty else { completion(false, "Nothing to search for.", ""); return }
            script = search; args = [String(q.prefix(120)), limit]; done = "Searched your mail"
        case "read":
            guard let id = action["id"] as? Int else { completion(false, "Which message?", ""); return }
            script = read; args = [String(id)]; done = "Read the message"
        case "draft":
            let to = (action["to"] as? String ?? "").trimmingCharacters(in: .whitespaces)
            guard to.isEmpty || to.range(of: #"^[^\s@]+@[^\s@]+\.[^\s@]+$"#, options: .regularExpression) != nil else { completion(false, "That address doesn't look right.", ""); return }
            script = draft; args = [to, String((action["subject"] as? String ?? "").prefix(300)), String((action["body"] as? String ?? "").prefix(20_000))]; done = "Drafted it in Mail (not sent)"
        default: completion(false, "Unknown mail action.", ""); return
        }
        DispatchQueue.global(qos: .userInitiated).async {
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
            process.arguments = ["-"] + args
            let input = Pipe(), output = Pipe(), errors = Pipe()
            process.standardInput = input; process.standardOutput = output; process.standardError = errors
            do { try process.run() } catch { completion(false, "Couldn't reach Mail.", ""); return }
            input.fileHandleForWriting.write(Data(script.utf8)); try? input.fileHandleForWriting.close()
            let deadline = DispatchWorkItem { if process.isRunning { process.terminate() } }
            DispatchQueue.global().asyncAfter(deadline: .now() + 30, execute: deadline)
            let out = String(decoding: output.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
            let err = String(decoding: errors.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
            process.waitUntilExit(); deadline.cancel()
            if process.terminationStatus == 0 { completion(true, done, out.trimmingCharacters(in: .whitespacesAndNewlines)); return }
            // -1743: the user hasn't allowed ShuaCrew to control Mail yet.
            let message = err.contains("-1743") || err.localizedCaseInsensitiveContains("not allowed")
                ? "ShuaCrew needs permission to use Mail: System Settings → Privacy & Security → Automation → ShuaCrew → Mail."
                : err.contains("-1728") ? "Couldn't find that message." : "Mail didn't answer: \(err.trimmingCharacters(in: .whitespacesAndNewlines).prefix(160))"
            completion(false, message, "")
        }
    }
}
