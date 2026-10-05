import Foundation

public struct WorkflowTarget: Codable, Equatable {
    public var role: String
    public var identifier: String
    public var label: String
    public init(role: String, identifier: String = "", label: String = "") { self.role = role; self.identifier = identifier; self.label = label }
    public func matches(_ other: WorkflowTarget) -> Bool {
        role == other.role && (!identifier.isEmpty ? identifier == other.identifier : label == other.label)
    }
    public func uniqueIndex(in targets: [WorkflowTarget]) -> Int? {
        let found = targets.indices.filter { matches(targets[$0]) }
        return found.count == 1 ? found[0] : nil
    }
}
public struct WorkflowStep: Codable, Equatable {
    public var id: String
    public var app: String
    public var operation: String
    public var target: WorkflowTarget?
    public var parameter: String?
    public var shortcut: String?
    public var expected: WorkflowTarget?
    public var expectedNumber: String?
    public var newWindow: Bool?
    public var checkpoint: String?
    public init(id: String = UUID().uuidString, app: String, operation: String, target: WorkflowTarget? = nil, parameter: String? = nil, shortcut: String? = nil, expected: WorkflowTarget? = nil, expectedNumber: String? = nil, checkpoint: String? = nil) {
        self.id = id; self.app = app; self.operation = operation; self.target = target; self.parameter = parameter; self.shortcut = shortcut; self.expected = expected; self.expectedNumber = expectedNumber; self.newWindow = nil; self.checkpoint = checkpoint
    }
}
public struct WorkflowTeaching: Codable, Equatable {
    public var feedback: String
    public var summary: String
    public var lessons: [String]
    public var model: String
    public var at: Double
    public init(feedback: String, summary: String, lessons: [String], model: String, at: Double) {
        self.feedback = feedback; self.summary = summary; self.lessons = lessons; self.model = model; self.at = at
    }
}
public struct SavedWorkflow: Codable, Equatable {
    public var recordedInputs: [String: String]?
    public var teachings: [WorkflowTeaching]?
    public var id: String
    public var revision: Int
    public var name: String
    public var apps: [String]
    public var steps: [WorkflowStep]
    public var createdAt: Double
    public var demonstrationMs: Double
    public var successes: Int
    public var failures: Int
    public var lastMs: Double?
    public var bestMs: Double?
    public var verifiedStepMs: [String: Double]
    public init(name: String, apps: [String], steps: [WorkflowStep], demonstrationMs: Double = 0) {
        id = UUID().uuidString; revision = 1; self.name = name; self.apps = apps; self.steps = steps
        createdAt = Date().timeIntervalSince1970 * 1000; self.demonstrationMs = demonstrationMs
        successes = 0; failures = 0; verifiedStepMs = [:]
    }
    public var parameters: [String] { Array(Set(steps.compactMap(\.parameter))).sorted() }
    public func validate() -> Bool {
        guard UUID(uuidString: id) != nil, revision > 0, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, name.count <= 100,
              !apps.isEmpty, apps.count <= 8, Set(apps).count == apps.count, apps.allSatisfy(WorkflowPolicy.appAllowed),
              !steps.isEmpty, steps.count <= 100, Set(steps.map(\.id)).count == steps.count,
              createdAt.isFinite, demonstrationMs.isFinite, demonstrationMs >= 0 else { return false }
        if let recordedInputs {
            guard recordedInputs.count <= parameters.count, recordedInputs.allSatisfy({ parameters.contains($0.key) && $0.value.count <= 2000 && !WorkflowPolicy.protectedText($0.value) }) else { return false }
        }
        if let teachings {
            guard teachings.count <= 10, teachings.allSatisfy({ t in
                t.feedback.count <= 2000 && t.summary.count <= 2000 && t.lessons.count <= 8 && t.lessons.allSatisfy { $0.count <= 500 } && t.model.count <= 100 && t.at.isFinite && !WorkflowPolicy.protectedText(t.feedback + t.summary + t.lessons.joined())
            }) else { return false }
        }
        return steps.allSatisfy { step in
            guard UUID(uuidString: step.id) != nil, apps.contains(step.app), ["press", "focus", "input", "shortcut", "checkpoint"].contains(step.operation) else { return false }
            if let target = step.target, target.role.count > 80 || target.identifier.count > 160 || target.label.count > 160 || (WorkflowPolicy.protectedText(target.label) || WorkflowPolicy.protectedText(target.identifier)) { return false }
            if let target = step.expected, target.role.count > 80 || target.identifier.count > 160 || target.label.count > 160 || (WorkflowPolicy.protectedText(target.label) || WorkflowPolicy.protectedText(target.identifier)) { return false }
            if let p = step.parameter, p.range(of: "^[a-z][a-z0-9_]{0,39}$", options: .regularExpression) == nil { return false }
            if step.operation == "input" && (step.parameter == nil || step.target == nil) { return false }
            if ["press", "focus"].contains(step.operation) && step.target == nil { return false }
            if step.operation == "shortcut" && !WorkflowPolicy.shortcuts.contains(step.shortcut ?? "") { return false }
            if let number = step.expectedNumber, number.count > 40 || Double(number) == nil { return false }
            return (step.checkpoint?.count ?? 0) <= 300
        }
    }
    public mutating func record(verified: Bool, milliseconds: Double, stepTimes: [String: Double]) {
        guard milliseconds.isFinite, milliseconds >= 0 else { return }
        if verified {
            successes += 1; lastMs = milliseconds; bestMs = min(bestMs ?? milliseconds, milliseconds)
            for (id, time) in stepTimes where steps.contains(where: { $0.id == id }) && time.isFinite && time >= 0 {
                verifiedStepMs[id] = (verifiedStepMs[id].map { ($0 + time) / 2 }) ?? time
            }
        } else { failures += 1 }
    }
    public func initialWait(for step: WorkflowStep) -> Double { verifiedStepMs[step.id].map { min(120, max(20, $0 * 0.2)) } ?? 120 }
}
public enum WorkflowPolicy {
    public static let shortcuts: Set<String> = ["cmd+n", "cmd+shift+n", "cmd+t", "cmd+l", "cmd+f", "tab", "shift+tab", "escape"]
    public static func appAllowed(_ bundle: String) -> Bool {
        let name = bundle.lowercased()
        return !name.isEmpty && name.count <= 180 && !["kiro", "password", "keychain", "bitwarden", "lastpass", "shuacrew.mac"].contains(where: name.contains)
    }
    public static func protectedText(_ text: String) -> Bool {
        let value = text.removingPercentEncoding?.lowercased() ?? text.lowercased()
        return value.contains("/nectar-work") || value.contains("/developer/work")
    }
    public static func requiresDecision(_ label: String) -> Bool {
        label.lowercased().range(of: "\\b(send|publish|post|delete|remove|trash|buy|pay|purchase|transfer|submit|commit|push|allow|grant|install)\\b", options: .regularExpression) != nil
    }
}

/// Atomic private storage; corrupt libraries are reported, never silently replaced by an empty one.
public struct WorkflowLibraryStore {
    public let file: URL
    public init(file: URL) { self.file = file }
    public func load() throws -> [SavedWorkflow] {
        guard FileManager.default.fileExists(atPath: file.path) else { return [] }
        let data = try Data(contentsOf: file)
        guard data.count <= 2_000_000 else { throw CocoaError(.fileReadTooLarge) }
        let workflows = try JSONDecoder().decode([SavedWorkflow].self, from: data)
        guard workflows.count <= 50, Set(workflows.map(\.id)).count == workflows.count, workflows.allSatisfy({ $0.validate() }) else { throw CocoaError(.fileReadCorruptFile) }
        return workflows
    }
    public func save(_ workflows: [SavedWorkflow]) throws {
        guard workflows.count <= 50, Set(workflows.map(\.id)).count == workflows.count, workflows.allSatisfy({ $0.validate() }) else { throw CocoaError(.fileWriteUnknown) }
        let data = try JSONEncoder().encode(workflows)
        guard data.count <= 2_000_000 else { throw CocoaError(.fileWriteOutOfSpace) }
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        try data.write(to: file, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
    }
}

public func recordedWorkflowTarget(at point: CGPoint, candidates: [(WorkflowTarget, CGRect)], age: Double) -> WorkflowTarget? {
    guard age.isFinite, age >= 0, age <= 1 else { return nil }
    let hits = candidates.filter { $0.1.width > 0 && $0.1.height > 0 && $0.1.contains(point) }
    return hits.count == 1 ? hits[0].0 : nil
}
