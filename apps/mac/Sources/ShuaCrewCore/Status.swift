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

    public let running: Int
    public let awaiting: Int
    public let reviewing: Int
    public let approvals: [Approval]
    public let limited: [String]

    public init(running: Int, awaiting: Int, reviewing: Int, approvals: [Approval], limited: [String]) {
        self.running = running; self.awaiting = awaiting; self.reviewing = reviewing; self.approvals = approvals; self.limited = limited
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

    /// Approvals that weren't pending last time — each gets one notification, never two.
    public func newApprovals(since previous: Set<String>) -> [Approval] {
        approvals.filter { !previous.contains($0.id) }
    }
}
