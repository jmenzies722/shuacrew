import Foundation

/// Does a control's real name fit what Spark called it? Spark describes things the way people do ("Displays in the
/// sidebar", "the blue Save button"); the control is just "Displays" or "Save". Words like "the", "button", "sidebar"
/// or colours don't count, then one side's words must all appear in the other's.
public enum LabelMatch {
    static let filler: Set<String> = ["the", "a", "an", "button", "icon", "menu", "item", "link", "tab", "field", "click", "tap", "press", "on", "in", "at", "to", "of",
        "top", "bottom", "left", "right", "upper", "lower", "corner", "sidebar", "toolbar", "window", "blue", "red", "green", "grey", "gray", "big", "small", "this", "that", "here", "there", "option", "row"]
    static func tokens(_ s: String) -> Set<String> { Set(s.lowercased().split { !$0.isLetter && !$0.isNumber }.map(String.init).filter { !filler.contains($0) }) }
    public static func fits(_ name: String, _ label: String) -> Bool {
        let n = tokens(name), l = tokens(label)
        guard !n.isEmpty, !l.isEmpty else { return false }
        return n.isSubset(of: l) || l.isSubset(of: n)
    }
}
