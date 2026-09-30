import AppKit
import QuartzCore
import ScreenCaptureKit
import ShuaCrewCore

/// Spark beside your pointer, always there and never in the way: a small glowing cursor that trails yours, shows what
/// Spark is doing (listening, thinking, speaking) and launches to whatever Spark points at, then comes back.
///
/// Built for fluidity: one tiny layer in a transparent, click-through panel, moved in step with the display's own
/// refresh (120 Hz on ProMotion) by a frame-rate-independent spring — nothing else moves. The old follow mode moved the
/// whole Spark window (a web view) on a 60 Hz timer, which the window server can't keep smooth.
@MainActor
final class CursorBuddy: NSObject {
    enum State: String { case idle, listening, thinking, speaking }

    private var panel: NSPanel?
    private let body = CALayer(), arrow = CAShapeLayer(), ring = CAShapeLayer()
    private var link: CADisplayLink?
    private var position = CGPoint.zero, lastTick: CFTimeInterval = 0, placed = false
    private var awayUntil: CFTimeInterval = 0
    /// While you hold fn to talk, what you draw with your cursor (global points) and the glowing ink showing it.
    private var inking = false, inked: [CGPoint] = [], injected = false
    private let ink = CAShapeLayer(), halo = CAShapeLayer() // halo: a soft dark edge under the ink, for white pages
    private(set) var state: State = .idle
    var color: NSColor = NSColor(calibratedRed: 0.56, green: 0.28, blue: 1, alpha: 1) { didSet { restyle() } }
    var active: Bool { panel != nil }
    /// Its window, so Spark's own screenshots leave it out.
    var windowNumber: Int? { panel?.windowNumber }

    func start() {
        guard panel == nil, let screen = screenUnderPointer() else { return }
        let p = NSPanel(contentRect: screen.frame, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        p.isOpaque = false; p.backgroundColor = .clear; p.hasShadow = false; p.ignoresMouseEvents = true
        p.level = .statusBar; p.hidesOnDeactivate = false; p.isReleasedWhenClosed = false
        p.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        let root = NSView(frame: CGRect(origin: .zero, size: screen.frame.size))
        root.wantsLayer = true
        p.contentView = root
        build(in: root.layer!)
        p.orderFrontRegardless()
        panel = p; placed = false
        // Driven by the display itself: every frame it shows, never a timer drifting against it.
        let l = root.displayLink(target: self, selector: #selector(tick(_:)))
        l.add(to: .main, forMode: .common)
        link = l
    }

    func stop() {
        link?.invalidate(); link = nil
        panel?.orderOut(nil); panel = nil
    }

    func set(_ new: State) {
        guard new != state else { return }
        state = new
        ring.removeAllAnimations(); body.removeAnimation(forKey: "breathe")
        CATransaction.begin(); CATransaction.setAnimationDuration(0.25)
        switch new {
        case .idle:
            ring.opacity = 0
        case .listening: // a steady pulse: "I'm hearing you"
            ring.opacity = 1; ring.lineWidth = 2
            let pulse = CABasicAnimation(keyPath: "transform.scale"); pulse.fromValue = 0.8; pulse.toValue = 1.25
            pulse.duration = 0.7; pulse.autoreverses = true; pulse.repeatCount = .infinity; pulse.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
            ring.add(pulse, forKey: "pulse")
        case .thinking: // a short arc chasing round: working on it
            ring.opacity = 1; ring.lineWidth = 2.2
            let spin = CABasicAnimation(keyPath: "transform.rotation.z"); spin.fromValue = 0; spin.toValue = -2 * Double.pi
            spin.duration = 0.9; spin.repeatCount = .infinity
            ring.add(spin, forKey: "spin")
        case .speaking: // breathing with its voice
            ring.opacity = 0
            let breathe = CABasicAnimation(keyPath: "transform.scale"); breathe.fromValue = 1; breathe.toValue = 1.14
            breathe.duration = 0.42; breathe.autoreverses = true; breathe.repeatCount = .infinity; breathe.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
            body.add(breathe, forKey: "breathe")
        }
        ring.strokeEnd = new == .thinking ? 0.28 : 1
        CATransaction.commit()
    }

    /// Start recording what you draw with your cursor (fn is down).
    func beginInk() {
        guard panel != nil else { return }
        inking = true; inked = []; injected = false
        for l in [ink, halo] { l.removeAllAnimations(); l.opacity = 1; l.path = nil }
    }
    /// Self-test: points as if drawn with the cursor (global), without touching the real mouse.
    func injectInk(_ points: [CGPoint]) {
        guard let panel, inking else { return }
        inked = points; injected = true
        let path = CGMutablePath()
        for (i, p) in points.enumerated() { let q = CGPoint(x: p.x - panel.frame.minX, y: p.y - panel.frame.minY); i == 0 ? path.move(to: q) : path.addLine(to: q) }
        CATransaction.begin(); CATransaction.setDisableActions(true); ink.path = path; halo.path = path; CATransaction.commit()
    }
    /// Stop, fade the ink, and hand back the path (global coordinates) to read as a gesture.
    func endInk(keep: Bool = true) -> [CGPoint] {
        guard inking else { return [] }
        inking = false
        let fade = CABasicAnimation(keyPath: "opacity"); fade.fromValue = 1; fade.toValue = 0
        fade.beginTime = CACurrentMediaTime() + (keep ? 1.2 : 0); fade.duration = 0.5; fade.fillMode = .forwards; fade.isRemovedOnCompletion = false
        ink.add(fade, forKey: "fade"); halo.add(fade, forKey: "fade")
        return keep ? inked : []
    }

    /// Spark is about to point somewhere: the buddy launches from where it is (the flying arrow takes over from here)
    /// and slips back in beside your pointer once it has landed. Returns its position in global coordinates.
    func launch(for seconds: CFTimeInterval = 1.2) -> NSPoint? {
        guard let panel, placed else { return nil }
        let global = NSPoint(x: panel.frame.minX + position.x, y: panel.frame.minY + position.y)
        awayUntil = CACurrentMediaTime() + seconds
        CATransaction.begin(); CATransaction.setDisableActions(true); body.opacity = 0; CATransaction.commit()
        return global
    }

    /// Self-test: a 120-pt square around the buddy, captured from the screen with the buddy in it, saved as PNG.
    func snapshot(to path: String) async -> Bool {
        guard let panel, let screen = panel.screen else { return false }
        let number = (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value
        guard let content = try? await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true),
              let display = content.displays.first(where: { $0.displayID == number }) ?? content.displays.first else { return false }
        let scale = screen.backingScaleFactor, side = 120.0
        // Buddy centre in display pixels from the top-left.
        let cx = position.x * scale, cy = (screen.frame.height - position.y) * scale
        let config = SCStreamConfiguration()
        config.width = Int(Double(display.width) * scale); config.height = Int(Double(display.height) * scale); config.showsCursor = true
        guard let image = try? await SCScreenshotManager.captureImage(contentFilter: SCContentFilter(display: display, excludingWindows: []), configuration: config),
              let crop = image.cropping(to: CGRect(x: cx - side * scale / 2, y: cy - side * scale / 2, width: side * scale, height: side * scale)),
              let png = NSBitmapImageRep(cgImage: crop).representation(using: .png, properties: [:]) else { return false }
        return (try? png.write(to: URL(fileURLWithPath: path))) != nil
    }

    // MARK: -

    @objc private func tick(_ link: CADisplayLink) {
        guard let panel else { return }
        let now = link.timestamp, dt = lastTick == 0 ? 1.0 / 120 : min(0.05, now - lastTick)
        lastTick = now
        let cursor = NSEvent.mouseLocation
        if inking, !injected, inked.last.map({ hypot($0.x - cursor.x, $0.y - cursor.y) >= 2 }) ?? true {
            inked.append(cursor)
            let path = CGMutablePath()
            for (i, p) in inked.enumerated() { let q = CGPoint(x: p.x - panel.frame.minX, y: p.y - panel.frame.minY); i == 0 ? path.move(to: q) : path.addLine(to: q) }
            CATransaction.begin(); CATransaction.setDisableActions(true); ink.path = path; halo.path = path; CATransaction.commit()
        }
        // Follow the pointer onto another display at once.
        if !panel.frame.contains(cursor), let screen = screenUnderPointer() {
            panel.setFrame(screen.frame, display: false); panel.contentView?.frame = CGRect(origin: .zero, size: screen.frame.size); placed = false
        }
        let screen = panel.screen ?? NSScreen.main
        let visible = (screen?.visibleFrame ?? panel.frame).offsetBy(dx: -panel.frame.minX, dy: -panel.frame.minY)
        let target = CursorMotion.anchor(cursor: CGPoint(x: cursor.x - panel.frame.minX, y: cursor.y - panel.frame.minY), visible: visible)
        position = placed ? CursorMotion.follow(current: position, target: target, dt: dt) : target
        placed = true
        let back = awayUntil > 0 && now >= awayUntil
        CATransaction.begin(); CATransaction.setDisableActions(true)
        body.position = position
        CATransaction.commit()
        if back { // back beside you: pop in rather than blink
            awayUntil = 0
            CATransaction.begin(); CATransaction.setAnimationDuration(0.22); body.opacity = 1; CATransaction.commit()
            let pop = CASpringAnimation(keyPath: "transform.scale"); pop.fromValue = 0.4; pop.toValue = 1; pop.damping = 11; pop.duration = pop.settlingDuration
            body.add(pop, forKey: "pop")
        }
    }

    private func build(in root: CALayer) {
        body.bounds = CGRect(x: 0, y: 0, width: 30, height: 30)
        // An orb, not a second mouse pointer: a small glowing dot in your accent, with a thin dark rim so it shows on a
        // white page as well as a dark one (a white "mono" accent used to vanish on white). The flying arrow is kept
        // for the moment it points at something.
        arrow.path = CGPath(ellipseIn: CGRect(x: 9, y: 9, width: 12, height: 12), transform: nil)
        arrow.frame = body.bounds
        arrow.lineWidth = 1.25; arrow.strokeColor = NSColor.black.withAlphaComponent(0.55).cgColor
        arrow.shadowRadius = 8; arrow.shadowOpacity = 0.9; arrow.shadowOffset = .zero
        let core = CAShapeLayer() // a small bright centre: reads as "alive"
        core.path = CGPath(ellipseIn: CGRect(x: 12.5, y: 14, width: 4, height: 4), transform: nil)
        core.fillColor = NSColor.white.withAlphaComponent(0.85).cgColor
        ring.path = CGPath(ellipseIn: CGRect(x: 2, y: 2, width: 26, height: 26), transform: nil)
        ring.frame = body.bounds; ring.fillColor = NSColor.clear.cgColor; ring.lineCap = .round; ring.opacity = 0
        ring.shadowColor = NSColor.black.cgColor; ring.shadowOpacity = 0.45; ring.shadowRadius = 1.5; ring.shadowOffset = .zero
        body.addSublayer(ring); body.addSublayer(arrow); body.addSublayer(core)
        ink.fillColor = NSColor.clear.cgColor; ink.lineWidth = 4; ink.lineCap = .round; ink.lineJoin = .round
        ink.shadowRadius = 6; ink.shadowOpacity = 0.9; ink.shadowOffset = .zero
        halo.fillColor = NSColor.clear.cgColor; halo.lineWidth = 7; halo.lineCap = .round; halo.lineJoin = .round
        halo.strokeColor = NSColor.black.withAlphaComponent(0.3).cgColor
        root.addSublayer(halo); root.addSublayer(ink)
        root.addSublayer(body)
        restyle()
    }

    private func restyle() {
        arrow.fillColor = color.cgColor
        ink.strokeColor = color.withAlphaComponent(0.9).cgColor; ink.shadowColor = color.cgColor
        // The glow in the accent — but a white accent glows soft grey-blue so it still reads on white.
        let light = (color.usingColorSpace(.sRGB)?.brightnessComponent ?? 0.5) > 0.85 && (color.usingColorSpace(.sRGB)?.saturationComponent ?? 0) < 0.2
        arrow.shadowColor = (light ? NSColor(calibratedRed: 0.55, green: 0.62, blue: 0.8, alpha: 1) : color).cgColor
        ring.strokeColor = (light ? NSColor(calibratedWhite: 0.55, alpha: 1) : color.withAlphaComponent(0.95)).cgColor // a white ring would vanish on white
    }

    /// Self-test: the buddy (in its current state) drawn on a white and a dark card, side by side — contrast on both.
    func preview(to path: String) -> Bool {
        let scale: CGFloat = 4, w = 120 * scale, h = 60 * scale
        guard let ctx = CGContext(data: nil, width: Int(w), height: Int(h), bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
        ctx.setFillColor(NSColor.white.cgColor); ctx.fill(CGRect(x: 0, y: 0, width: w / 2, height: h))
        ctx.setFillColor(NSColor(calibratedWhite: 0.12, alpha: 1).cgColor); ctx.fill(CGRect(x: w / 2, y: 0, width: w / 2, height: h))
        for x in [w / 4, 3 * w / 4] {
            ctx.saveGState(); ctx.translateBy(x: x - 15 * scale, y: h / 2 - 15 * scale); ctx.scaleBy(x: scale, y: scale)
            for l in [ring, arrow] { l.render(in: ctx) }
            ctx.setFillColor(NSColor.white.withAlphaComponent(0.85).cgColor); ctx.fillEllipse(in: CGRect(x: 12.5, y: 14, width: 4, height: 4))
            ctx.restoreGState()
        }
        guard let image = ctx.makeImage(), let png = NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:]) else { return false }
        return (try? png.write(to: URL(fileURLWithPath: path))) != nil
    }

    private func screenUnderPointer() -> NSScreen? {
        let p = NSEvent.mouseLocation
        return NSScreen.screens.first { $0.frame.contains(p) } ?? NSScreen.main
    }
}
