import Foundation
import ShuaCrewCore
import Testing

@Test func notificationsRequireOptInAndRespectIndividualMutes() {
    var prefs = NotificationPreferences()
    #expect(!prefs.shouldNotify(.completion, hour: 12, appActive: false))
    prefs.enabled = true
    #expect(prefs.shouldNotify(.completion, hour: 12, appActive: false))
    #expect(!prefs.shouldNotify(.completion, hour: 12, appActive: true))
    prefs.completions = false
    #expect(!prefs.shouldNotify(.completion, hour: 12, appActive: false))
    #expect(prefs.shouldNotify(.approval, hour: 12, appActive: false))
    prefs.approvals = false
    #expect(!prefs.shouldNotify(.approval, hour: 12, appActive: false))
    prefs.reviews = false
    prefs.briefings = false
    #expect(!prefs.shouldNotify(.review, hour: 12, appActive: false))
    #expect(!prefs.shouldNotify(.briefing, hour: 12, appActive: false))
}

@Test func quietHoursWorkAcrossMidnightAndWithinOneDay() {
    var prefs = NotificationPreferences()
    prefs.enabled = true
    prefs.quietHours = true
    prefs.quietStart = 22
    prefs.quietEnd = 8
    for hour in [22, 23, 0, 7] { #expect(!prefs.shouldNotify(.approval, hour: hour, appActive: false)) }
    for hour in [8, 12, 21] { #expect(prefs.shouldNotify(.approval, hour: hour, appActive: false)) }
    prefs.quietStart = 9
    prefs.quietEnd = 17
    #expect(!prefs.shouldNotify(.review, hour: 9, appActive: false))
    #expect(prefs.shouldNotify(.review, hour: 17, appActive: false))
}

@Test func notificationChoicesPersistAndInvalidWritesLeaveThemIntact() throws {
    let suite = "ShuaCrew.tests.notifications.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    var prefs = NotificationPreferences()
    prefs.enabled = true
    prefs.sounds = false
    prefs.quietHours = true
    try prefs.save(to: defaults)
    let restored = NotificationPreferences.read(from: defaults)
    #expect(restored.enabled)
    #expect(!restored.sounds)
    #expect(!restored.shouldNotify(.completion, hour: 23, appActive: false))
    prefs.quietEnd = 99
    #expect(throws: (any Error).self) { try prefs.save(to: defaults) }
    #expect(NotificationPreferences.read(from: defaults).quietEnd == 8)
}
