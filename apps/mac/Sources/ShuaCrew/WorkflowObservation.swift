import AppKit
import ApplicationServices
import ShuaCrewCore

/// AX snapshot work runs on a serial background queue so recording cannot stall the notch.
enum WorkflowObservation {
    struct Snapshot { let targets: [(WorkflowTarget, CGRect)]; let window: AXUIElement?; let at: TimeInterval }
    static func attribute(_ element: AXUIElement, _ key: String) -> CFTypeRef? {
        AXUIElementSetMessagingTimeout(element, 0.05)
        var value: CFTypeRef?
        return AXUIElementCopyAttributeValue(element, key as CFString, &value) == .success ? value : nil
    }
    static func text(_ element: AXUIElement, _ key: String) -> String { attribute(element, key) as? String ?? "" }
    static func element(_ owner: AXUIElement, _ key: String) -> AXUIElement? {
        guard let value = attribute(owner, key), CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }; return (value as! AXUIElement)
    }
    static func read(pid: pid_t) -> Snapshot? {
        guard AXIsProcessTrusted() else { return nil }
        let root = AXUIElementCreateApplication(pid)
        let window = element(root, kAXFocusedWindowAttribute)
        if let window, WorkflowPolicy.protectedText(text(window, kAXDocumentAttribute) + " " + text(window, kAXTitleAttribute)) { return nil }
        var queue: [(AXUIElement, Int)] = []
        if let window { queue.append((window, 0)) }
        if let menu = element(root, kAXMenuBarAttribute) { queue.append((menu, 0)) }
        var result: [(WorkflowTarget, CGRect)] = [], seen = 0
        let began = Date(), roles: Set<String> = ["AXButton", "AXMenuBarItem", "AXMenuItem", "AXTextField", "AXTextArea", "AXComboBox", "AXCheckBox", "AXRadioButton", "AXPopUpButton", "AXLink", "AXTab"]
        while !queue.isEmpty && seen < 650 && Date().timeIntervalSince(began) < 0.35 {
            let (el, depth) = queue.removeFirst(); seen += 1
            let role = text(el, kAXRoleAttribute), subrole = text(el, kAXSubroleAttribute)
            if role.lowercased().contains("secure") || subrole.lowercased().contains("secure") { continue }
            if roles.contains(role) {
                let title = text(el, kAXTitleAttribute), label = title.isEmpty ? text(el, kAXDescriptionAttribute) : title
                let identifier = text(el, kAXIdentifierAttribute)
                if label.count <= 160, identifier.count <= 160, !WorkflowPolicy.protectedText(label + " " + identifier),
                   let position = attribute(el, kAXPositionAttribute), let dimensions = attribute(el, kAXSizeAttribute),
                   CFGetTypeID(position) == AXValueGetTypeID(), CFGetTypeID(dimensions) == AXValueGetTypeID() {
                    var point = CGPoint.zero, size = CGSize.zero
                    if AXValueGetValue(position as! AXValue, .cgPoint, &point), AXValueGetValue(dimensions as! AXValue, .cgSize, &size), size.width > 0, size.height > 0 {
                        result.append((.init(role: role, identifier: identifier, label: label), CGRect(origin: point, size: size)))
                    }
                }
            }
            if depth < 12, let children = attribute(el, kAXChildrenAttribute) as? [AXUIElement] { queue.append(contentsOf: children.map { ($0, depth + 1) }) }
        }
        guard AXIsProcessTrusted() else { return nil }
        let after = element(root, kAXFocusedWindowAttribute)
        if let window { guard let after, CFEqual(window, after) else { return nil } }
        else if after != nil { return nil }
        if let after, WorkflowPolicy.protectedText(text(after, kAXDocumentAttribute) + " " + text(after, kAXTitleAttribute)) { return nil }
        return Snapshot(targets: result, window: window, at: ProcessInfo.processInfo.systemUptime)
    }
}
