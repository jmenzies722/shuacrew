import Foundation

public struct MobileBuildReadiness: Sendable {
    public let canEnable: Bool
    public let explanation: String
    public init(signed: Bool, adHoc: Bool, container: String?, entitledContainers: [String], services: [String], team: String?) {
        if !signed || adHoc || team?.isEmpty != false {
            canEnable = false; explanation = "This build needs Apple team signing and CloudKit entitlements before mobile sync can be enabled. Your local Mac workspace stays available."
        } else if let container, container.hasPrefix("iCloud."), entitledContainers.contains(container), services.contains("CloudKit") {
            canEnable = true; explanation = "This build is configured for private CloudKit sync. Enabling will check your iCloud account; no room is shared until you select it."
        } else {
            canEnable = false; explanation = "The configured private CloudKit container is missing from this build’s entitlements. No cloud connection has been opened."
        }
    }
}
public struct MobileSyncRetry: Sendable {
    private var attempts = 0
    public init() {}
    public mutating func reset() { attempts = 0 }
    public mutating func failure(serverDelay: TimeInterval? = nil) -> TimeInterval {
        let delay = min(60, pow(2, Double(attempts)))
        attempts = min(attempts + 1, 6)
        guard let serverDelay, serverDelay.isFinite, serverDelay > 0 else { return delay }
        return max(delay, serverDelay)
    }
}
