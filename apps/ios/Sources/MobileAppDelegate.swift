import UIKit
import CloudKit
@preconcurrency import UserNotifications

@MainActor final class MobileAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    let model = MobileModel()
    private var backgroundWork: Task<Void, Never>?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }
    func application(_ application: UIApplication, didReceiveRemoteNotification userInfo: [AnyHashable: Any], fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
        guard backgroundWork == nil, model.notifications.enabled, let notification = CKNotification(fromRemoteNotificationDictionary: userInfo),
              notification.subscriptionID?.hasPrefix("shuacrew-decisions-") == true else { completionHandler(.noData); return }
        let reply = BackgroundFetchReply(completionHandler)
        let work = Task {
            defer { backgroundWork = nil }
            await model.resume()
            let refreshed = await model.refreshForNotification()
            reply.finish(refreshed ? .newData : .noData)
        }
        backgroundWork = work
        Task {
            try? await Task.sleep(for: .seconds(20))
            work.cancel(); reply.finish(.failed)
        }
    }
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        guard response.actionIdentifier == UNNotificationDefaultActionIdentifier,
              let id = response.notification.request.content.userInfo["offerId"] as? String,
              let installation = response.notification.request.content.userInfo["installationId"] as? String,
              id.utf8.count <= 256, installation.utf8.count <= 256 else { return }
        await model.openDecisionHint(id: id, installation: installation)
    }
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions { [] }
}

@MainActor private final class BackgroundFetchReply {
    private var completion: ((UIBackgroundFetchResult) -> Void)?
    init(_ completion: @escaping (UIBackgroundFetchResult) -> Void) { self.completion = completion }
    func finish(_ result: UIBackgroundFetchResult) {
        let callback = completion; completion = nil; callback?(result)
    }
}
