import Foundation

/// `GET /api/status`: what the menu bar, the Dock badge and notifications need.
public struct CrewStatus: Decodable, Equatable, Sendable {
    public struct Approval: Decodable, Equatable, Sendable, Identifiable {
        public let id: String
        public let run: String?
        public let runTitle: String
        public let tool: String
        public let summary: String
        public let risk: String
        public let reason: String

        public init(id: String, run: String?, runTitle: String, tool: String, summary: String, risk: String, reason: String) {
            self.id = id; self.run = run; self.runTitle = runTitle; self.tool = tool; self.summary = summary; self.risk = risk; self.reason = reason
        }
    }

    /// A session that just finished: ready for review, failed, done or merged.
    public struct Finished: Decodable, Equatable, Sendable {
        public let id: String
        public let title: String
        public let status: String
        public let reason: String
        public let files: Int
        public init(id: String, title: String, status: String, reason: String, files: Int) {
            self.id = id; self.title = title; self.status = status; self.reason = reason; self.files = files
        }
        /// One key per outcome, so "ready for review" then "merged" are two notifications, not one.
        public var key: String { "\(id):\(status)" }
        public var headline: String {
            switch status {
            case "reviewing": return "Ready for review"
            case "failed": return "Session failed"
            case "merged": return "Merged"
            default: return "Finished"
            }
        }
        public var detail: String {
            switch status {
            case "reviewing": return "\(title) — \(files) file\(files == 1 ? "" : "s") changed"
            case "failed": return reason.isEmpty ? title : "\(title) — \(reason)"
            default: return title
            }
        }
    }

    /// A playbook phase waiting at its gate for you (or one that stopped).
    public struct Review: Decodable, Equatable, Sendable {
        public let play: String
        public let index: Int
        public let key: String
        public let title: String
        public let phase: String
        public let status: String
        public let who: String
        public let note: String
        public let last: Bool
        public init(play: String, index: Int, key: String, title: String, phase: String, status: String, who: String, note: String, last: Bool) {
            self.play = play; self.index = index; self.key = key; self.title = title; self.phase = phase; self.status = status; self.who = who; self.note = note; self.last = last
        }
        public var failed: Bool { status == "failed" }
        public var headline: String { failed ? "\(phase) stopped" : "\(phase) is ready for your review" }
        public var detail: String { failed ? (note.isEmpty ? title : "\(title) — \(note)") : (who.isEmpty ? title : "\(who) · \(title)") }
    }

    /// Today's morning briefing, when there is one.
    public struct Briefing: Decodable, Equatable, Sendable {
        public let id: String
        public let day: String
        public let headline: String
        public init(id: String, day: String, headline: String) { self.id = id; self.day = day; self.headline = headline }
    }

    public let running: Int
    public let awaiting: Int
    public let reviewing: Int
    public let approvals: [Approval]
    public let limited: [String]
    public let recent: [Finished]
    public let reviews: [Review]
    public let briefing: Briefing?
    /// Settings → Menu bar: "attention" (default), "running", "tokens" or "off".
    public var menuBar: String = "attention"
    public var tokensToday: Int = 0

    enum CodingKeys: String, CodingKey { case running, awaiting, reviewing, approvals, limited, recent, reviews, briefing, menuBar, tokensToday }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        running = try c.decode(Int.self, forKey: .running)
        awaiting = try c.decode(Int.self, forKey: .awaiting)
        reviewing = try c.decode(Int.self, forKey: .reviewing)
        approvals = try c.decode([Approval].self, forKey: .approvals)
        limited = try c.decode([String].self, forKey: .limited)
        recent = try c.decodeIfPresent([Finished].self, forKey: .recent) ?? [] // older gateways don't send it
        reviews = try c.decodeIfPresent([Review].self, forKey: .reviews) ?? []
        briefing = try c.decodeIfPresent(Briefing.self, forKey: .briefing)
        menuBar = try c.decodeIfPresent(String.self, forKey: .menuBar) ?? "attention"
        tokensToday = try c.decodeIfPresent(Int.self, forKey: .tokensToday) ?? 0
    }

    public init(running: Int, awaiting: Int, reviewing: Int, approvals: [Approval], limited: [String], recent: [Finished] = [], reviews: [Review] = []) {
        self.running = running; self.awaiting = awaiting; self.reviewing = reviewing; self.approvals = approvals; self.limited = limited
        self.recent = recent; self.reviews = reviews; self.briefing = nil
    }

    /// Everything that is waiting on you: tool approvals and playbook gates.
    public var needsYou: Int { awaiting + reviews.count }

    /// Playbook gates not seen before — each notifies once.
    public func newReviews(since seen: Set<String>) -> [Review] {
        reviews.filter { !seen.contains($0.key) }
    }

    public static let empty = CrewStatus(running: 0, awaiting: 0, reviewing: 0, approvals: [], limited: [])

    /// "3 running · 1 awaiting you · 2 to review", or "All quiet".
    public var headline: String {
        var parts: [String] = []
        if running > 0 { parts.append("\(running) running") }
        if awaiting > 0 { parts.append("\(awaiting) awaiting you") }
        if !reviews.isEmpty { parts.append("\(reviews.count) playbook review\(reviews.count == 1 ? "" : "s")") }
        if reviewing > 0 { parts.append("\(reviewing) to review") }
        return parts.isEmpty ? "All quiet" : parts.joined(separator: " · ")
    }

    /// The number beside the menu-bar icon: approvals first (they block work), then running.
    public var badge: String? {
        switch menuBar {
        case "off": return nil
        case "running": return running > 0 ? "\(running)" : nil
        case "tokens":
            if needsYou > 0 { return "\(needsYou)" } // approvals still win: they block work
            return tokensToday > 0 ? Self.compact(tokensToday) : nil
        default:
            if needsYou > 0 { return "\(needsYou)" }
            if running > 0 { return "\(running)" }
            return nil
        }
    }

    /// 386300 → "386k", 1250000 → "1.3M".
    public static func compact(_ n: Int) -> String {
        n >= 1_000_000 ? String(format: n >= 10_000_000 ? "%.0fM" : "%.1fM", Double(n) / 1_000_000) : n >= 1000 ? "\(n / 1000)k" : "\(n)"
    }

    /// Outcomes not seen before — each one notifies once.
    public func newlyFinished(since seen: Set<String>) -> [Finished] {
        recent.filter { !seen.contains($0.key) }
    }

    /// Approvals that weren't pending last time — each gets one notification, never two.
    public func newApprovals(since previous: Set<String>) -> [Approval] {
        approvals.filter { !previous.contains($0.id) }
    }
}
