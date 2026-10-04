import AppKit
import ApplicationServices
import Carbon.HIToolbox
import ShuaCrewCore

/// Explicitly scoped demonstrations. No video, raw key text, or field values are persisted.
@MainActor
final class WorkflowRuntime {
    var onChange: (([String: Any]) -> Void)?
    private(set) var phase = "idle"
    var busy: Bool { ["recording", "running", "needs-approval"].contains(phase) }
    private var library: [SavedWorkflow] = []
    private var draft: SavedWorkflow?
    private var monitors: [Any] = []
    private var deadline: Timer?
    private var recordScan: Timer?
    private let scanQueue = DispatchQueue(label: "dev.shuacrew.workflow-observation", qos: .userInitiated)
    private var scanID: UUID?
    private struct RecordingSnapshot { let pid: pid_t; let at: TimeInterval; let targets: [(WorkflowTarget, CGRect)]; let window: AXUIElement? }
    private var recordingHistory: [RecordingSnapshot] = []
    private var generation = UUID()
    private var started = Date()
    private var message = ""
    private var followForeground = false
    private var observedApp = ""
    private var stepIndex = 0
    private var current: SavedWorkflow?
    private var inputs: [String: String] = [:]
    private var times: [String: Double] = [:]
    private var dispatched = Set<String>()
    private var appNames: [String: String] = [:]
    private let eventTag: Int64 = 0x534855415746
    private let file: URL
    private var loadError: String?
    init(directory: URL = URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent(".shuacrew/workflows")) {
        file = directory.appendingPathComponent("library.json")
        do { library = try WorkflowLibraryStore(file: file).load() }
        catch { loadError = "Saved workflow data could not be read. It has been preserved; restore or repair the library before saving."; message = loadError! }
    }
    private func encode<T: Encodable>(_ value: T) -> Any { (try? JSONSerialization.jsonObject(with: JSONEncoder().encode(value))) ?? NSNull() }
    private func persist() throws {
        if let loadError { throw failure(loadError) }
        try WorkflowLibraryStore(file: file).save(library)
    }
    private func state() -> [String: Any] {
        let available = NSWorkspace.shared.runningApplications.compactMap { app -> [String: String]? in
            guard app.activationPolicy == .regular, let id = app.bundleIdentifier, WorkflowPolicy.appAllowed(id) else { return nil }
            return ["id": id, "name": app.localizedName ?? id]
        }.sorted { ($0["name"] ?? "") < ($1["name"] ?? "") }
        return ["observedApp": observedApp, "followingForeground": followForeground, "availableApps": available,"phase": phase, "message": message, "stepIndex": stepIndex, "stepCount": current?.steps.count ?? draft?.steps.count ?? 0,
         "library": encode(library), "draft": draft.map(encode) ?? NSNull(), "workflowId": current?.id ?? "", "appNames": appNames]
    }
    private func publish(_ text: String? = nil) { if let text { message = text }; onChange?(state()) }
    private func clearMonitors() { recordScan?.invalidate(); recordScan = nil; scanID = nil; recordingHistory = []; monitors.forEach(NSEvent.removeMonitor); monitors.removeAll(); deadline?.invalidate(); deadline = nil }
    func stop(_ reason: String = "Stopped") {
        let wasRunning = ["running", "needs-approval"].contains(phase)
        generation = UUID(); clearMonitors(); inputs.removeAll()
        if phase == "recording" { draft?.demonstrationMs = Date().timeIntervalSince(started) * 1000; phase = "review" }
        else { phase = "stopped" }
        let statsError = wasRunning ? finishStats(false) : nil
        publish(statsError.map { reason + " " + $0 } ?? reason)
    }
    private func finishStats(_ verified: Bool) -> String? {
        guard let current, let index = library.firstIndex(where: { $0.id == current.id && $0.revision == current.revision }) else { return nil }
        library[index].record(verified: verified, milliseconds: Date().timeIntervalSince(started) * 1000, stepTimes: times)
        self.current = nil
        do { try persist(); return nil } catch { return "Run ended, but its statistics could not be saved." }
    }
    func handle(_ body: [String: Any]) -> [String: Any] {
        do {
            switch body["operation"] as? String {
            case "list": break
            case "stop": stop()
            case "record":
                guard !busy, AXIsProcessTrusted() else { throw failure("Stop current work and grant Accessibility before recording.") }
                let names = (body["apps"] as? [String] ?? []).map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
                let follow = body["followForeground"] as? Bool == true
                guard (follow || !names.isEmpty), names.count <= 8 else { throw failure("Choose one to eight apps to record.") }
                var bundles: [String] = []
                for name in names {
                    guard let url = NSWorkspace.shared.runningApplications.first(where: { $0.bundleIdentifier == name || $0.localizedName == name })?.bundleURL ?? NSWorkspace.shared.urlForApplication(withBundleIdentifier: name) ?? NSWorkspace.shared.fullPath(forApplication: name).map({ URL(fileURLWithPath: $0) }),
                          let bundle = Bundle(url: url)?.bundleIdentifier, WorkflowPolicy.appAllowed(bundle), !bundles.contains(bundle) else { throw failure("App unavailable, duplicated, or protected: \(name)") }
                    bundles.append(bundle); appNames[bundle] = url.deletingPathExtension().lastPathComponent
                }
                let taskName = (body["name"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                guard taskName.count <= 100, !WorkflowPolicy.protectedText(taskName) else { throw failure("Choose a task name under 100 characters without protected paths.") }
                followForeground = follow; observedApp = ""
                if let replacing = body["workflowId"] as? String {
                    guard var existing = library.first(where: { $0.id == replacing }), Set(existing.apps) == Set(bundles) else { throw failure("Choose the same recorded apps when teaching a correction.") }
                    existing.steps = []; existing.successes = 0; existing.failures = 0; existing.verifiedStepMs = [:]; existing.lastMs = nil; existing.bestMs = nil
                    draft = existing
                } else { draft = SavedWorkflow(name: taskName.isEmpty ? "New workflow" : taskName, apps: bundles, steps: []) }
                current = nil
                generation = UUID(); started = Date(); phase = "recording"; message = follow ? "Watching your demonstration. Switch to the app you want to teach." : "Recording selected apps. Typed text becomes an input slot."; stepIndex = 0
                try installRecording(); deadline = Timer.scheduledTimer(withTimeInterval: 900, repeats: false) { [weak self] _ in Task { @MainActor in self?.stop("Recording limit reached. Review your steps.") } }
            case "save":
                guard !busy, let data = body["workflow"], JSONSerialization.isValidJSONObject(data),
                      let workflow = try? JSONDecoder().decode(SavedWorkflow.self, from: JSONSerialization.data(withJSONObject: data)), workflow.validate() else { throw failure("Invalid workflow. Stop recording and review its steps first.") }
                var clean = SavedWorkflow(name: workflow.name, apps: workflow.apps, steps: workflow.steps, demonstrationMs: workflow.demonstrationMs)
                clean.teachings = workflow.teachings
                if let index = library.firstIndex(where: { $0.id == workflow.id }) {
                    clean.id = workflow.id; clean.revision = library[index].revision + 1; clean.createdAt = library[index].createdAt
                    let previous = library; library[index] = clean
                    do { try persist() } catch { library = previous; throw error }
                } else {
                    guard library.count < 50 else { throw failure("Workflow library is full (50).") }
                    let previous = library; library.append(clean)
                    do { try persist() } catch { library = previous; throw error }
                }
                draft = nil; phase = "idle"; message = "Workflow saved locally."
            case "delete":
                guard !busy, let id = body["workflowId"] as? String else { throw failure("Stop current work first.") }
                let previous = library; library.removeAll { $0.id == id }
                do { try persist() } catch { library = previous; throw error }
                message = "Workflow removed from the library."
            case "run":
                guard !busy, AXIsProcessTrusted(), let id = body["workflowId"] as? String,
                      let workflow = library.first(where: { $0.id == id }), workflow.validate() else { throw failure("Workflow or Accessibility access is unavailable.") }
                let values = body["inputs"] as? [String: String] ?? [:]
                guard workflow.parameters.allSatisfy({ !(values[$0] ?? "").isEmpty && (values[$0]?.count ?? 0) <= 2000 && !WorkflowPolicy.protectedText(values[$0] ?? "") }) else { throw failure("Fill every workflow input (up to 2,000 characters each). Protected paths are excluded.") }
                current = workflow; inputs = values; times = [:]; dispatched = []; stepIndex = 0; generation = UUID(); started = Date(); phase = "running"
                try installTakeover(); let token = generation
                Task { @MainActor [weak self] in await self?.next(token) }
            case "approve":
                guard phase == "needs-approval", let current, body["workflowId"] as? String == current.id, body["stepId"] as? String == current.steps[stepIndex].id else { throw failure("That step is no longer waiting.") }
                phase = "running"; let token = generation
                Task { @MainActor [weak self] in await self?.next(token, approved: true) }
            default: throw failure("Unknown workflow command.")
            }
            publish(); return ["ok": true, "state": state()]
        } catch { return ["ok": false, "message": error.localizedDescription, "state": state()] }
    }
    private func failure(_ text: String) -> NSError { NSError(domain: "ShuaWorkflow", code: 1, userInfo: [NSLocalizedDescriptionKey: text]) }
    private func attr(_ element: AXUIElement, _ key: String) -> CFTypeRef? {
        var value: CFTypeRef?; return AXUIElementCopyAttributeValue(element, key as CFString, &value) == .success ? value : nil
    }
    private func text(_ element: AXUIElement, _ key: String) -> String { attr(element, key) as? String ?? "" }
    private func element(_ owner: AXUIElement, _ key: String) -> AXUIElement? {
        guard let value = attr(owner, key), CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }; return (value as! AXUIElement)
    }
    private func root(_ app: NSRunningApplication) -> AXUIElement { let result = AXUIElementCreateApplication(app.processIdentifier); AXUIElementSetMessagingTimeout(result, 0.2); return result }
    private func permitted(_ app: NSRunningApplication) -> Bool {
        guard let bundle = app.bundleIdentifier, WorkflowPolicy.appAllowed(bundle) else { return false }
        if let window = element(root(app), kAXFocusedWindowAttribute) {
            let resource = text(window, kAXDocumentAttribute) + " " + text(window, kAXTitleAttribute)
            if WorkflowPolicy.protectedText(resource) { return false }
        }
        return true
    }
    private func secure(_ el: AXUIElement) -> Bool { text(el, kAXSubroleAttribute).lowercased().contains("secure") || text(el, kAXRoleAttribute).lowercased().contains("secure") }
    private func descriptor(_ el: AXUIElement) -> WorkflowTarget? {
        guard !secure(el) else { return nil }
        let role = text(el, kAXRoleAttribute)
        guard ["AXButton", "AXMenuBarItem", "AXMenuItem", "AXTextField", "AXTextArea", "AXComboBox", "AXCheckBox", "AXRadioButton", "AXPopUpButton", "AXLink", "AXTab"].contains(role) else { return nil }
        let label = [text(el, kAXTitleAttribute), text(el, kAXDescriptionAttribute)].first(where: { !$0.isEmpty }) ?? ""
        guard label.count <= 160, !WorkflowPolicy.protectedText(label) else { return nil }
        return WorkflowTarget(role: role, identifier: String(text(el, kAXIdentifierAttribute).prefix(160)), label: label)
    }
    private func focused(_ app: NSRunningApplication) -> AXUIElement? { element(root(app), kAXFocusedUIElementAttribute) }
    private func targets(_ app: NSRunningApplication) -> [(WorkflowTarget, AXUIElement)] {
        let r = root(app); var queue: [(AXUIElement, Int)] = []
        if let window = element(r, kAXFocusedWindowAttribute) { queue.append((window, 0)) }
        if let menu = element(r, kAXMenuBarAttribute) { queue.append((menu, 0)) }
        var result: [(WorkflowTarget, AXUIElement)] = [], seen = 0
        let began = Date()
        while !queue.isEmpty && seen < 650 && Date().timeIntervalSince(began) < 0.35 {
            let (el, depth) = queue.removeFirst(); seen += 1
            if let d = descriptor(el) { result.append((d, el)) }
            if depth < 12, !secure(el), let children = attr(el, kAXChildrenAttribute) as? [AXUIElement] { queue.append(contentsOf: children.map { ($0, depth + 1) }) }
        }
        return result
    }
    private func find(_ target: WorkflowTarget, in app: NSRunningApplication) -> AXUIElement? {
        let list = targets(app); guard let index = target.uniqueIndex(in: list.map(\.0)) else { return nil }; return list[index].1
    }
    private func numericValue(_ app: NSRunningApplication) -> String? {
        guard app.bundleIdentifier == "com.apple.calculator" else { return nil }
        let r = root(app); guard let window = element(r, kAXFocusedWindowAttribute) else { return nil }
        var queue = [window], seen = 0
        while !queue.isEmpty && seen < 200 {
            let el = queue.removeFirst(); seen += 1
            if text(el, kAXRoleAttribute) == "AXStaticText", let value = attr(el, kAXValueAttribute) as? String, value.count <= 40, Double(value) != nil { return value }
            if let children = attr(el, kAXChildrenAttribute) as? [AXUIElement] { queue.append(contentsOf: children) }
        }
        return nil
    }
    /// Foreground-only observation is armed by an explicit Watch me request.
    /// Protected apps/windows and secure fields are excluded before target scanning.
    private func recordingAppAllowed(_ app: NSRunningApplication) -> Bool {
        guard let bundle = app.bundleIdentifier, app.activationPolicy == .regular, permitted(app) else {
            if !observedApp.isEmpty { observedApp = ""; publish("Protected or unavailable context skipped.") }
            return false
        }
        if let field = focused(app), secure(field) {
            if !observedApp.isEmpty { observedApp = ""; publish("Secure field skipped.") }
            return false
        }
        if draft?.apps.contains(bundle) != true {
            guard followForeground else { return false }
            guard (draft?.apps.count ?? 0) < 8 else { stop("Eight-app demonstration limit reached. Review what Shua captured."); return false }
            draft?.apps.append(bundle)
        }
        let name = app.localizedName ?? bundle
        appNames[bundle] = name
        if observedApp != name { observedApp = name; publish("Watching " + name + ". Demonstrate your task, then stop.") }
        return true
    }
    private func refreshRecordingTargets() {
        guard phase == "recording" else { return }
        guard AXIsProcessTrusted() else { stop("Accessibility access was revoked."); return }
        guard scanID == nil, let app = NSWorkspace.shared.frontmostApplication, recordingAppAllowed(app) else { return }
        let id = UUID(), token = generation, pid = app.processIdentifier; scanID = id
        scanQueue.async { [weak self] in
            let snapshot = WorkflowObservation.read(pid: pid)
            DispatchQueue.main.async {
                guard let self, self.scanID == id else { return }; self.scanID = nil
                guard self.generation == token, self.phase == "recording", let snapshot else { return }
                self.recordingHistory.append(.init(pid: pid, at: snapshot.at, targets: snapshot.targets, window: snapshot.window))
                self.recordingHistory = Array(self.recordingHistory.suffix(6))
            }
        }
    }
    private func installRecording() throws {
        clearMonitors(); refreshRecordingTargets()
        recordScan = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { [weak self] _ in MainActor.assumeIsolated { self?.refreshRecordingTargets() } }
        if let monitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .keyDown, .scrollWheel], handler: { [weak self] event in MainActor.assumeIsolated { self?.record(event) } }) { monitors.append(monitor) }
        else { stop("Recording could not access macOS input events."); throw failure(message) }
        if let monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown, handler: { [weak self] event in if event.keyCode == 53 { self?.stop() }; return event }) { monitors.append(monitor) }
    }
    private func record(_ event: NSEvent) {
        guard phase == "recording" else { return }
        guard AXIsProcessTrusted() else { stop("Accessibility access was revoked."); return }
        if event.type == .keyDown && event.keyCode == 53 { stop(); return }
        guard let app = NSWorkspace.shared.frontmostApplication, let bundle = app.bundleIdentifier, recordingAppAllowed(app) else { return }
        guard draft!.steps.count < 100 else { stop("100-step recording limit reached."); return }
        if let field = focused(app), secure(field) { publish("Secure field skipped."); return }
        let beforeSnapshot = recordingHistory.last { $0.pid == app.processIdentifier && $0.at <= event.timestamp && event.timestamp - $0.at <= 1 }
        var step: WorkflowStep
        if event.type == .scrollWheel {
            if draft?.steps.last?.checkpoint == "Scroll manually, then adapt this checkpoint." { return }
            step = .init(app: bundle, operation: "checkpoint", checkpoint: "Scroll manually, then adapt this checkpoint.")
        } else if event.type == .keyDown {
            let field = focused(app), target = field.flatMap(descriptor)
            let editable = target.map { ["AXTextField", "AXTextArea", "AXComboBox"].contains($0.role) } ?? false
            var writable = DarwinBoolean(false)
            if let field { _ = AXUIElementIsAttributeSettable(field, kAXValueAttribute as CFString, &writable) }
            let intent = workflowKeyboardIntent(code: event.keyCode, command: event.modifierFlags.contains(.command), control: event.modifierFlags.contains(.control), option: event.modifierFlags.contains(.option), shift: event.modifierFlags.contains(.shift), editable: editable, multiline: target?.role == "AXTextArea", writable: writable.boolValue, producesText: event.characters?.unicodeScalars.contains(where: { !CharacterSet.controlCharacters.contains($0) }) == true || [51, 117].contains(event.keyCode))
            switch intent {
            case .ignore: return
            case .shortcut(let shortcut): step = .init(app: bundle, operation: "shortcut", shortcut: shortcut)
            case .input:
                guard let target else { return }
                if let last = draft?.steps.last, last.operation == "input", last.app == bundle, last.target == target { return }
                step = .init(app: bundle, operation: "input", target: target, parameter: "input_\((draft?.steps.filter { $0.operation == "input" }.count ?? 0) + 1)")
            case .checkpoint(let explanation):
                if let last = draft?.steps.last, last.operation == "checkpoint", last.app == bundle, last.checkpoint == explanation { return }
                step = .init(app: bundle, operation: "checkpoint", checkpoint: explanation)
            }
        } else {
            let point = event.cgEvent?.location ?? .zero
            guard let beforeSnapshot,
                  let target = recordedWorkflowTarget(at: point, candidates: beforeSnapshot.targets, age: event.timestamp - beforeSnapshot.at) else {
                draft?.steps.append(.init(app: bundle, operation: "checkpoint", checkpoint: "Target changed or was ambiguous before the click. Re-record this step.")); publish(); return
            }
            step = .init(app: bundle, operation: ["AXTextField", "AXTextArea", "AXComboBox"].contains(target.role) ? "focus" : "press", target: target)
        }
        let before = beforeSnapshot?.targets.map(\.0) ?? [], token = generation, id = step.id
        let beforeWindow = beforeSnapshot?.window
        draft?.steps.append(step); publish(step.checkpoint ?? "Recording · \(draft?.steps.count ?? 0) steps")
        if step.operation == "input" || step.operation == "checkpoint" { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in
            guard let self, token == self.generation, self.phase == "recording", self.permitted(app),
                  let index = self.draft?.steps.firstIndex(where: { $0.id == id }) else { return }
            if let beforeWindow, let afterWindow = self.element(self.root(app), kAXFocusedWindowAttribute), !CFEqual(beforeWindow, afterWindow) { self.draft?.steps[index].newWindow = true }
            if let number = self.numericValue(app) { self.draft?.steps[index].expectedNumber = number }
            else if let focus = self.focused(app), let target = self.descriptor(focus), target.role.contains("Text") || target.role == "AXComboBox" { self.draft?.steps[index].expected = target }
            else { self.draft?.steps[index].expected = self.targets(app).map(\.0).first { !before.contains($0) } }
            self.publish()
        }
    }
    private func installTakeover() throws {
        clearMonitors()
        if let monitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown, .keyDown, .scrollWheel], handler: { [weak self] event in
            MainActor.assumeIsolated { guard let self, event.cgEvent?.getIntegerValueField(.eventSourceUserData) != self.eventTag else { return }; self.stop("Paused because you took control. No action will be repeated.") }
        }) { monitors.append(monitor) }
        else { stop("Replay could not install its takeover monitor."); throw failure(message) }
        if let monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown, handler: { [weak self] event in if event.keyCode == 53 { self?.stop() }; return event }) { monitors.append(monitor) }
        deadline = Timer.scheduledTimer(withTimeInterval: 600, repeats: false) { [weak self] _ in Task { @MainActor in self?.stop("Workflow time limit reached.") } }
    }
    private func key(_ shortcut: String) {
        let codes: [String: CGKeyCode] = ["cmd+n": 45, "cmd+shift+n": 45, "cmd+t": 17, "cmd+l": 37, "cmd+f": 3, "tab": 48, "shift+tab": 48, "escape": 53]
        guard let code = codes[shortcut] else { return }
        for down in [true, false] { let event = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: down); var flags: CGEventFlags = []; if down && shortcut.contains("cmd+") { flags.insert(.maskCommand) }; if down && shortcut.contains("shift+") { flags.insert(.maskShift) }; event?.flags = flags; event?.setIntegerValueField(.eventSourceUserData, value: eventTag); event?.post(tap: .cghidEventTap) }
    }
    private func next(_ token: UUID, approved: Bool = false) async {
        guard token == generation, phase == "running", let workflow = current else { return }
        guard stepIndex < workflow.steps.count else {
            clearMonitors(); phase = "completed"; inputs.removeAll(); let statsError = finishStats(true); publish(statsError.map { "Verified every workflow step. " + $0 } ?? "Verified every workflow step."); return
        }
        let step = workflow.steps[stepIndex]
        if step.operation == "checkpoint" { stop(step.checkpoint ?? "Manual checkpoint: ask Shua to adapt this step."); return }
        if WorkflowPolicy.requiresDecision(step.target?.label ?? ""), !approved { phase = "needs-approval"; publish("Confirm this step: \(step.target?.label ?? step.operation)"); return }
        guard !dispatched.contains(step.id), AXIsProcessTrusted(), WorkflowPolicy.appAllowed(step.app) else { stop("This step cannot be dispatched again."); return }
        publish("Step \(stepIndex + 1) of \(workflow.steps.count) · \(step.target?.label.isEmpty == false ? step.target!.label : step.shortcut ?? step.operation)")
        guard let url = NSRunningApplication.runningApplications(withBundleIdentifier: step.app).first?.bundleURL ?? NSWorkspace.shared.urlForApplication(withBundleIdentifier: step.app) else { stop("Workflow app is no longer installed."); return }
        do {
            let config = NSWorkspace.OpenConfiguration(); config.activates = true
            let app = try await NSWorkspace.shared.openApplication(at: url, configuration: config)
            guard token == generation, phase == "running" else { return }
            for _ in 0..<10 { if app.isActive { break }; try await Task.sleep(for: .milliseconds(50)); guard token == generation else { return } }
            guard app.isActive, permitted(app), AXIsProcessTrusted() else { stop("App focus, permission, or protected-window check failed."); return }
            let began = Date(), beforeWindow = element(root(app), kAXFocusedWindowAttribute)
            var control: AXUIElement?
            if let target = step.target { control = find(target, in: app); guard control != nil else { stop("Target missing or ambiguous. Ask Shua to adapt this workflow."); return } }
            if let control, secure(control) { stop("Secure fields cannot be replayed."); return }
            if step.operation != "input" && step.expected == nil && step.expectedNumber == nil { stop("This step has no recorded verification checkpoint. Adapt it before replay."); return }
            // Reserve before mutation. No retry may repeat a write, even if its outcome is unknown.
            dispatched.insert(step.id)
            var result: AXError = .success
            var keyboardBefore: String?
            switch step.operation {
            case "press": result = AXUIElementPerformAction(control!, kAXPressAction as CFString)
            case "focus": result = AXUIElementSetAttributeValue(control!, kAXFocusedAttribute as CFString, kCFBooleanTrue)
            case "input":
                guard let value = inputs[step.parameter ?? ""], let control else { stop("Missing workflow input."); return }
                var settable = DarwinBoolean(false)
                let writable = AXUIElementIsAttributeSettable(control, kAXValueAttribute as CFString, &settable) == .success && settable.boolValue
                if writable {
                    result = AXUIElementSetAttributeValue(control, kAXValueAttribute as CFString, value as CFString)
                } else {
                    guard workflowKeyboardTextAllowed(value), let before = attr(control, kAXValueAttribute) as? String, before.count <= 100000,
                          let focus = focused(app), CFEqual(focus, control) else { stop("Click the recorded text input before replay. Keyboard typing needs readable focus and a single-line input without command keys."); return }
                    keyboardBefore = before
                    for scalar in value.unicodeScalars {
                        guard token == generation, phase == "running", app.isActive, permitted(app), AXIsProcessTrusted(), let focus = focused(app), CFEqual(focus, control),
                              beforeWindow.map({ prior in element(root(app), kAXFocusedWindowAttribute).map { CFEqual(prior, $0) } ?? false }) == true else { stop("Typing stopped because focus changed. Partial text may remain; it will not be repeated."); return }
                        let units = Array(String(scalar).utf16)
                        for down in [true, false] {
                            guard let event = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: down) else { stop("Keyboard event unavailable; partial text may remain."); return }
                            event.flags = []; event.setIntegerValueField(.eventSourceUserData, value: eventTag)
                            units.withUnsafeBufferPointer { event.keyboardSetUnicodeString(stringLength: $0.count, unicodeString: $0.baseAddress!) }
                            event.post(tap: .cghidEventTap)
                        }
                        try await Task.sleep(for: .milliseconds(2))
                    }
                }
            case "shortcut": key(step.shortcut ?? "")
            default: stop("Unsupported workflow action."); return
            }
            guard result == .success else { stop("The app rejected the action. Its outcome is unconfirmed; it will not be repeated."); return }
            try await Task.sleep(for: .milliseconds(workflow.initialWait(for: step)))
            var verified = false
            for _ in 0..<12 {
                guard token == generation, phase == "running" else { return }
                guard app.isActive, permitted(app), AXIsProcessTrusted() else { stop("Target or permissions changed during verification."); return }
                if step.operation == "input", let control {
                    let sameWindow = beforeWindow.map { prior in element(root(app), kAXFocusedWindowAttribute).map { CFEqual(prior, $0) } ?? false } ?? false
                    let value = inputs[step.parameter ?? ""] ?? "", after = text(control, kAXValueAttribute)
                    verified = sameWindow && (keyboardBefore.map { workflowKeyboardTextVerified(before: $0, after: after, inserted: value) } ?? (after == value))
                } else if let number = step.expectedNumber { verified = numericValue(app) == number }
                else if let expected = step.expected {
                    if step.operation == "focus" { verified = focused(app).flatMap(descriptor).map(expected.matches) ?? false }
                    else { verified = find(expected, in: app) != nil }
                }
                if step.newWindow == true { verified = verified && (beforeWindow.map { prior in element(root(app), kAXFocusedWindowAttribute).map { !CFEqual(prior, $0) } ?? false } ?? false) }
                if verified { break }; try await Task.sleep(for: .milliseconds(150))
            }
            guard verified else { stop("Result did not match the recorded checkpoint. No action was repeated; ask Shua to adapt."); return }
            times[step.id] = Date().timeIntervalSince(began) * 1000; stepIndex += 1
            await next(token)
        } catch { if token == generation { stop("Workflow stopped: \(error.localizedDescription)") } }
    }
    /// Opt-in native regression probe. Operates only the disposable dev.shua.workflowfixture app.
    func runFixtureProbe(output: URL) async {
        var report: [String: Any] = [:]
        do {
            let bundle = "dev.shua.workflowfixture"
            guard let url = NSRunningApplication.runningApplications(withBundleIdentifier: bundle).first?.bundleURL else { throw failure("Start the disposable workflow fixture first.") }
            let config = NSWorkspace.OpenConfiguration(); config.activates = true
            let app = try await NSWorkspace.shared.openApplication(at: url, configuration: config)
            try await Task.sleep(for: .milliseconds(800))
            guard app.isActive else { throw failure("Fixture did not gain focus.") }
            let startedRecording = handle(["operation": "record", "apps": [bundle]])
            guard startedRecording["ok"] as? Bool == true else { throw failure(startedRecording["message"] as? String ?? "Record failed") }
            try await Task.sleep(for: .milliseconds(500))
            func clickFixture(_ identifier: String) throws {
                guard app.isActive, permitted(app), let control = find(.init(role: "AXButton", identifier: identifier), in: app),
                      let position = attr(control, kAXPositionAttribute), let sizeValue = attr(control, kAXSizeAttribute),
                      CFGetTypeID(position) == AXValueGetTypeID(), CFGetTypeID(sizeValue) == AXValueGetTypeID() else { throw failure("Fixture control unavailable: " + identifier) }
                var point = CGPoint.zero, size = CGSize.zero
                AXValueGetValue(position as! AXValue, .cgPoint, &point); AXValueGetValue(sizeValue as! AXValue, .cgSize, &size)
                point.x += size.width / 2; point.y += size.height / 2
                for kind in [CGEventType.leftMouseDown, .leftMouseUp] { CGEvent(mouseEventSource: nil, mouseType: kind, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap) }
            }
            try clickFixture("workflow.prepare")
            try await Task.sleep(for: .milliseconds(700))
            guard app.isActive, focused(app).flatMap(descriptor)?.identifier == "workflow.input" else { throw failure("Fixture input did not gain focus.") }
            for unit in Array("private demo value".utf16) {
                var value = unit
                for down in [true, false] { let event = CGEvent(keyboardEventSource: nil, virtualKey: unit == 10 ? 36 : 0, keyDown: down); event?.flags = []; if unit != 10 { event?.keyboardSetUnicodeString(stringLength: 1, unicodeString: &value) }; event?.post(tap: .cghidEventTap) }
                try await Task.sleep(for: .milliseconds(15))
            }
            try await Task.sleep(for: .milliseconds(350)); try clickFixture("workflow.finish")
            try await Task.sleep(for: .milliseconds(600)); stop("Probe demonstration recorded")
            guard var captured = draft else { throw failure("No draft") }
            report["recordedSteps"] = captured.steps.map { $0.operation }; report["captured"] = encode(captured)
            guard captured.steps.count == 3, captured.steps.map(\.operation) == ["press", "input", "press"] else { throw failure("Expected three real-event steps.") }
            captured.name = "Fixture verification"
            let saved = handle(["operation": "save", "workflow": encode(captured)])
            guard saved["ok"] as? Bool == true, let workflow = library.last else { throw failure("Save failed") }
            let persisted = try String(contentsOf: file, encoding: .utf8)
            report["typedValueNotPersisted"] = !persisted.contains("private demo value")
            var durations: [Double] = []
            for value in ["first verified replay", "second verified replay"] {
                let result = handle(["operation": "run", "workflowId": workflow.id, "inputs": ["input_1": value]])
                guard result["ok"] as? Bool == true else { throw failure(result["message"] as? String ?? "Replay start failed") }
                for _ in 0..<100 { if !busy { break }; try await Task.sleep(for: .milliseconds(100)) }
                guard phase == "completed", let field = find(.init(role: "AXTextField", identifier: "workflow.input"), in: app), text(field, kAXValueAttribute) == value else { throw failure("Replay failed: " + message) }
                durations.append(library.last?.lastMs ?? -1)
            }
            report["replayMilliseconds"] = durations
            report["persistedSuccesses"] = try WorkflowLibraryStore(file: file).load().last?.successes
            // Simulate an app update removing the target. It must stop without another field write.
            var changed = library.last!; changed.steps[0].target?.identifier = "missing-after-app-update"
            _ = handle(["operation": "save", "workflow": encode(changed)])
            _ = handle(["operation": "run", "workflowId": changed.id, "inputs": ["input_1": "must not be typed"]])
            for _ in 0..<100 { if !busy { break }; try await Task.sleep(for: .milliseconds(100)) }
            report["changedTargetStopped"] = phase == "stopped" && library.last?.successes == 0 && library.last?.failures == 1 && find(.init(role: "AXTextField", identifier: "workflow.input"), in: app).map { text($0, kAXValueAttribute) == "second verified replay" } == true
            report["changedTargetReason"] = message
            report["ok"] = report["typedValueNotPersisted"] as? Bool == true && report["changedTargetStopped"] as? Bool == true
        } catch { stop("Probe ended"); report["ok"] = false; report["error"] = error.localizedDescription; report["state"] = state() }
        if let data = try? JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]) { try? data.write(to: output, options: .atomic) }
    }

    /// Tests Sable's actual TerminalMac component in a separate /bin/cat fixture, never a live shell.
    func runTerminalInputProbe(output: URL) async {
        var report: [String: Any] = [:]
        do {
            let bundle = "dev.shua.sable-input-fixture"
            guard let url = NSRunningApplication.runningApplications(withBundleIdentifier: bundle).first?.bundleURL else { throw failure("Open the disposable Sable input fixture first.") }
            let config = NSWorkspace.OpenConfiguration(); config.activates = true
            let app = try await NSWorkspace.shared.openApplication(at: url, configuration: config)
            try await Task.sleep(for: .milliseconds(700))
            guard app.isActive, let field = focused(app), let target = descriptor(field), target.role == "AXTextArea" else { throw failure("Sable fixture has no focused terminal input") }
            var settable = DarwinBoolean(false)
            _ = AXUIElementIsAttributeSettable(field, kAXValueAttribute as CFString, &settable)
            guard !settable.boolValue else { throw failure("Expected a keyboard-only terminal field") }
            report["keyboardOnly"] = true
            guard handle(["operation": "record", "followForeground": true])["ok"] as? Bool == true else { throw failure("Recording failed") }
            for unit in Array("demo".utf16) {
                var value = unit
                for down in [true, false] { let event = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: down); event?.flags = []; event?.keyboardSetUnicodeString(stringLength: 1, unicodeString: &value); event?.post(tap: .cghidEventTap) }
                try await Task.sleep(for: .milliseconds(20))
            }
            try await Task.sleep(for: .milliseconds(350)); stop("Recorded Sable fixture typing")
            guard let captured = draft, captured.steps.count == 1, captured.steps[0].operation == "input" else { report["draft"] = draft.map(encode); throw failure("Terminal typing did not record as one input") }
            guard captured.apps == [bundle], followForeground else { throw failure("Foreground app was not scoped automatically") }
            report["followingForeground"] = true
            report["recordedSteps"] = captured.steps.map(\.operation)
            guard handle(["operation": "save", "workflow": encode(captured)])["ok"] as? Bool == true, let saved = library.last else { throw failure("Save failed") }
            var durations: [Double] = []
            for value in [" test one", " cafe"] {
                let before = text(field, kAXValueAttribute)
                guard handle(["operation": "run", "workflowId": saved.id, "inputs": ["input_1": value]])["ok"] as? Bool == true else { throw failure("Replay start failed") }
                for _ in 0..<100 { if !busy { break }; try await Task.sleep(for: .milliseconds(100)) }
                guard phase == "completed", workflowKeyboardTextVerified(before: before, after: text(field, kAXValueAttribute), inserted: value) else { throw failure("Terminal replay failed: " + message) }
                durations.append(library.last?.lastMs ?? -1)
            }
            report["verifiedRuns"] = library.last?.successes; report["replayMilliseconds"] = durations; report["ok"] = true
        } catch { report["error"] = error.localizedDescription; report["ok"] = false; stop("Terminal probe stopped") }
        if let data = try? JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]) { try? data.write(to: output, options: .atomic) }
    }

    /// Opt-in real-app probe; creates new disposable TextEdit documents, never edits existing ones.
    func runTextEditProbe(output: URL, multiline: Bool = false) async {
        var report: [String: Any] = [:]
        do {
            let bundle = "com.apple.TextEdit"
            guard let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundle) else { throw failure("TextEdit is unavailable") }
            let config = NSWorkspace.OpenConfiguration(); config.activates = true
            let app = try await NSWorkspace.shared.openApplication(at: url, configuration: config)
            try await Task.sleep(for: .milliseconds(700))
            guard app.isActive, permitted(app) else { throw failure("TextEdit is not a permitted active target") }
            let result = handle(["operation": "record", "apps": [bundle]])
            guard result["ok"] as? Bool == true else { throw failure("Could not start TextEdit recording") }
            try await Task.sleep(for: .milliseconds(500)); key("cmd+n")
            try await Task.sleep(for: .milliseconds(900))
            guard let field = focused(app), descriptor(field)?.role == "AXTextArea", text(field, kAXValueAttribute).isEmpty else { throw failure("A new blank TextEdit document was not observed") }
            for unit in Array((multiline ? "disposable\ndemonstration" : "disposable demonstration").utf16) {
                guard app.isActive else { throw failure("TextEdit focus changed") }
                var value = unit
                for down in [true, false] { let event = CGEvent(keyboardEventSource: nil, virtualKey: unit == 10 ? 36 : 0, keyDown: down); event?.flags = []; if unit != 10 { event?.keyboardSetUnicodeString(stringLength: 1, unicodeString: &value) }; event?.post(tap: .cghidEventTap) }
                try await Task.sleep(for: .milliseconds(15))
            }
            try await Task.sleep(for: .milliseconds(300)); stop("TextEdit demonstration recorded")
            guard var captured = draft else { throw failure("No recorded TextEdit draft") }
            report["recordedSteps"] = captured.steps.map(\.operation); report["captured"] = encode(captured)
            guard captured.steps.count == 2, captured.steps[0].shortcut == "cmd+n", captured.steps[0].newWindow == true, captured.steps[1].operation == "input" else { throw failure("TextEdit recording did not prove a new document before typing") }
            captured.name = "New TextEdit note"
            guard handle(["operation": "save", "workflow": encode(captured)])["ok"] as? Bool == true, let workflow = library.last else { throw failure("Save failed") }
            var durations: [Double] = []
            for value in (multiline ? ["Shua keyboard test\nSecond line", "Café 👋\nReturn verified"] : ["Shua workflow verified once", "Shua workflow verified twice"]) {
                let previous = element(root(app), kAXFocusedWindowAttribute)
                guard handle(["operation": "run", "workflowId": workflow.id, "inputs": ["input_1": value]])["ok"] as? Bool == true else { throw failure("Replay start failed") }
                for _ in 0..<100 { if !busy { break }; try await Task.sleep(for: .milliseconds(100)) }
                guard phase == "completed", let field = focused(app), text(field, kAXValueAttribute) == value,
                      let after = element(root(app), kAXFocusedWindowAttribute), previous.map({ !CFEqual($0, after) }) == true else { throw failure("TextEdit replay did not verify: " + message) }
                durations.append(library.last?.lastMs ?? -1)
            }
            report["replayMilliseconds"] = durations; report["verifiedRuns"] = library.last?.successes
            report["typedValueNotPersisted"] = !(try String(contentsOf: file, encoding: .utf8)).contains("disposable demonstration")
            report["ok"] = true
        } catch { stop("TextEdit probe ended"); report["ok"] = false; report["error"] = error.localizedDescription; report["state"] = state() }
        if let data = try? JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]) { try? data.write(to: output, options: .atomic) }
    }

}
