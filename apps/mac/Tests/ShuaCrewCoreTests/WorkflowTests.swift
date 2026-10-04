import Foundation
import Testing
@testable import ShuaCrewCore

@Suite struct WorkflowTests {
    let field = WorkflowTarget(role: "AXTextArea", identifier: "First Text View")
    @Test func parametersContainNoCapturedText() throws {
        let w = SavedWorkflow(name: "Write note", apps: ["com.apple.TextEdit"], steps: [.init(app: "com.apple.TextEdit", operation: "input", target: field, parameter: "input_1")])
        #expect(w.validate()); #expect(w.parameters == ["input_1"])
        let json = String(data: try JSONEncoder().encode(w), encoding: .utf8)!
        #expect(!json.contains("capturedText"))
        #expect(try JSONDecoder().decode(SavedWorkflow.self, from: Data(json.utf8)) == w)
    }
    @Test func targetMustBeUniqueAndSemantic() {
        #expect(field.uniqueIndex(in: [field]) == 0)
        #expect(field.uniqueIndex(in: [field, field]) == nil)
        #expect(field.uniqueIndex(in: [.init(role: "AXTextArea", identifier: "Other")]) == nil)
    }
    @Test func protectedAppsAndPathsNeverRecord() {
        for app in ["com.kiro.ide", "com.apple.Passwords", "com.bitwarden.desktop", "dev.shuacrew.mac"] { #expect(!WorkflowPolicy.appAllowed(app)) }
        #expect(WorkflowPolicy.protectedText("file:///Users/admin/Developer%2Fwork/private"))
        #expect(!WorkflowPolicy.protectedText("/Users/admin/Developer/projects/demo"))
    }
    @Test func onlyVerifiedRunsImproveTheCache() {
        let step = WorkflowStep(app: "com.apple.TextEdit", operation: "input", target: field, parameter: "input_1")
        var w = SavedWorkflow(name: "Test", apps: [step.app], steps: [step])
        w.record(verified: false, milliseconds: 100, stepTimes: [step.id: 1])
        #expect(w.successes == 0); #expect(w.bestMs == nil); #expect(w.verifiedStepMs.isEmpty)
        w.record(verified: true, milliseconds: 900, stepTimes: [step.id: 200])
        w.record(verified: true, milliseconds: 600, stepTimes: [step.id: 100])
        #expect(w.bestMs == 600); #expect(w.successes == 2); #expect(w.verifiedStepMs[step.id] == 150)
        #expect(w.initialWait(for: step) == 30)
        w.verifiedStepMs[step.id] = 5000; #expect(w.initialWait(for: step) == 120)
    }
    @Test func malformedOrDangerousOperationsCannotBecomeExecutable() {
        var w = SavedWorkflow(name: "Test", apps: ["com.apple.TextEdit"], steps: [.init(app: "com.apple.TextEdit", operation: "shortcut", shortcut: "cmd+return")])
        #expect(!w.validate()); w.steps[0].shortcut = "cmd+n"; #expect(w.validate())
        w.steps[0].app = "com.apple.Terminal"; #expect(!w.validate())
        #expect(WorkflowPolicy.requiresDecision("Send message")); #expect(!WorkflowPolicy.requiresDecision("New"))
    }
    @Test func libraryPersistsPrivatelyAndRejectsCorruption() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = WorkflowLibraryStore(file: directory.appendingPathComponent("library.json"))
        #expect(try store.load().isEmpty)
        let w = SavedWorkflow(name: "Test", apps: ["com.apple.TextEdit"], steps: [.init(app: "com.apple.TextEdit", operation: "input", target: field, parameter: "note")])
        try store.save([w]); #expect(try store.load() == [w])
        let attrs = try FileManager.default.attributesOfItem(atPath: store.file.path)
        #expect((attrs[.posixPermissions] as? NSNumber)?.intValue == 0o600)
        try Data("broken".utf8).write(to: store.file)
        #expect(throws: (any Error).self) { try store.load() }
        #expect(try String(contentsOf: store.file, encoding: .utf8) == "broken")
    }

    @Test func recordingUsesPreActionGeometryAndRejectsStaleOrAmbiguousHits() {
        let button = WorkflowTarget(role: "AXButton", identifier: "prepare")
        let before = [(button, CGRect(x: 10, y: 10, width: 80, height: 24))]
        #expect(recordedWorkflowTarget(at: CGPoint(x: 20, y: 20), candidates: before, age: 0.2) == button)
        #expect(recordedWorkflowTarget(at: CGPoint(x: 20, y: 20), candidates: before, age: 1.1) == nil)
        #expect(recordedWorkflowTarget(at: CGPoint(x: 20, y: 20), candidates: before + before, age: 0.2) == nil)
    }

    @Test func teachingHistoryPersistsAndLegacyWorkflowsStillLoad() throws {
        var workflow = SavedWorkflow(name: "Taught note", apps: ["com.apple.TextEdit"], steps: [.init(app: "com.apple.TextEdit", operation: "input", target: field, parameter: "note")])
        let legacy = try JSONEncoder().encode(workflow)
        #expect(try JSONDecoder().decode(SavedWorkflow.self, from: legacy).teachings == nil)
        workflow.teachings = [.init(feedback: "Use a new note", summary: "Create a separate document", lessons: ["Preserve existing documents"], model: "codex-model", at: 1)]
        #expect(workflow.validate())
        #expect(try JSONDecoder().decode(SavedWorkflow.self, from: JSONEncoder().encode(workflow)) == workflow)
        workflow.teachings![0].lessons = Array(repeating: "excess", count: 9)
        #expect(!workflow.validate())
    }

}
