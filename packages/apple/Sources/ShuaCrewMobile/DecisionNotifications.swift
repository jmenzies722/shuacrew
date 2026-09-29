import Foundation

/// Input must come from CompanionSession's signature-verified view, never a push payload.
public struct DecisionNotificationPlanner: Sendable {
    public private(set) var history: [String]
    public init(history: [String] = []) { self.history = Array(history.suffix(200)) }
    public func candidates(_ snapshot: MobileSnapshot, enabled: Bool, now: Int64) -> [String] {
        guard enabled, now >= 0, Double(now) - Double(snapshot.observedAt) < 60000,
              Double(snapshot.observedAt) - Double(now) <= 30000 else { return [] }
        let seen = Set(history)
        return Array(snapshot.offers.lazy.filter {
            $0.issuedAt <= now && $0.expiresAt > now && !seen.contains($0.offerId)
        }.prefix(5).map(\.offerId))
    }
    public mutating func delivered(_ offerId: String) {
        history.removeAll { $0 == offerId }; history.append(offerId)
        if history.count > 200 { history.removeFirst(history.count - 200) }
    }
}
