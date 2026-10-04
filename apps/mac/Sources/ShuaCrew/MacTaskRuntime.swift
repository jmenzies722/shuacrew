import AppKit
import ApplicationServices
import ShuaCrewCore

@MainActor
final class MacTaskRuntime {
    var onProgress: (([String: Any]) -> Void)?
    var onTarget: ((CGRect, String) -> Void)?
    var onClear: (() -> Void)?
    private var scope: MacTaskScope?
    private var registry = MacObservationRegistry(generation: 0)
    private var active = false
    private var window: AXUIElement?
    private var windowId = ""
    private var targets: [String: (element: AXUIElement, bounds: CGRect, label: String)] = [:]
    private var lastObservation: [String: Any] = [:]
    private var dispatched: [String: (step: MacStep, pid: Int32, window: String, at: Double)] = [:]
    private var monitors: [Any] = []
    private var ended = Set<String>()
    private var now: Double { Date().timeIntervalSince1970 * 1000 }

    private func decode<Value: Decodable>(_ value: Any?, as: Value.Type) -> Value? {
        guard let value, JSONSerialization.isValidJSONObject(value), let data = try? JSONSerialization.data(withJSONObject: value) else { return nil }
        return try? JSONDecoder().decode(Value.self, from: data)
    }
    private func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
        return value
    }
    private func text(_ element: AXUIElement, _ name: String) -> String { attribute(element, name) as? String ?? "" }
    private func bounds(_ element: AXUIElement) -> CGRect? {
        guard let position = attribute(element, kAXPositionAttribute), CFGetTypeID(position) == AXValueGetTypeID(),
              let dimensions = attribute(element, kAXSizeAttribute), CFGetTypeID(dimensions) == AXValueGetTypeID() else { return nil }
        var point = CGPoint.zero, size = CGSize.zero
        guard AXValueGetValue(position as! AXValue, .cgPoint, &point), AXValueGetValue(dimensions as! AXValue, .cgSize, &size), size.width > 0, size.height > 0 else { return nil }
        return CGRect(origin: point, size: size)
    }
    private func app(_ bundle: String) -> NSRunningApplication? { NSRunningApplication.runningApplications(withBundleIdentifier: bundle).first }
    private func frontWindow(_ app: NSRunningApplication) -> AXUIElement? {
        let root = AXUIElementCreateApplication(app.processIdentifier)
        AXUIElementSetMessagingTimeout(root, 0.5)
        guard let candidate = attribute(root, kAXFocusedWindowAttribute), CFGetTypeID(candidate) == AXUIElementGetTypeID() else { return nil }
        return candidate as! AXUIElement
    }
    private func geometry(_ rect: CGRect) -> String {
        ([rect] + NSScreen.screens.map(\.frame)).map { "\($0.minX),\($0.minY),\($0.width),\($0.height)" }.joined(separator: ";")
    }
    private func sameScope(_ candidate: MacTaskScope) -> Bool { scope == candidate && active && candidate.permits(bundleId: candidate.allowedBundleIds.first ?? "", now: now) }
    private func fail(_ message: String) -> [String: Any] { ["ok": false, "message": message] }

    func cancel(reason: String = "cancelled") {
        guard let scope else { return }
        active = false
        registry.invalidate()
        targets.removeAll()
        for monitor in monitors { NSEvent.removeMonitor(monitor) }
        monitors.removeAll()
        ended.insert(scope.taskId)
        onClear?()
        onProgress?(["taskId": scope.taskId, "generation": scope.generation, "phase": reason, "label": reason == "paused" ? "Paused: you took control" : "Task stopped"])
    }
    private func watchInput() {
        let mask: NSEvent.EventTypeMask = [.mouseMoved, .leftMouseDown, .rightMouseDown, .otherMouseDown, .keyDown, .scrollWheel]
        let handle: (NSEvent) -> Void = { [weak self] event in
            MainActor.assumeIsolated { self?.cancel(reason: event.type == .keyDown && event.keyCode == 53 ? "cancelled" : "paused") }
        }
        if let monitor = NSEvent.addGlobalMonitorForEvents(matching: mask, handler: handle) { monitors.append(monitor) }
        if let monitor = NSEvent.addLocalMonitorForEvents(matching: mask, handler: { event in handle(event); return event }) { monitors.append(monitor) }
    }

    func handle(_ body: [String: Any], reply: @escaping ([String: Any]) -> Void) {
        guard let candidate = decode(body["scope"], as: MacTaskScope.self), let operation = body["operation"] as? String else { reply(fail("Invalid task scope.")); return }
        if operation == "cancel", scope == candidate { cancel(); reply(["ok": true]); return }
        guard candidate.permits(bundleId: candidate.allowedBundleIds.first ?? "", now: now) else { reply(fail("Expired or unsupported task scope.")); return }
        if operation == "begin" {
            guard !active, !ended.contains(candidate.taskId), ended.count < 100 else { reply(fail("Another task is active or this task cannot be replayed.")); return }
            guard AXIsProcessTrusted() else { reply(fail("Accessibility permission is missing. No additional access was requested.")); return }
            scope = candidate; registry = MacObservationRegistry(generation: candidate.generation); active = true
            window = nil; windowId = ""; targets.removeAll(); dispatched.removeAll(); lastObservation = [:]
            watchInput(); reply(["ok": true]); return
        }
        guard sameScope(candidate) else { reply(fail("Task paused, cancelled, or superseded.")); return }
        switch operation {
        case "cancel": cancel(); reply(["ok": true])
        case "observe": reply(observe(candidate))
        case "verify":
            guard let step = decode(body["step"], as: MacStep.self), let prior = dispatched[step.actionId], prior.step == step else { reply(fail("No matching dispatch to verify.")); return }
            let result = observe(candidate)
            guard result["ok"] as? Bool == true, let observation = result["observation"] as? [String: Any], let observedAt = observation["observedAt"] as? Double else { reply(result); return }
            let stable = step.operation == "open" || (observation["pid"] as? Int32 == prior.pid && observation["windowId"] as? String == prior.window)
            let matched = stable && observedAt >= prior.at && app(step.bundleId)?.isActive == true && (step.expected.kind == "app" ? !(observation["windowId"] as? String ?? "").isEmpty : observation["values"] as? [String] == step.expected.values)
            reply(["ok": true, "evidence": ["taskId": candidate.taskId, "generation": candidate.generation, "actionId": step.actionId, "observationId": observation["id"] ?? "", "observedAt": observedAt, "predicateMatched": matched]])
        case "step": dispatch(body, scope: candidate, reply: reply)
        default: reply(fail("Unsupported task operation."))
        }
    }

    private func observe(_ scope: MacTaskScope) -> [String: Any] {
        guard sameScope(scope), AXIsProcessTrusted(), let bundle = scope.allowedBundleIds.first else { return fail("Observation denied.") }
        let id = UUID().uuidString
        guard let running = app(bundle), let current = frontWindow(running), let frame = bounds(current) else {
            let observation: [String: Any] = ["id": id, "taskId": scope.taskId, "generation": scope.generation, "observedAt": now, "bundleId": bundle, "pid": 0, "windowId": "", "displayId": "", "geometryRevision": "", "targets": [], "values": [], "mode": "unavailable"]
            registry.record(id: id, pid: 0, window: "", geometry: "", now: now); lastObservation = observation
            targets.removeAll(); return ["ok": true, "observation": observation]
        }
        guard text(current, kAXDocumentAttribute).isEmpty else { return fail("Document-bearing windows are not allowed in this task.") }
        if window == nil || !CFEqual(window!, current) { window = current; windowId = UUID().uuidString }
        let allowed = Set(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "All Clear", "Clear", "Multiply", "Equals", "Enter", "Increment"])
        var queue = [current], visited = 0, records: [[String: Any]] = [], values: [String] = [], rpn = false
        targets.removeAll()
        while !queue.isEmpty && visited < 500 {
            let element = queue.removeFirst(); visited += 1
            let role = text(element, kAXRoleAttribute)
            let description = text(element, kAXDescriptionAttribute)
            if description.contains("RPN") { rpn = true }
            if role == kAXButtonRole as String {
                let label = [text(element, kAXTitleAttribute), description].first(where: { allowed.contains($0) })
                if let label, let rect = bounds(element), attribute(element, kAXEnabledAttribute) as? Bool != false {
                    let targetId = UUID().uuidString
                    targets[targetId] = (element, rect, label)
                    records.append(["id": targetId, "label": label, "role": role, "x": rect.minX, "y": rect.minY, "width": rect.width, "height": rect.height])
                }
            } else if [kAXStaticTextRole as String, kAXTextFieldRole as String].contains(role) {
                if let value = CalculatorReadback.normalize(text(element, kAXValueAttribute), locale: .current) { values.append(value) }
            }
            queue.append(contentsOf: attribute(element, kAXChildrenAttribute) as? [AXUIElement] ?? [])
        }
        guard queue.isEmpty, values.count <= 12 else { return fail("App layout exceeds the supported observation bounds.") }
        let revision = geometry(frame)
        let observation: [String: Any] = ["id": id, "taskId": scope.taskId, "generation": scope.generation, "observedAt": now, "bundleId": bundle, "pid": running.processIdentifier, "windowId": windowId, "displayId": "scoped-window", "geometryRevision": revision, "targets": records, "values": values, "mode": bundle == "dev.shuacrew.mac-task-fixture" ? "fixture" : rpn || records.contains(where: { $0["label"] as? String == "Enter" }) ? "rpn" : "basic"]
        registry.record(id: id, pid: running.processIdentifier, window: windowId, geometry: revision, now: now)
        lastObservation = observation
        return ["ok": true, "observation": observation]
    }

    private func dispatch(_ body: [String: Any], scope: MacTaskScope, reply: @escaping ([String: Any]) -> Void) {
        guard let step = decode(body["step"], as: MacStep.self), step.verdict(scope: scope, now: now) == "allow", step.observationId == lastObservation["id"] as? String else { reply(fail("Unscoped or stale step rejected.")); return }
        let pid = lastObservation["pid"] as? Int32 ?? 0
        let previousWindow = lastObservation["windowId"] as? String ?? ""
        let receipt: (String, String, String) -> [String: Any] = { dispatch, status, message in ["ok": true, "receipt": ["taskId": scope.taskId, "actionId": step.actionId, "dispatch": dispatch, "status": status, "message": message]] }
        if step.operation == "open" {
            guard step.expected.kind == "app", registry.valid(id: step.observationId, generation: scope.generation, pid: pid, window: previousWindow, geometry: lastObservation["geometryRevision"] as? String ?? "", now: now),
                  let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: step.bundleId), registry.claim(step.actionId, limit: scope.maxSteps) else { reply(fail("App unavailable, stale observation, or duplicate action.")); return }
            dispatched[step.actionId] = (step, pid, previousWindow, now)
            let configuration = NSWorkspace.OpenConfiguration(); configuration.activates = true
            NSWorkspace.shared.openApplication(at: url, configuration: configuration) { [weak self] _, error in
                Task { @MainActor in
                    guard let self, self.sameScope(scope) else { reply(receipt("unknown", "cancelled", "Task stopped during app activation.")); return }
                    reply(receipt(error == nil ? "sent" : "unknown", "unverified", error?.localizedDescription ?? "App activation dispatched; result not yet verified."))
                }
            }
            return
        }
        guard let running = app(step.bundleId), running.isActive, let current = frontWindow(running), let window, CFEqual(current, window), let frame = bounds(current),
              registry.valid(id: step.observationId, generation: scope.generation, pid: running.processIdentifier, window: previousWindow, geometry: geometry(frame), now: now),
              let target = targets[step.targetId], targets.values.filter({ $0.label == target.label }).count == 1,
              bounds(target.element) == target.bounds, attribute(target.element, kAXEnabledAttribute) as? Bool != false else { reply(fail("The target or active window changed. Nothing was pressed.")); return }
        guard sameScope(scope), registry.claim(step.actionId, limit: scope.maxSteps) else { reply(fail("Cancelled or duplicate action.")); return }
        dispatched[step.actionId] = (step, running.processIdentifier, previousWindow, now)
        onTarget?(target.bounds, target.label)
        let result = SparkHands.verifiedPress(target.element, bundleId: step.bundleId)
        reply(receipt(result == .success ? "sent" : "unknown", "unverified", "Activation returned \(result.rawValue); read-back is required."))
    }
}
