import Testing
@testable import ShuaCrewCore
@Suite struct WorkflowKeyboardTests {
    @Test func returnInAnEditableDocumentIsTextNotAnUnsupportedShortcut() {
        #expect(workflowKeyboardIntent(code: 36, editable: true, multiline: true, writable: true) == .input)
        #expect(workflowKeyboardIntent(code: 76, editable: true, multiline: true, writable: true) == .input)
    }
    @Test func accentsAndOrdinaryTypingAreParameterized() {
        #expect(workflowKeyboardIntent(code: 14, option: true, editable: true, writable: true) == .input)
        #expect(workflowKeyboardIntent(code: 0, editable: true, writable: false) == .input)
        #expect(workflowKeyboardIntent(code: 0, command: true, editable: true, writable: true) == .ignore)
    }
    @Test func shortcutsAndSubmitAreNotConfusedWithTyping() {
        #expect(workflowKeyboardIntent(code: 17, command: true) == .shortcut("cmd+t"))
        #expect(workflowKeyboardIntent(code: 48, shift: true) == .shortcut("shift+tab"))
        if case .checkpoint(let message) = workflowKeyboardIntent(code: 36, editable: true, multiline: true, writable: false) {
            #expect(message.contains("Return")); #expect(message.contains("submit"))
        } else { Issue.record("A terminal Return must not become inserted text") }
        if case .checkpoint(let message) = workflowKeyboardIntent(code: 8, control: true) { #expect(message.contains("Control")) }
        else { Issue.record("Unverified control command must be named") }
    }
    @Test func keyboardFallbackRequiresExactReadableEchoAndNoSubmitCharacters() {
        #expect(workflowKeyboardTextVerified(before: "prompt> ", after: "prompt> café", inserted: "café"))
        #expect(!workflowKeyboardTextVerified(before: "prompt> ", after: "other café", inserted: "café"))
        #expect(!workflowKeyboardTextAllowed("command\n"))
        #expect(!workflowKeyboardTextAllowed("command\r"))
        #expect(!workflowKeyboardTextAllowed("\u{1b}"))
        if case .checkpoint = workflowKeyboardIntent(code: 96, editable: true, writable: true, producesText: false) {} else { Issue.record("Function key must not become text") }
    }

}
@Suite struct RecordedWorkflowInputTests {
 @Test func retainsOnlyReviewableNonSecureText() {
  #expect(workflowRecordedText("caf", inserted: "é", writableValue: nil) == "café")
  #expect(workflowRecordedText("old", inserted: "x", writableValue: "replacement") == "replacement")
  #expect(workflowRecordedText("", inserted: "\n", writableValue: nil) == nil)
  #expect(workflowRecordedText("", inserted: "/Users/admin/Nectar-Work/file", writableValue: nil) == nil)
 }
 @Test func recordedDefaultsMustBelongToInputSlots() {
  var w = SavedWorkflow(name:"Type",apps:["com.apple.TextEdit"],steps:[WorkflowStep(app:"com.apple.TextEdit",operation:"input",target:WorkflowTarget(role:"AXTextArea",identifier:"body"),parameter:"input_1")])
  w.recordedInputs=["input_1":"Hello"]
  #expect(w.validate())
  w.recordedInputs=["unknown":"Hello"]
  #expect(!w.validate())
 }
}
