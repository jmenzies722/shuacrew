import AppKit
import QuartzCore
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

    /// Spark is about to point somewhere: the buddy launches from where it is (the flying arrow takes over from here)
    /// and slips back in beside your pointer once it has landed. Returns its position in global coordinates.
    func launch(for seconds: CFTimeInterval = 1.2) -> NSPoint? {
        guard let panel, placed else { return nil }
        let global = NSPoint(x: panel.frame.minX + position.x, y: panel.frame.minY + position.y)
        awayUntil = CACurrentMediaTime() + seconds
        CATransaction.begin(); CATransaction.setDisableActions(true); body.opacity = 0; CATransaction.commit()
        return global
    }

    // MARK: -

    @objc private func tick(_ link: CADisplayLink) {
        guard let panel else { return }
        let now = link.timestamp, dt = lastTick == 0 ? 1.0 / 120 : min(0.05, now - lastTick)
        lastTick = now
        let cursor = NSEvent.mouseLocation
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
        // A small cursor, tip up-left like the real one, leaning -20° so it reads as "a companion", not a second mouse.
        let a = CGMutablePath()
        a.move(to: CGPoint(x: 9, y: 24)); a.addLine(to: CGPoint(x: 21, y: 15)); a.addLine(to: CGPoint(x: 15.5, y: 13.8))
        a.addLine(to: CGPoint(x: 12.4, y: 7.5)); a.closeSubpath()
        arrow.path = a; arrow.frame = body.bounds
        arrow.lineWidth = 1.4; arrow.lineJoin = .round; arrow.strokeColor = NSColor.white.withAlphaComponent(0.95).cgColor
        arrow.shadowRadius = 7; arrow.shadowOpacity = 0.85; arrow.shadowOffset = .zero
        ring.path = CGPath(ellipseIn: CGRect(x: 1, y: 1, width: 28, height: 28), transform: nil)
        ring.frame = body.bounds; ring.fillColor = NSColor.clear.cgColor; ring.lineCap = .round; ring.opacity = 0
        body.addSublayer(ring); body.addSublayer(arrow)
        root.addSublayer(body)
        restyle()
    }

    private func restyle() {
        arrow.fillColor = color.cgColor; arrow.shadowColor = color.cgColor
        ring.strokeColor = color.withAlphaComponent(0.9).cgColor
    }

    private func screenUnderPointer() -> NSScreen? {
        let p = NSEvent.mouseLocation
        return NSScreen.screens.first { $0.frame.contains(p) } ?? NSScreen.main
    }
}
