import AppKit
import CoreLocation
import UserNotifications

/// One-shot location for the top-bar weather. Only runs when the page asks (you turned weather on);
/// macOS shows its own permission prompt the first time. Coordinates are rounded to ~1 km.
@MainActor
final class LocationOnce: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var reply: ((Result<CLLocationCoordinate2D, Error>) -> Void)?

    func request(_ done: @escaping (Result<CLLocationCoordinate2D, Error>) -> Void) {
        reply = done
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
        switch manager.authorizationStatus {
        case .notDetermined: manager.requestWhenInUseAuthorization()
        case .denied, .restricted: finish(.failure(NSError(domain: "ShuaCrew", code: 1, userInfo: [NSLocalizedDescriptionKey: "Location is off for ShuaCrew in System Settings → Privacy & Security → Location Services."])))
        default: manager.requestLocation()
        }
    }
    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            guard self.reply != nil else { return }
            switch manager.authorizationStatus {
            case .authorizedAlways, .authorized: manager.requestLocation()
            case .denied, .restricted: self.finish(.failure(NSError(domain: "ShuaCrew", code: 1, userInfo: [NSLocalizedDescriptionKey: "Location permission was declined."])))
            default: break
            }
        }
    }
    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let c = locations.last?.coordinate else { return }
        Task { @MainActor in self.finish(.success(c)) }
    }
    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in self.finish(.failure(error)) }
    }
    private func finish(_ result: Result<CLLocationCoordinate2D, Error>) { reply?(result); reply = nil }
}

/// A native banner for things the page decides are worth one (e.g. the focus timer finishing).
enum NativeBanner {
    static func post(title: String, body: String) {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            let send = {
                let content = UNMutableNotificationContent()
                content.title = String(title.prefix(80)); content.body = String(body.prefix(240)); content.sound = .default
                center.add(UNNotificationRequest(identifier: "page-\(UUID().uuidString)", content: content, trigger: nil))
            }
            switch settings.authorizationStatus {
            case .authorized, .provisional: send()
            case .notDetermined: center.requestAuthorization(options: [.alert, .sound]) { ok, _ in if ok { send() } }
            default: NSSound.beep() // notifications are off: at least make a sound
            }
        }
    }
}
