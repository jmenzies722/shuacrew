import Foundation
public enum WorkflowKeyboardIntent: Equatable { case ignore, input, shortcut(String), checkpoint(String) }
/// Separate text editing from navigation/commands. No literal keystrokes are retained.
public func workflowKeyboardIntent(code: UInt16, command: Bool = false, control: Bool = false, option: Bool = false, shift: Bool = false, editable: Bool = false, multiline: Bool = false, writable: Bool = false, producesText: Bool = true) -> WorkflowKeyboardIntent {
    if command && !control && !option {
        if code == 0 && editable && writable && !shift { return .ignore }
        if code == 9 && editable && !shift { return .input }
        let keys: [UInt16: String] = [45: "n", 37: "l", 3: "f", 17: "t"]
        if let key = keys[code], !shift || key == "n" { return .shortcut(shift ? "cmd+shift+" + key : "cmd+" + key) }
    }
    if !command && !control && !option {
        if code == 48 { return .shortcut(shift ? "shift+tab" : "tab") }
        if code == 36 || code == 76 {
            if editable && multiline && writable { return .input }
            return .checkpoint("Return can submit a form or run a command here. Record the app’s visible submit button instead; this key needs a verified result.")
        }
        if editable && producesText && (![51, 117].contains(code) || writable) { return .input }
        if editable && writable && [123, 124, 125, 126, 115, 119, 116, 121].contains(code) { return .ignore } // Cursor movement is absorbed into the final whole-field input.
    }
    if editable && writable && option && !command && !control { return .input } // Accents / Option text editing.
    let keys: [UInt16: String] = [0:"A", 1:"S", 2:"D", 3:"F", 4:"H", 5:"G", 6:"Z", 7:"X", 8:"C", 9:"V", 11:"B", 12:"Q", 13:"W", 14:"E", 15:"R", 16:"Y", 17:"T", 31:"O", 32:"U", 34:"I", 35:"P", 37:"L", 38:"J", 40:"K", 45:"N", 46:"M", 36:"Return", 48:"Tab", 51:"Delete", 76:"Enter", 123:"Left", 124:"Right", 125:"Down", 126:"Up"]
    let key = ([command ? "Command" : "", control ? "Control" : "", option ? "Option" : "", shift ? "Shift" : "", keys[code] ?? "key \(code)"]).filter { !$0.isEmpty }.joined(separator: "+")
    return .checkpoint(editable ? "\(key) needs a verified action. Use the matching menu or button, then record again." : "\(key): click inside the text field first. This app did not expose a readable text input; use a supported field or teach this step separately.")
}
public func workflowKeyboardTextAllowed(_ value: String) -> Bool {
    !value.isEmpty && value.count <= 2000 && value.rangeOfCharacter(from: .controlCharacters) == nil
}
public func workflowKeyboardTextVerified(before: String, after: String, inserted: String) -> Bool {
    workflowKeyboardTextAllowed(inserted) && after == before + inserted
}
