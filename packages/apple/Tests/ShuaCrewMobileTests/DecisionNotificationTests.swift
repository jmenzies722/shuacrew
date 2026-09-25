import Foundation
import Testing
@testable import ShuaCrewMobile

@Test func decisionNotificationsRequireFreshEnabledObservationsAndAreBounded() throws {
    let offer: [String: Any] = ["version": 1, "installationId": "mac", "deviceId": "phone", "offerId": "offer", "runId": "run", "approvalId": "approval", "tool": "Bash", "inputDigest": String(repeating: "a", count: 64), "summary": "Sensitive request text", "nonce": "nonce", "issuedAt": 1000, "expiresAt": 3000, "requiresPhone": false]
    let body: [String: Any] = ["version": 1, "installationId": "mac", "deviceId": "phone", "sequence": 1, "observedAt": 1000, "rooms": [], "runs": [], "offers": [offer], "usage": ["inputTokens": 0, "outputTokens": 0, "cacheTokens": 0, "records": 0, "costUsd": NSNull()], "truncated": false]
    let snapshot = try MobileCodec.snapshot(JSONSerialization.data(withJSONObject: body))
    var planner = DecisionNotificationPlanner()
    #expect(planner.candidates(snapshot, enabled: false, now: 1500).isEmpty)
    #expect(planner.candidates(snapshot, enabled: true, now: 1500) == ["offer"])
    #expect(planner.candidates(snapshot, enabled: true, now: 3000).isEmpty)
    #expect(planner.candidates(snapshot, enabled: true, now: 61000).isEmpty)
    planner.delivered("offer")
    #expect(planner.candidates(snapshot, enabled: true, now: 1500).isEmpty)
    for index in 0..<300 { planner.delivered("other_\(index)") }
    #expect(planner.history.count == 200)
    #expect(!planner.history.contains("Sensitive request text"))
}
