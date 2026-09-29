import AppKit
import ScreenCaptureKit
import WebKit
import PDFKit
import ShuaCrewCore

@MainActor
final class TeachingOverlay {
    private struct Capture {
        let id: String; let displayID: CGDirectDisplayID; let screen: NSScreen
        let geometry: TeachingCaptureGeometry; let at: Date; let fingerprint: Data
    }
    private var capture: Capture?
    private var panel: NSPanel?
    private weak var client: WKWebView?
    private var monitors: [Any] = []
    private var observers: [NSObjectProtocol] = []
    private var timer: Timer?
    private var checking = false
    private var practiceSession: String?
    private var practiceScreen: NSScreen?
    private weak var practiceClient: WKWebView?
    private var practiceEpoch = 0
    private var practiceTask: Task<Void, Never>?
    private var practiceHeartbeat = Date.distantPast
    private func emit(_ name: String, _ value: [String: Any], to web: WKWebView?) {
        guard let web, let data = try? JSONSerialization.data(withJSONObject: value),
              let json = String(data: data, encoding: .utf8) else { return }
        web.evaluateJavaScript("window.dispatchEvent(new CustomEvent('\(name)',{detail:\(json)}))")
    }
    private func pausePractice() {
        practiceEpoch += 1; practiceTask?.cancel(); practiceTask = nil
        let session = practiceSession; practiceSession = nil; practiceScreen = nil; invalidate(); stopMonitoringIfIdle()
        if let session { emit("shuacrew:practicePaused", ["sessionId": session], to: practiceClient) }
        practiceClient = nil
    }
    private func observeClick(_ point: CGPoint, explicit: Bool = false) {
        guard let session = practiceSession, let screen = practiceScreen, screen.frame.contains(point) else { return }
        guard Date().timeIntervalSince(practiceHeartbeat) < 5, practiceClient != nil else { pausePractice(); return }
        practiceEpoch += 1; let epoch = practiceEpoch, at = Date().timeIntervalSince1970 * 1000
        practiceTask?.cancel()
        practiceTask = Task { [weak self] in
            guard let self else { return }
            do {
                try await Task.sleep(for: .milliseconds(750))
                let result = try await self.takeCapture(on: screen)
                guard !Task.isCancelled, epoch == self.practiceEpoch, self.practiceSession == session else { return }
                let event: [String: Any] = ["sessionId": session, "eventId": "event_" + UUID().uuidString,
                    "kind": explicit ? "check" : "click", "observedAt": at,
                    "displayId": (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value ?? 0,
                    "x": (point.x-screen.frame.minX)/screen.frame.width,
                    "y": (screen.frame.maxY-point.y)/screen.frame.height,
                    "source": ["id": "source_" + UUID().uuidString, "title": "Practice observation", "kind": "capture",
                        "text": explicit ? "Authorized explicit screen check; coordinates are the display center, not a click" : "Authorized capture after a click", "image": result["data"]!, "mime": "image/jpeg", "capture": result["capture"]!]]
                self.emit("shuacrew:teachingObservation", event, to: self.practiceClient)
            } catch {
                guard !Task.isCancelled, epoch == self.practiceEpoch else { return }
                self.emit("shuacrew:practiceError", ["error": error.localizedDescription], to: self.practiceClient)
                self.pausePractice()
            }
        }
    }
    // Screen observation belongs to an authorized capture/practice session, not
    // app startup. In particular, onboarding must not install keyboard monitors.
    private func startMonitoring() {
        guard monitors.isEmpty else { return }
        if let monitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseUp, .rightMouseUp, .keyDown, .scrollWheel], handler: { [weak self] event in
            let point = NSEvent.mouseLocation, click = event.type == .leftMouseUp || event.type == .rightMouseUp
            Task { @MainActor in self?.invalidate(); if click { self?.observeClick(point) } }
        }) { monitors.append(monitor) }
        if let monitor = NSEvent.addLocalMonitorForEvents(matching: [.keyDown], handler: { [weak self] event in
            if event.keyCode == 53 { self?.invalidate(); self?.pausePractice() }; return event
        }) { monitors.append(monitor) }
    }
    private func stopMonitoringIfIdle() {
        guard capture == nil, practiceSession == nil else { return }
        monitors.forEach(NSEvent.removeMonitor)
        monitors.removeAll()
    }
    init() {
        observers.append(NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { [weak self] notification in
            guard let app = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication, app.processIdentifier != ProcessInfo.processInfo.processIdentifier else { return }
            Task { @MainActor in self?.invalidate() }
        })
        observers.append(NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main) { [weak self] _ in Task { @MainActor in self?.invalidate(); self?.pausePractice() } })
    }
    private func reply(_ value: [String: Any], request: String, to web: WKWebView) {
        var result = value; result["requestId"] = request
        guard let data = try? JSONSerialization.data(withJSONObject: result), let json = String(data: data, encoding: .utf8) else { return }
        web.evaluateJavaScript("window.dispatchEvent(new CustomEvent('shuacrew:teaching',{detail:\(json)}))")
    }
    private func clear() { panel?.orderOut(nil); panel = nil; timer?.invalidate(); timer = nil }
    private func invalidate() {
        guard capture != nil else { return }; clear(); capture = nil
        stopMonitoringIfIdle()
        client?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('shuacrew:teachingInvalidated'))")
    }
    private func frame(on screen: NSScreen) async throws -> CGImage {
        guard let number = (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value else { throw Failure.message("Display unavailable") }
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        guard let display = content.displays.first(where: { $0.displayID == number }) else { throw Failure.message("Capture display disconnected") }
        let mine = content.windows.filter { $0.owningApplication?.processID == ProcessInfo.processInfo.processIdentifier }
        let config = SCStreamConfiguration(); config.width = Int(screen.frame.width * screen.backingScaleFactor); config.height = Int(screen.frame.height * screen.backingScaleFactor); config.showsCursor = false
        return try await SCScreenshotManager.captureImage(contentFilter: SCContentFilter(display: display, excludingWindows: mine), configuration: config)
    }
    private func fingerprint(_ image: CGImage) -> Data {
        var bytes = [UInt8](repeating: 0, count: 64 * 40 * 4)
        bytes.withUnsafeMutableBytes { ptr in
            if let context = CGContext(data: ptr.baseAddress, width: 64, height: 40, bitsPerComponent: 8, bytesPerRow: 64 * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) { context.draw(image, in: CGRect(x: 0, y: 0, width: 64, height: 40)) }
        }
        return Data(bytes)
    }
    private func checkContext() async {
        guard !checking, let shot = capture else { return }; checking = true; defer { checking = false }
        guard Date().timeIntervalSince(shot.at) < 120, NSScreen.screens.contains(where: { $0 == shot.screen && $0.frame == shot.geometry.display }) else { invalidate(); return }
        do { let current = try await frame(on: shot.screen); guard capture?.id == shot.id else { return }; if fingerprint(current) != shot.fingerprint { invalidate() } } catch { invalidate() }
    }
    private func takeCapture(on screen: NSScreen) async throws -> [String: Any] {
        guard let number = (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value else { throw Failure.message("Display unavailable") }
                    let image = try await frame(on: screen)
                    guard let small = ScreenText.scaled(image, longest: 1568), let jpeg = NSBitmapImageRep(cgImage: small).representation(using: .jpeg, properties: [.compressionFactor: 0.75]) else { throw Failure.message("Capture encoding failed") }
                    let id = "capture_" + UUID().uuidString, at = Date(), bounds = screen.frame
                    let geometry = TeachingCaptureGeometry(display: bounds, sourcePixels: CGSize(width: image.width, height: image.height), cropPixels: CGRect(x: 0, y: 0, width: image.width, height: image.height), imagePixels: CGSize(width: small.width, height: small.height))
                    capture = Capture(id: id, displayID: number, screen: screen, geometry: geometry, at: at, fingerprint: fingerprint(image))
                    startMonitoring()
        return ["data": jpeg.base64EncodedString(), "capture": ["id": id, "displayId": number, "capturedAt": at.timeIntervalSince1970 * 1000, "sourceWidth": image.width, "sourceHeight": image.height, "width": small.width, "height": small.height, "display": ["x": bounds.minX, "y": bounds.minY, "width": bounds.width, "height": bounds.height], "crop": ["x": 0, "y": 0, "width": image.width, "height": image.height], "context": "display-\(number)"]]
    }
    enum Failure: LocalizedError { case message(String); var errorDescription: String? { if case .message(let message) = self { return message }; return nil } }
    func handle(_ body: [String: Any], to web: WKWebView) {
        let request = body["requestId"] as? String ?? ""; client = web
        switch body["type"] as? String {
        case "buddyTeachPracticeStart":
            guard let session = body["sessionId"] as? String, let display = (body["displayId"] as? NSNumber)?.uint32Value,
                  let screen = NSScreen.screens.first(where: { ($0.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value == display }),
                  ScreenAccess.granted() else { reply(["error": "Capture your chosen display first to authorize screen access."], request: request, to: web); return }
            pausePractice(); practiceSession = session; practiceScreen = screen; practiceClient = web; practiceHeartbeat = Date()
            startMonitoring()
            reply(["active": true], request: request, to: web)
        case "buddyTeachPracticePause": pausePractice(); reply(["active": false], request: request, to: web)
        case "buddyTeachPracticeCheck":
            guard let session = practiceSession, body["sessionId"] as? String == session, let screen = practiceScreen else {
                reply(["error": "Start guided practice before checking the screen."], request: request, to: web); return
            }
            practiceHeartbeat = Date()
            invalidate()
            observeClick(CGPoint(x: screen.frame.midX, y: screen.frame.midY), explicit: true)
            reply(["queued": true], request: request, to: web)
        case "buddyTeachPracticeStatus":
            if practiceSession != nil && Date().timeIntervalSince(practiceHeartbeat) >= 5 { pausePractice() }
            if practiceClient === web { practiceHeartbeat = Date() }
            reply(["active": practiceSession != nil, "sessionId": practiceSession ?? "", "owner": practiceClient === web], request: request, to: web)
        case "buddyTeachExport":
            guard let text = body["text"] as? String, text.utf8.count <= 4_000_000 else { reply(["error": "Lesson is too large to export"], request: request, to: web); return }
            let save = NSSavePanel(); save.nameFieldStringValue = String((body["name"] as? String ?? "lesson.json").replacingOccurrences(of: "/", with: "-").prefix(100))
            save.begin { [weak self] response in
                guard response == .OK, let url = save.url else { self?.reply(["saved": false], request: request, to: web); return }
                do { try text.write(to: url, atomically: true, encoding: .utf8); self?.reply(["saved": true], request: request, to: web) }
                catch { self?.reply(["error": error.localizedDescription], request: request, to: web) }
            }
        case "buddyTeachDisplays":
            reply(["displays": NSScreen.screens.map { ["id": ($0.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value ?? 0, "name": $0.localizedName] as [String: Any] }], request: request, to: web)
        case "buddyTeachSelection":
            let selection = Selection.read(); reply(["text": selection?.text ?? "", "app": selection?.app ?? ""], request: request, to: web)
        case "buddyTeachDocument":
            guard let encoded = body["data"] as? String, encoded.count <= 2_800_000, let data = Data(base64Encoded: encoded), let pdf = PDFDocument(data: data), !pdf.isLocked else { reply(["error": "PDF is invalid, locked, or too large"], request: request, to: web); return }
            var text = ""
            for index in 0..<min(pdf.pageCount, 200) { text += "\n[Page \(index + 1)]\n" + (pdf.page(at: index)?.string ?? ""); if text.count > 100000 { reply(["error": "PDF exceeds 100,000 text characters. Supply a smaller excerpt."], request: request, to: web); return } }
            if pdf.pageCount > 200 { reply(["error": "PDF exceeds 200 pages. Supply the relevant pages."], request: request, to: web); return }
            reply(["text": text], request: request, to: web)
        case "buddyTeachClear": clear(); reply(["ok": true], request: request, to: web)
        case "buddyTeachCapture":
            guard ScreenAccess.granted() || ScreenAccess.request() else { reply(["error": "Screen Recording permission is unavailable. Use text or documents, or enable it in macOS Settings."], request: request, to: web); return }
            invalidate()
            let selected = (body["displayId"] as? NSNumber)?.uint32Value
            guard let screen = NSScreen.screens.first(where: { selected != nil ? ($0.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value == selected : $0.frame.contains(NSEvent.mouseLocation) }) else { reply(["error": "Select an available display"], request: request, to: web); return }
            Task {
                do {
                    let result = try await takeCapture(on: screen)
                    reply(result, request: request, to: web)
                } catch { reply(["error": error.localizedDescription], request: request, to: web) }
            }
        case "buddyTeachOverlay":
            guard let shapes = body["annotations"] as? [[String: Any]], !shapes.isEmpty, shapes.count <= 30, let shot = capture,
                  shapes.allSatisfy({ ($0["captureId"] as? String) == shot.id }), Date().timeIntervalSince(shot.at) < 120 else { reply(["error": "Annotations refer to an expired or different capture. Capture the screen again."], request: request, to: web); return }
            Task {
                await checkContext()
                guard capture?.id == shot.id else { reply(["error": "Screen context changed. Capture again before annotating."], request: request, to: web); return }
                guard let drawing = TeachingAnnotationView(shapes: shapes, geometry: shot.geometry) else { reply(["error": "Invalid annotation geometry"], request: request, to: web); return }
                clear(); let overlay = NSPanel(contentRect: shot.screen.frame, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
                overlay.isOpaque = false; overlay.backgroundColor = .clear; overlay.hasShadow = false; overlay.ignoresMouseEvents = true; overlay.level = .floating; overlay.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]; overlay.contentView = drawing; overlay.orderFrontRegardless(); panel = overlay
                timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in Task { @MainActor in await self?.checkContext() } }
                reply(["ok": true, "message": "Annotations displayed on the captured display. Escape or Dismiss clears them; screen changes invalidate them."], request: request, to: web)
            }
        default: break
        }
    }
}

@MainActor
private final class TeachingAnnotationView: NSView {
    override var isFlipped: Bool { true }
    private let shapes: [(kind: String, rect: CGRect, label: String, end: CGPoint?)]
    init?(shapes raw: [[String: Any]], geometry: TeachingCaptureGeometry) {
        var shapes: [(String, CGRect, String, CGPoint?)] = []
        for shape in raw {
            guard let kind = shape["kind"] as? String, ["arrow", "circle", "rectangle", "highlight", "underline", "label"].contains(kind), let x = shape["x"] as? Double, let y = shape["y"] as? Double, let w = shape["w"] as? Double, let h = shape["h"] as? Double, [x,y,w,h].allSatisfy({ $0.isFinite && $0 >= 0 && $0 <= 1 }), x+w <= 1.000001, y+h <= 1.000001,
                  let a = geometry.displayPoint(imagePoint: CGPoint(x: x * geometry.imagePixels.width, y: y * geometry.imagePixels.height)), let b = geometry.displayPoint(imagePoint: CGPoint(x: (x+w) * geometry.imagePixels.width, y: (y+h) * geometry.imagePixels.height)) else { return nil }
            var arrowEnd: CGPoint?
            if kind == "arrow" {
                guard let ex = shape["endX"] as? Double, let ey = shape["endY"] as? Double,
                      let end = geometry.displayPoint(imagePoint: CGPoint(x: ex * geometry.imagePixels.width, y: ey * geometry.imagePixels.height)) else { return nil }
                arrowEnd = CGPoint(x: end.x-geometry.display.minX, y: geometry.display.maxY-end.y)
            }
            shapes.append((kind, CGRect(x: a.x-geometry.display.minX, y: geometry.display.maxY-a.y, width: b.x-a.x, height: a.y-b.y), String((shape["label"] as? String ?? "").prefix(100)), arrowEnd))
        }
        self.shapes = shapes; super.init(frame: CGRect(origin: .zero, size: geometry.display.size))
    }
    required init?(coder: NSCoder) { nil }
    override func draw(_ dirtyRect: NSRect) {
        for shape in shapes {
            let color = NSColor.systemBlue, rect = shape.rect, line = NSBezierPath(); line.lineWidth = 3; line.lineCapStyle = .round; color.setStroke()
            switch shape.kind {
            case "circle": line.appendOval(in: rect)
            case "arrow":
                let a = rect.origin, b = shape.end ?? rect.origin; line.move(to: a); line.line(to: b)
                let angle = atan2(b.y-a.y,b.x-a.x)
                for delta in [-0.5,0.5] { line.move(to: b); line.line(to: CGPoint(x: b.x-14*cos(angle+delta), y: b.y-14*sin(angle+delta))) }
            case "underline": line.move(to: CGPoint(x: rect.minX, y: rect.maxY)); line.line(to: CGPoint(x: rect.maxX, y: rect.maxY))
            case "highlight": color.withAlphaComponent(0.22).setFill(); NSBezierPath(roundedRect: rect, xRadius: 5, yRadius: 5).fill(); line.appendRoundedRect(rect, xRadius: 5, yRadius: 5)
            case "label": break
            default: line.appendRoundedRect(rect, xRadius: 6, yRadius: 6)
            }
            line.stroke()
            if !shape.label.isEmpty {
                let attributes: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 13, weight: .semibold), .foregroundColor: NSColor.white]
                let text = shape.label as NSString, measured = text.boundingRect(with: CGSize(width: 240, height: 100), options: [.usesLineFragmentOrigin], attributes: attributes)
                let box = CGRect(x: min(max(4,rect.minX),bounds.width-measured.width-20), y: min(max(4,rect.minY-measured.height-16),bounds.height-measured.height-16), width: measured.width+16, height: measured.height+12)
                NSColor.black.withAlphaComponent(0.92).setFill(); NSBezierPath(roundedRect: box, xRadius: 6, yRadius: 6).fill(); text.draw(in: box.insetBy(dx: 8, dy: 6), withAttributes: attributes)
            }
        }
    }
}
