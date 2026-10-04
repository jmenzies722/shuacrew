import Foundation

public struct MacTaskScope: Codable, Equatable {
    public let taskId: String
    public let generation: Int
    public let request: String
    public let allowedBundleIds: [String]
    public let allowedResourceRoots: [String]
    public let startedAt: Double
    public let deadline: Double
    public let maxSteps: Int

    public func permits(bundleId: String, now: Double) -> Bool {
        !taskId.isEmpty && generation > 0 && now.isFinite && now >= startedAt && now < deadline && deadline - startedAt <= 120_000 &&
        (1...12).contains(maxSteps) && allowedResourceRoots.isEmpty && allowedBundleIds == [bundleId] &&
        ["com.apple.calculator", "dev.shuacrew.mac-task-fixture"].contains(bundleId)
    }
}

public struct MacPredicate: Codable, Equatable {
    public let kind: String
    public let values: [String]
}

public struct MacStep: Codable, Equatable {
    public let actionId: String
    public let observationId: String
    public let targetId: String
    public let operation: String
    public let bundleId: String
    public let expected: MacPredicate
    public let risk: String

    public func verdict(scope: MacTaskScope, now: Double) -> String {
        guard scope.permits(bundleId: bundleId, now: now), !actionId.isEmpty, !observationId.isEmpty,
              ["open", "press"].contains(operation), ["app", "values"].contains(expected.kind), expected.values.count <= 12,
              expected.values.allSatisfy({ $0.range(of: #"^-?\d+(?:\.\d+)?$"#, options: .regularExpression) != nil }),
              operation != "press" || (!targetId.isEmpty && expected.kind == "values"), risk != "forbidden" else { return "deny" }
        return risk == "routine" ? "allow" : "needs-approval"
    }
}
