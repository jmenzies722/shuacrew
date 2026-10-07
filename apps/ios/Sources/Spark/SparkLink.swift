import Foundation
import Observation
import LocalAuthentication
import Security
import UIKit

/// What the Mac's pairing QR carries (POST /api/phone/pair on the gateway).
struct SparkPairing: Codable, Equatable, Sendable {
    var v: Int
    var host: String
    var port: Int
    var key: String
    var name: String
}

struct CrewRun: Identifiable, Hashable, Sendable {
    let id: String
    let title: String
    let status: String
    let ticker: String
    let updatedAt: Double
    var createdAt: Double = 0
    var active: Bool { ["queued", "planning", "running", "awaiting_approval", "reviewing"].contains(status) }
    var finished: Bool { ["done", "merged"].contains(status) }
}

/// "What's going on", from the Mac's brief: the headline, then its plain lines (waiting on you, working, finished…).
struct ShuaBrief: Equatable, Sendable {
    let headline: String
    let lines: [String]
    let waiting: Int
    let working: Int
    let finished: Int
    /// What runs on its own next (the Mac's schedules): name and when.
    var next: [Upcoming] = []
    struct Upcoming: Equatable, Sendable, Identifiable { let name: String; let at: Date; var id: String { name + "\(at.timeIntervalSince1970)" } }
}

/// One line of this phone's conversation with Shua.
struct ShuaLine: Identifiable, Equatable, Sendable {
    enum Role: Sendable { case you, shua }
    let id = UUID()
    let role: Role
    var text: String
    var pending = false
    var failed = false
    /// The pages this reply points to, as cards you can tap (first three).
    var links: [URL] = []
    let at = Date()
}

/// What the gateway said when it refused (its own words), so the phone can say it plainly.
struct LinkError: LocalizedError { let code: Int; let message: String?; var errorDescription: String? { message } }

struct CrewApproval: Identifiable, Hashable, Sendable {
    let id: String
    let run: String?
    let tool: String
    let risk: String
    let reason: String
    let summary: String
    let at: Double
    /// In words: what it wants ("look through the project's files") and why it's asking.
    var what = ""
    var why = ""
    /// The exact command, without Codex's shell wrapper, for whoever wants to check.
    var command: String?
}

/// The live line to the Mac: a paired key, the gateway's own snapshot, and its event stream over Tailscale.
/// The snapshot is the truth; events only say "something changed, look again" (plus a pulse for Spark),
/// so the phone never re-implements the gateway's projections.
@MainActor @Observable final class SparkLink {
    enum State: Equatable { case unpaired, connecting, live, offline(String) }

    private(set) var pairing: SparkPairing?
    private(set) var state: State = .unpaired
    private(set) var runs: [CrewRun] = []
    private(set) var approvals: [CrewApproval] = []
    private(set) var todayRuns = 0
    /// When the crew last did something visible (a tool call, a turn): Spark looks busy while this is recent.
    private(set) var lastActivity: Date?
    /// A run that just finished well: Spark celebrates it.
    private(set) var celebrating: CrewRun?
    var error: String?
    /// Your Shua as the Mac draws it, cached between launches.
    private(set) var look: ShuaLook? = ShuaLook.cached()
    private(set) var brief: ShuaBrief?
    /// This phone's conversation with the Mac's Shua: your asks and its replies, newest last.
    private(set) var chat: [ShuaLine] = []
    /// The latest reply you've had time to read (mini Shua tucks its bubble away, on every tab).
    var seenReply: UUID?
    /// Waiting on Shua's reply to something asked here.
    private(set) var asking = false
    @ObservationIgnored private var lookAt = Date.distantPast
    @ObservationIgnored private var briefAt = Date.distantPast

    private var socket: URLSessionWebSocketTask?
    private var loop: Task<Void, Never>?
    private var refreshTask: Task<Void, Never>?
    private var backoff: Double = 1
    private let session = URLSession(configuration: .ephemeral)
    private static let activityKinds: Set<String> = ["tool.called", "turn.started", "agent.thinking", "subagent.started", "file.changed", "check.ran"]
    private static let changeKinds: Set<String> = ["run.created", "run.status", "approval.requested", "approval.decided", "turn.completed", "run.archived"]

    init() {
        pairing = Keychain.load()
        // Development: `simctl launch` with SIMCTL_CHILD_SPARK_PAIRING='{json}' pairs the simulator without a camera.
        if let dev = ProcessInfo.processInfo.environment["SPARK_PAIRING"], let p = try? JSONDecoder().decode(SparkPairing.self, from: Data(dev.utf8)) { pairing = p }
        state = pairing == nil ? .unpaired : .connecting
        #if DEBUG
        if ProcessInfo.processInfo.environment["SHUA_DEMO"] == "1" { demo() }
        #endif
    }

    #if DEBUG
    /// Simulator only: a believable day, so every screen can be seen without a Mac. Never in a release build.
    private func demo() {
        let now = Date.now.timeIntervalSince1970 * 1000
        pairing = SparkPairing(v: 1, host: "demo.ts.net", port: 0, key: String(repeating: "d", count: 32), name: "Josh's MacBook Pro")
        state = .live
        runs = [
            CrewRun(id: "r1", title: "Frame: architecture review", status: "awaiting_approval", ticker: "Mapping the project before reading the core modules", updatedAt: now - 60_000, createdAt: now - 14 * 60_000),
            CrewRun(id: "r2", title: "Landing page for Shua Labs", status: "running", ticker: "Writing the pricing section", updatedAt: now - 5_000, createdAt: now - 6 * 60_000),
            CrewRun(id: "r3", title: "Fix the flaky upload test", status: "done", ticker: "Fixed: the retry now waits for the upload to settle. 42 tests pass.", updatedAt: now - 30 * 60_000, createdAt: now - 50 * 60_000),
        ]
        approvals = [CrewApproval(id: "a1", run: "r1", tool: "commandExecution", risk: "medium", reason: "no rule covers this call, so a person decides",
                                  summary: "pwd && rg --files -g '*.swift'", at: now - 60_000, what: "look through the project's files", why: "It hasn't asked to do this before.", command: "pwd && rg --files -g '*.swift'")]
        brief = ShuaBrief(headline: "1 thing needs you, 1 working", lines: [], waiting: 1, working: 1, finished: 1,
                          next: [.init(name: "Morning standup", at: .now.addingTimeInterval(3 * 3600)), .init(name: "Nightly backup", at: .now.addingTimeInterval(11 * 3600))])
        chat = [ShuaLine(role: .you, text: "What's going on?"),
                ShuaLine(role: .shua, text: "**One thing needs you:** the Frame review wants to look through the project's files. The landing page is being written now, and the upload test fix finished with all 42 tests passing.")]
        todayRuns = 3
    }
    #endif

    var activeRuns: [CrewRun] { runs.filter(\.active).sorted { $0.updatedAt > $1.updatedAt } }

    // MARK: Pairing

    func pair(with text: String) async {
        do {
            let p = try JSONDecoder().decode(SparkPairing.self, from: Data(text.trimmingCharacters(in: .whitespacesAndNewlines).utf8))
            guard p.v == 1, p.key.count >= 32, p.port > 0 else { throw URLError(.badURL) }
            pairing = p
            _ = try await request("GET", "/phone/hello")
            try Keychain.save(p)
            error = nil
            start()
        } catch {
            pairing = Keychain.load()
            self.error = "That code didn't work. Make sure Tailscale is on for both devices, then scan a fresh code on the Mac."
        }
    }

    func unpair() {
        stop()
        Keychain.clear()
        pairing = nil; runs = []; approvals = []
        state = .unpaired
    }

    // MARK: Connection

    func start() {
        #if DEBUG
        if ProcessInfo.processInfo.environment["SHUA_DEMO"] == "1" { return }
        #endif
        guard pairing != nil, loop == nil else { return }
        loop = Task { [weak self] in await self?.run() }
    }

    func stop() {
        loop?.cancel(); loop = nil
        socket?.cancel(with: .goingAway, reason: nil); socket = nil
    }

    private func run() async {
        while !Task.isCancelled, let pairing {
            state = .connecting
            do {
                let head = try await refresh()
                var request = URLRequest(url: URL(string: "ws://\(pairing.host):\(pairing.port)/phone/ws")!)
                request.setValue(pairing.key, forHTTPHeaderField: "x-shuacrew-key")
                let ws = session.webSocketTask(with: request)
                socket = ws
                ws.resume()
                try await ws.send(.string(#"{"type":"subscribe","after":\#(head)}"#))
                state = .live
                backoff = 1
                let pinger = Task { [weak ws] in
                    while !Task.isCancelled {
                        try? await Task.sleep(for: .seconds(20))
                        try? await ws?.send(.string(#"{"type":"ping"}"#))
                    }
                }
                defer { pinger.cancel() }
                while !Task.isCancelled {
                    let message = try await ws.receive()
                    if case .string(let text) = message { receive(text) }
                }
            } catch {
                guard !Task.isCancelled else { return }
                state = .offline((error as? URLError)?.code == .userAuthenticationRequired ? "This iPhone isn't paired anymore" : "Can't reach \(pairing.name)")
            }
            socket = nil
            try? await Task.sleep(for: .seconds(backoff))
            backoff = min(backoff * 2, 30)
        }
    }

    private func receive(_ text: String) {
        guard let message = try? JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any],
              message["type"] as? String == "events", message["replay"] as? Bool != true,
              let events = message["events"] as? [[String: Any]] else { return }
        let kinds = events.compactMap { $0["kind"] as? String }
        if kinds.contains(where: Self.activityKinds.contains) { lastActivity = .now }
        if kinds.contains(where: Self.changeKinds.contains) { scheduleRefresh() }
    }

    /// Bursts of events (a run finishing writes several) become one fetch.
    private func scheduleRefresh() {
        refreshTask?.cancel()
        refreshTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
            _ = try? await self?.refresh()
        }
    }

    @discardableResult private func refresh() async throws -> Int {
        let data = try await request("GET", "/phone/api/snapshot")
        guard let snapshot = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw URLError(.cannotParseResponse) }
        let before = Dictionary(uniqueKeysWithValues: runs.map { ($0.id, $0.status) })
        let next = ((snapshot["runs"] as? [String: [String: Any]]) ?? [:]).values.compactMap(Self.run(from:))
        let waiting = ((snapshot["approvals"] as? [String: [String: Any]]) ?? [:]).values.compactMap(Self.approval(from:)).sorted { $0.at < $1.at }
        if waiting.count > approvals.count { UINotificationFeedbackGenerator().notificationOccurred(.warning) }
        if let done = next.first(where: { $0.finished && before[$0.id] != nil && before[$0.id] != $0.status }) {
            celebrating = done
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            Task { [weak self] in
                try? await Task.sleep(for: .seconds(4))
                if self?.celebrating == done { self?.celebrating = nil }
            }
        }
        runs = next
        approvals = waiting
        todayRuns = ((snapshot["today"] as? [String: Any])?["runs"] as? Int) ?? 0
        Task { [weak self] in await self?.refreshExtras() }
        return (snapshot["head"] as? Int) ?? 0
    }

    /// The look (every few minutes: it rarely changes) and the brief (at most every 15 s).
    private func refreshExtras() async {
        if Date.now.timeIntervalSince(lookAt) > 300, let data = try? await request("GET", "/phone/api/shua/look"),
           let next = try? JSONDecoder().decode(ShuaLook.self, from: data) {
            lookAt = .now
            if next != look { look = next; next.cache() }
        }
        if Date.now.timeIntervalSince(briefAt) > 15, let data = try? await request("GET", "/phone/api/brief"),
           let j = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            briefAt = .now
            let text = (j["text"] as? String) ?? ""
            brief = ShuaBrief(headline: (j["headline"] as? String) ?? "", lines: text.split(separator: "\n").map(String.init).filter { !$0.hasPrefix("HEADLINE") },
                              waiting: (j["waiting"] as? [Any])?.count ?? 0, working: (j["working"] as? [Any])?.count ?? 0, finished: (j["finished"] as? [Any])?.count ?? 0,
                              next: ((j["next"] as? [[String: Any]]) ?? []).compactMap { n in (n["name"] as? String).map { ShuaBrief.Upcoming(name: $0, at: Date(timeIntervalSince1970: ((n["at"] as? Double) ?? 0) / 1000)) } })
        }
    }

    /// Pull to refresh: the snapshot and the brief now.
    func reload() async { briefAt = .distantPast; _ = try? await refresh() }

    // MARK: Shua

    /// Something Shua says on its own, from this phone (what its eyes noticed): shown like a reply, and spoken.
    func note(_ text: String) {
        guard !asking else { return } // never talk over an answer on its way
        chat.append(ShuaLine(role: .shua, text: text))
        if chat.count > 40 { chat.removeFirst(chat.count - 40) }
        speak(text)
    }

    /// Ask the Mac's own Shua. It does it there (open apps, music, the crew, a brief…) and its reply streams back here.
    func ask(_ raw: String) async {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !asking else { return }
        asking = true
        defer { asking = false }
        chat.append(ShuaLine(role: .you, text: text))
        chat.append(ShuaLine(role: .shua, text: "", pending: true))
        if chat.count > 40 { chat.removeFirst(chat.count - 40) }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        // "Open YouTube", "go to espn.com": an iPhone app or a site, asked here, opens here, at once. ("…on my Mac" goes to the Mac.)
        if let here = PhoneHands.intent(text) {
            if await PhoneHands.open(here.urls) { let said = "Opening \(here.name) here."; reply(said); speak(said); return }
        }
        do {
            let head = try await refresh() // only what happens after this moment is part of the answer
            // The notch may be reconnecting for a moment (a restart on the Mac): try once more before saying it isn't open.
            let posted: Data
            do { posted = try await request("POST", "/phone/api/shua/remote", body: ["text": text]) }
            catch let e as LinkError where e.code == 409 { try await Task.sleep(for: .seconds(3)); posted = try await request("POST", "/phone/api/shua/remote", body: ["text": text]) }
            guard let id = (try? JSONSerialization.jsonObject(with: posted) as? [String: Any])?["id"] as? String else { throw URLError(.cannotParseResponse) }
            var run: String?
            for _ in 0..<40 where run == nil {
                try await Task.sleep(for: .milliseconds(500))
                let state = try await request("GET", "/phone/api/shua/remote/\(id)")
                let ask = (try? JSONSerialization.jsonObject(with: state) as? [String: Any]) ?? [:]
                // Done on the Mac at once (pause, next, volume, open…): no conversation to follow, just what Shua said.
                if let answer = ask["answer"] as? String {
                    let ok = ask["ok"] as? Bool != false
                    reply(answer, failed: !ok)
                    if ok { speak(Self.speakable(answer)) }
                    return
                }
                run = ask["run"] as? String
            }
            guard let run else { return reply("Shua on your Mac didn't pick that up. Is ShuaCrew open there?", failed: true) }
            try await follow(run: run, after: head, asked: text)
        } catch {
            let said = (error as? LinkError)?.message ?? "That didn't reach your Mac. Check the connection and try again."
            reply(said, failed: true)
        }
    }

    /// Follow Shua's turns on this ask: the one that starts with your words, and any it takes after (it may look,
    /// act, and look again). Done when a turn ends and no new one starts for a few seconds.
    private func follow(run: String, after head: Int, asked: String) async throws {
        var cursor = head, mine: Int?, latest = "", texts: [Int: String] = [:], quietSince: Date?
        let marker = "From my iPhone: " + asked.prefix(40)
        let deadline = Date.now.addingTimeInterval(150)
        while Date.now < deadline {
            let data = try await request("GET", "/phone/api/runs/\(run)/events?after=\(cursor)")
            let events = (try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]) ?? []
            for e in events {
                cursor = max(cursor, (e["seq"] as? Int) ?? cursor)
                let body = (e["body"] as? [String: Any]) ?? [:], turn = (body["turn"] as? Int) ?? 0
                switch e["kind"] as? String {
                case "turn.started":
                    if mine == nil, ((body["text"] as? String) ?? "").contains(marker) { mine = turn }
                    if let m = mine, turn >= m { quietSince = nil }
                case "agent.delta":
                    guard let m = mine, turn >= m else { continue }
                    texts[turn, default: ""] += (body["text"] as? String) ?? ""
                    latest = texts[turn] ?? latest
                    update(Self.clean(latest), pending: true)
                case "agent.message":
                    guard let m = mine, turn >= m, body["final"] as? Bool == true else { continue }
                    if let t = body["text"] as? String, !t.isEmpty { latest = t }
                    update(Self.clean(latest), pending: true)
                    quietSince = .now
                default: break
                }
            }
            if let q = quietSince, Date.now.timeIntervalSince(q) > 3 { break }
            try await Task.sleep(for: .milliseconds(400))
        }
        let final = Self.clean(latest), opens = PhoneHands.opens(in: latest)
        reply(final.isEmpty ? (opens.isEmpty ? "Done." : "Here it is.") : final, links: PhoneHands.links(in: latest, plus: opens))
        if !opens.isEmpty { _ = await PhoneHands.open(opens) } // Shua brought it up on this phone
        speak(Self.speakable(final))
    }

    /// Shua's reply, aloud, in the same voice as on the Mac: ShuaCrew's voice engine through the phone door, clip by
    /// clip as they're made. The iPhone's own voice only if the engine can't be reached.
    func speak(_ text: String) {
        let voice = ShuaVoice.shared
        guard voice.enabled, !text.isEmpty else { return }
        guard let id = look?.voiceId, pairing != nil else { voice.say(text); return }
        let speed = min(1.2, max(0.8, look?.voiceSpeed ?? 1)), g = voice.begin()
        Task { [weak self] in
            guard let self else { return }
            var spoke = false
            for piece in Self.pieces(text) {
                guard let stream = try? await self.stream("/phone/api/speech/synthesize", body: ["id": "phone-\(g)-\(UUID().uuidString.prefix(8))", "generation": 1, "voiceId": id, "text": piece, "speed": speed]) else { break }
                do {
                    for try await line in stream.lines {
                        guard let j = try? JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any], j["type"] as? String == "audio",
                              let b64 = j["data"] as? String, let clip = Data(base64Encoded: b64) else { continue }
                        voice.enqueue(clip, generation: g); spoke = true
                    }
                } catch { break }
            }
            if !spoke { voice.say(text) } // the engine isn't there: still say it
        }
    }

    /// The engine takes up to 600 characters a request: whole sentences, packed.
    static func pieces(_ text: String) -> [String] {
        var out: [String] = [], current = ""
        text.enumerateSubstrings(in: text.startIndex..., options: .bySentences) { s, _, _, _ in
            guard let s = s?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty else { return }
            for part in stride(from: 0, to: s.count, by: 560).map({ String(s.dropFirst($0).prefix(560)) }) {
                if current.count + part.count + 1 > 560, !current.isEmpty { out.append(current); current = "" }
                current += current.isEmpty ? part : " " + part
            }
        }
        if !current.isEmpty { out.append(current) }
        return out
    }

    private func update(_ text: String, pending: Bool) {
        guard let i = chat.lastIndex(where: { $0.role == .shua }) else { return }
        chat[i].text = text; chat[i].pending = pending
    }
    private func reply(_ text: String, failed: Bool = false, links: [URL] = []) {
        guard let i = chat.lastIndex(where: { $0.role == .shua }) else { return }
        chat[i].text = text; chat[i].pending = false; chat[i].failed = failed; chat[i].links = links
        UINotificationFeedbackGenerator().notificationOccurred(failed ? .error : .success)
    }

    /// What's said aloud: the words without Markdown (**bold**, `code`, # headings, - bullets, [links](…)), which a voice
    /// would otherwise read as stars and symbols.
    static func speakable(_ text: String) -> String {
        var t = text.replacingOccurrences(of: #"\[([^\]]+)\]\([^)]*\)"#, with: "$1", options: .regularExpression)
        t = t.replacingOccurrences(of: #"(?m)^\s{0,3}(#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s?)"#, with: "", options: .regularExpression)
        t = t.replacingOccurrences(of: #"(\*\*|__|\*|`|~~)"#, with: "", options: .regularExpression)
        return t.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Shua's words as styled text: bold and italics and code as they're meant to look, never literal stars.
    static func styled(_ text: String) -> AttributedString {
        (try? AttributedString(markdown: text, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(text)
    }

    /// What a person reads: Shua's words without its machine blocks (```do …```, or the same written as a tag:
    /// `<do>{"type":"open","app":"Music"}</do>`) or bracketed notes.
    static func clean(_ text: String) -> String {
        var t = text.replacingOccurrences(of: "```[\\s\\S]*?(```|$)", with: "", options: .regularExpression)
        t = t.replacingOccurrences(of: #"<(do|act|point|guide|draw|visual|zoom)>[\s\S]*?(</\1>|$)"#, with: "", options: .regularExpression)
        t = t.replacingOccurrences(of: "[ \t]?\u{E200}[^\u{E201}]*(\u{E201}|$)", with: "", options: .regularExpression) // web-search citation markers
        t = t.split(separator: "\n").filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("[") }.joined(separator: "\n")
        return t.replacingOccurrences(of: "[ \\t]+", with: " ", options: .regularExpression).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // MARK: Actions

    /// Allowing needs Face ID: a phone can be picked up by someone else. Denying is always safe.
    func decide(_ approval: CrewApproval, allow: Bool) async {
        do {
            if allow {
                let context = LAContext()
                context.localizedCancelTitle = "Keep waiting"
                guard try await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Allow \(approval.tool) on your Mac") else { return }
            }
            _ = try await request("POST", "/phone/api/approvals/\(approval.id)", body: ["allow": allow, "by": "you (iPhone)"])
            approvals.removeAll { $0.id == approval.id }
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            scheduleRefresh()
        } catch { self.error = "That decision didn't reach the Mac. It's still waiting there." }
    }

    func start(ask: String) async -> Bool {
        let ask = ask.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !ask.isEmpty else { return false }
        do {
            _ = try await request("POST", "/phone/api/runs", body: ["ask": ask, "title": String(ask.prefix(80))])
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            lastActivity = .now
            scheduleRefresh()
            return true
        } catch { self.error = "The crew didn't get that. Check the connection and try again."; return false }
    }

    func cancel(_ run: CrewRun) async {
        _ = try? await request("POST", "/phone/api/runs/\(run.id)/cancel", body: [:])
        scheduleRefresh()
    }

    // MARK: Plumbing

    /// A streamed POST (newline-delimited JSON) through the phone door.
    private func stream(_ path: String, body: [String: Any]) async throws -> URLSession.AsyncBytes {
        guard let pairing, let url = URL(string: "http://\(pairing.host):\(pairing.port)\(path)") else { throw URLError(.badURL) }
        var request = URLRequest(url: url, timeoutInterval: 30)
        request.httpMethod = "POST"
        request.setValue(pairing.key, forHTTPHeaderField: "x-shuacrew-key")
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (bytes, response) = try await session.bytes(for: request)
        guard ((response as? HTTPURLResponse)?.statusCode ?? 0) == 200 else { throw URLError(.badServerResponse) }
        return bytes
    }

    private func request(_ method: String, _ path: String, body: [String: Any]? = nil) async throws -> Data {
        guard let pairing, let url = URL(string: "http://\(pairing.host):\(pairing.port)\(path)") else { throw URLError(.badURL) }
        var request = URLRequest(url: url, timeoutInterval: 8)
        request.httpMethod = method
        request.setValue(pairing.key, forHTTPHeaderField: "x-shuacrew-key")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "content-type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await session.data(for: request)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        if code == 401 { throw URLError(.userAuthenticationRequired) }
        guard (200..<300).contains(code) else { throw LinkError(code: code, message: (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String) }
        return data
    }

    private static func run(from j: [String: Any]) -> CrewRun? {
        guard let id = j["id"] as? String, let status = j["status"] as? String, j["archived"] as? Bool != true else { return nil }
        return CrewRun(id: id, title: (j["title"] as? String) ?? "Untitled", status: status, ticker: (j["ticker"] as? String) ?? "", updatedAt: (j["updatedAt"] as? Double) ?? 0, createdAt: (j["createdAt"] as? Double) ?? 0)
    }

    private static func approval(from j: [String: Any]) -> CrewApproval? {
        guard let id = j["id"] as? String, let tool = j["tool"] as? String else { return nil }
        let input = j["input"] as? [String: Any]
        // What a person needs to judge it: the command, the file, or the URL, never the whole payload.
        let summary = (input?["command"] ?? input?["file_path"] ?? input?["path"] ?? input?["url"]) as? String
            ?? (input.flatMap { try? JSONSerialization.data(withJSONObject: $0) }.map { String(decoding: $0, as: UTF8.self) } ?? "")
        let command = (input?["command"] as? String).map(Plainly.unwrap)
        let path = (input?["file_path"] ?? input?["path"]) as? String
        return CrewApproval(id: id, run: j["run"] as? String, tool: tool, risk: (j["risk"] as? String) ?? "", reason: (j["reason"] as? String) ?? "",
                            summary: String((command ?? summary).prefix(300)), at: (j["at"] as? Double) ?? 0,
                            what: Plainly.asking(tool: tool, command: command, path: path), why: Plainly.why(rule: j["rule"] as? String, reason: (j["reason"] as? String) ?? ""),
                            command: command.map { String($0.prefix(300)) })
    }
}

/// The pairing key lives in the Keychain, this device only: it never syncs to iCloud or lands in a backup.
private enum Keychain {
    static var query: [String: Any] { [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "dev.shuacrew.spark-link", kSecAttrAccount as String: "pairing"] }
    static func save(_ pairing: SparkPairing) throws {
        clear()
        var item = query
        item[kSecValueData as String] = try JSONEncoder().encode(pairing)
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else { throw URLError(.cannotCreateFile) }
    }
    static func load() -> SparkPairing? {
        var q = query
        q[kSecReturnData as String] = true
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return try? JSONDecoder().decode(SparkPairing.self, from: data)
    }
    static func clear() { SecItemDelete(query as CFDictionary) }
}

/// What Shua does on this phone itself. "Open YouTube" asked here opens it here (an iPhone app by its own link, the
/// website if the app isn't installed); a page, place or song Shua finds for you comes back as a ```phone {"open": …}```
/// block and opens here too; and every page a reply points to becomes a card you can tap.
enum PhoneHands {
    /// iPhone apps by what you'd call them: their own link first, then the website.
    static let apps: [String: [String]] = [
        "music": ["music://"], "apple music": ["music://"], "maps": ["maps://"], "apple maps": ["maps://"], "messages": ["sms:"],
        "mail": ["message://"], "calendar": ["calshow://"], "photos": ["photos-redirect://"], "notes": ["mobilenotes://"],
        "reminders": ["x-apple-reminderkit://"], "facetime": ["facetime://"], "app store": ["itms-apps://"], "podcasts": ["podcasts://"],
        "books": ["ibooks://"], "shortcuts": ["shortcuts://"], "safari": ["https://www.google.com"], "google": ["https://www.google.com"],
        "youtube": ["youtube://", "https://www.youtube.com"], "spotify": ["spotify://", "https://open.spotify.com"],
        "instagram": ["instagram://app", "https://www.instagram.com"], "whatsapp": ["whatsapp://", "https://www.whatsapp.com"],
        "x": ["twitter://", "https://x.com"], "twitter": ["twitter://", "https://x.com"], "slack": ["slack://open", "https://app.slack.com"],
        "discord": ["discord://", "https://discord.com/app"], "gmail": ["googlegmail://", "https://mail.google.com"],
        "google maps": ["comgooglemaps://", "https://maps.google.com"], "netflix": ["nflx://", "https://www.netflix.com"],
        "uber": ["uber://", "https://m.uber.com"], "reddit": ["reddit://", "https://www.reddit.com"], "linkedin": ["linkedin://", "https://www.linkedin.com"],
        "github": ["github://", "https://github.com"], "espn": ["sportscenter://", "https://www.espn.com"], "amazon": ["com.amazon.mobile.shopping://", "https://www.amazon.com"],
    ]

    /// "open YouTube", "pull up espn.com on my phone": what to open here. Nil when it's for the Mac (it says so, or it
    /// isn't an iPhone app or a site): the Mac's Shua takes it.
    static func intent(_ text: String) -> (name: String, urls: [URL])? {
        var s = text.lowercased().trimmingCharacters(in: .whitespacesAndNewlines.union(.punctuationCharacters))
        if s.range(of: #"\bon (my |the )?mac(book)?\b"#, options: .regularExpression) != nil { return nil }
        s = s.replacingOccurrences(of: #"^(hey |ok |okay )?(shua[, ]+)?((can|could|would|will) you( please| just| actually)* )?(please |just )?"#, with: "", options: .regularExpression)
        guard let m = s.firstMatch(of: /^(?:open|launch|pull up|bring up|go to)\s+(?:up\s+)?(?:the\s+)?(.+?)(?:\s+app)?(?:\s+(?:on|in)\s+(?:my|the|this)\s+(?:phone|iphone))?(?:\s+(?:please|for me))?$/) else { return nil }
        let name = String(m.1)
        let pretty = ["youtube": "YouTube", "facetime": "FaceTime", "linkedin": "LinkedIn", "github": "GitHub", "whatsapp": "WhatsApp", "espn": "ESPN", "x": "X", "app store": "the App Store"]
        if let found = apps[name] { return (pretty[name] ?? name.capitalized, found.compactMap(URL.init(string:))) }
        if name.range(of: #"^[a-z0-9-]+(\.[a-z0-9-]+)+(/\S*)?$"#, options: .regularExpression) != nil, let url = URL(string: "https://\(name)") { return (name, [url]) }
        return nil
    }

    /// Opens the first that works (the app, else its website). False when none could open.
    @MainActor static func open(_ urls: [URL]) async -> Bool {
        for url in urls where await UIApplication.shared.open(url) { return true }
        return false
    }

    /// ```phone {"open": "https://…"}``` (or a list): what Shua brings up on this phone. Web pages and maps only.
    static func opens(in text: String) -> [URL] {
        var out: [URL] = []
        for m in text.matches(of: /```phone\s*([\s\S]*?)```/) {
            let v = try? JSONSerialization.jsonObject(with: Data(String(m.1).utf8))
            for o in (v as? [[String: Any]]) ?? [(v as? [String: Any]) ?? [:]] {
                if let s = o["open"] as? String, let u = URL(string: s), ["http", "https", "maps"].contains(u.scheme?.lowercased() ?? ""), !out.contains(u) { out.append(u) }
            }
        }
        return Array(out.prefix(2))
    }

    /// The pages a reply points to (Markdown links and bare addresses), plus what it brought up: first three, for cards.
    static func links(in text: String, plus first: [URL] = []) -> [URL] {
        var out = first.filter { ["http", "https"].contains($0.scheme?.lowercased() ?? "") }
        let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
        for m in detector?.matches(in: text, range: NSRange(text.startIndex..., in: text)) ?? [] {
            if let u = m.url, ["http", "https"].contains(u.scheme?.lowercased() ?? ""), !out.contains(u) { out.append(u) }
        }
        return Array(out.prefix(3))
    }
}
