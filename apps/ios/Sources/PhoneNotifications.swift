import Foundation
import Combine
import UserNotifications
import ShuaCrewMobile

@MainActor final class PhoneNotifications: ObservableObject {
    @Published private(set) var enabled: Bool
    @Published private(set) var status = "Decision alerts are off"
    private let defaults = UserDefaults.standard
    private var planner: DecisionNotificationPlanner
    private var generation = UUID()
    init() {
        enabled = UserDefaults.standard.bool(forKey: "mobile.alerts")
        planner = DecisionNotificationPlanner(history: UserDefaults.standard.stringArray(forKey: "mobile.alertHistory") ?? [])
        if enabled { status = "Alerts enabled · background delivery requires private sync" }
    }
    func requestPermission() async -> Bool {
        let current = generation
        do {
            let granted = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])
            guard generation == current else { return false }
            enabled = granted; defaults.set(granted, forKey: "mobile.alerts")
            status = granted ? "Alerts enabled · preparing background refresh" : "Notifications are disabled in iOS Settings"
            return granted
        } catch {
            status = "Notification permission could not be checked. Try again."
            return false
        }
    }
    func backgroundReady(_ ready: Bool) {
        guard enabled else { return }
        status = ready ? "Decision alerts enabled · iOS controls background delivery" : "Alerts enabled while syncing · background setup needs retry"
    }
    func disable() {
        enabled = false; defaults.set(false, forKey: "mobile.alerts")
        clear(); status = "Decision alerts are off"
    }
    func clear() {
        generation = UUID()
        planner = DecisionNotificationPlanner(); defaults.removeObject(forKey: "mobile.alertHistory")
        UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
        UNUserNotificationCenter.current().removeAllDeliveredNotifications()
    }
    func receiveVerified(_ snapshot: MobileSnapshot, now: Int64) async {
        let current = generation
        for id in planner.candidates(snapshot, enabled: enabled, now: now) {
            guard enabled, generation == current, !Task.isCancelled else { return }
            let content = UNMutableNotificationContent()
            content.title = "ShuaCrew needs your review"
            content.body = "A crew decision is ready. Open ShuaCrew to review its details."
            content.sound = .default
            content.threadIdentifier = "crew-decisions"
            // Only opaque navigation hints. Never include tool inputs, room text or Allow actions.
            content.userInfo = ["offerId": id, "installationId": snapshot.installationId]
            let request = UNNotificationRequest(identifier: "decision-\(id)", content: content, trigger: nil)
            do {
                try await UNUserNotificationCenter.current().add(request)
                guard enabled, generation == current, !Task.isCancelled else {
                    UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [request.identifier])
                    UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [request.identifier])
                    return
                }
                planner.delivered(id); defaults.set(planner.history, forKey: "mobile.alertHistory")
            } catch { status = "Could not deliver a decision alert. Open Today to review."; return }
        }
    }
}
