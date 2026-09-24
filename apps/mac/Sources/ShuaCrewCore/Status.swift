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

    public let running: Int
    public let awaiting: Int
    public let reviewing: Int
    public let approvals: [Approval]
    public let limited: [String]
    public let recent: [Finished]

    enum CodingKeys: String, CodingKey { case running, awaiting, reviewing, approvals, limited, recent }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        running = try c.decode(Int.self, forKey: .running)
        awaiting = try c.decode(Int.self, forKey: .awaiting)
        reviewing = try c.decode(Int.self, forKey: .reviewing)
        approvals = try c.decode([Approval].self, forKey: .approvals)
        limited = try c.decode([String].self, forKey: .limited)
        recent = try c.decodeIfPresent([Finished].self, forKey: .recent) ?? [] // older gateways don't send it
    }

    public init(running: Int, awaiting: Int, reviewing: Int, approvals: [Approval], limited: [String], recent: [Finished] = []) {
        self.running = running; self.awaiting = awaiting; self.reviewing = reviewing; self.approvals = approvals; self.limited = limited
        self.recent = recent
    }

    public static let empty = CrewStatus(running: 0, awaiting: 0, reviewing: 0, approvals: [], limited: [])

    /// "3 running · 1 awaiting you · 2 to review", or "All quiet".
    public var headline: String {
        var parts: [String] = []
        if running > 0 { parts.append("\(running) running") }
        if awaiting > 0 { parts.append("\(awaiting) awaiting you") }
        if reviewing > 0 { parts.append("\(reviewing) to review") }
        return parts.isEmpty ? "All quiet" : parts.joined(separator: " · ")
    }

    /// The number beside the menu-bar icon: approvals first (they block work), then running.
    public var badge: String? {
        if awaiting > 0 { return "\(awaiting)" }
        if running > 0 { return "\(running)" }
        return nil
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
