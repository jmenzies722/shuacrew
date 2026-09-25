import Foundation

/// Native preferences: still in force with the window closed and after a relaunch.
public struct NotificationPreferences: Codable, Equatable, Sendable {
    public enum Kind { case approval, completion, review, briefing }
    public var enabled = false
    public var approvals = true
    public var completions = true
    public var reviews = true
    public var briefings = true
    public var sounds = true
    public var quietHours = false
    public var quietStart = 22
    public var quietEnd = 8
    private static let key = "notificationPreferences.v1"

    public init() {}

    private var valid: Bool {
        (0...23).contains(quietStart) && (0...23).contains(quietEnd) && (!quietHours || quietStart != quietEnd)
    }

    public static func read(from defaults: UserDefaults = .standard) -> Self {
        guard let data = defaults.data(forKey: key), let value = try? JSONDecoder().decode(Self.self, from: data), value.valid else { return Self() }
        return value
    }

    public func save(to defaults: UserDefaults = .standard) throws {
        guard valid else { throw NSError(domain: "ShuaCrew", code: 1, userInfo: [NSLocalizedDescriptionKey: "Choose different quiet-hour start and end times, from 00:00 to 23:00."]) }
        defaults.set(try JSONEncoder().encode(self), forKey: Self.key)
    }

    public func shouldNotify(_ kind: Kind, hour: Int, appActive: Bool) -> Bool {
        guard valid, enabled, !appActive else { return false }
        if quietHours {
            let quiet = quietStart < quietEnd ? hour >= quietStart && hour < quietEnd : hour >= quietStart || hour < quietEnd
            if quiet { return false }
        }
        switch kind {
        case .approval: return approvals
        case .completion: return completions
        case .review: return reviews
        case .briefing: return briefings
        }
    }
}
