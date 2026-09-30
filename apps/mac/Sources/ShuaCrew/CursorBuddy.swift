import AppKit
import QuartzCore
import ScreenCaptureKit
import ShuaCrewCore

/// Spark beside your pointer, always there and never in the way: a small lit orb that trails yours, shows what Spark
/// is doing and flies to whatever Spark points at — drawing it — then comes back.
///
/// Built for fluidity: a few tiny layers in a transparent, click-through panel, moved in step with the display's own
/// refresh (120 Hz on ProMotion) by a frame-rate-independent spring. The old follow mode moved the whole Spark window
/// (a web view) on a 60 Hz timer, which the window server can't keep smooth.
///
/// Design: a lit sphere in your accent (gradient, specular highlight, dark rim so it reads on white pages) that
/// breathes when idle. Listening, a halo that moves with your voice; thinking, a light sweeping round it; speaking,
/// it pulses with Spark's voice. In flight it leaves a soft tail and settles with a little bounce; while it points,
/// a bubble beside it reveals the words as they're spoken.
@MainActor
final class CursorBuddy: NSObject {
    enum State: String { case idle, listening, thinking, speaking }

    private var panel: NSPanel?
    private let body = CALayer(), pulse = CALayer(), orb = CALayer()
    private let glow = CAGradientLayer(), sphere = CAGradientLayer(), rim = CAShapeLayer(), spec = CAShapeLayer()
    private let listenHalo = CAShapeLayer(), sweep = CAGradientLayer(), sweepMask = CAShapeLayer()
    private let trail = CAShapeLayer()
    private var link: CADisplayLink?
    private var position = CGPoint.zero, lastTick: CFTimeInterval = 0, placed = false
    private var awayUntil: CFTimeInterval = 0
    /// Live level (0–1): your mic while listening, Spark's voice while speaking. Smoothed; decays if it stops coming.
    private var levelTarget = 0.0, levelNow = 0.0, levelAt: CFTimeInterval = 0
    /// Recent positions while flying, for the tail.
    private var wake: [(CGPoint, CFTimeInterval)] = []
    /// Pointing: the orb itself flies the drawing tour (it's the pen), then stays on the mark while Spark talks
    /// about it — a speech bubble beside it — and comes home when Spark is done or you move the mouse away.
    private var tour: (plan: CursorMotion.PenTour, start: CFTimeInterval, mouse: CGPoint)?
    private var tourDone: CFTimeInterval = 0
    private let bubble = CALayer(), bubbleText = CATextLayer(), bubbleTail = CAShapeLayer()
    private var bubbleWords: [String] = [], bubbleShown = 0, bubbleAt: CFTimeInterval = 0
    /// While you hold fn to talk, what you draw with your cursor (global points) and the glowing ink showing it.
    private var inking = false, inked: [CGPoint] = [], injected = false, inkVisible = true
    var isInking: Bool { inking }
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
        sweep.removeAnimation(forKey: "spin")
        CATransaction.begin(); CATransaction.setAnimationDuration(0.3)
        sweep.opacity = new == .thinking ? 1 : 0
        if new != .listening { listenHalo.opacity = 0 }
        if new == .thinking { // a light sweeping round the orb: working on it
            let spin = CABasicAnimation(keyPath: "transform.rotation.z"); spin.fromValue = 0; spin.toValue = -2 * Double.pi
            spin.duration = 1.1; spin.repeatCount = .infinity
            sweep.add(spin, forKey: "spin")
        }
        CATransaction.commit()
        if new == .idle || new == .thinking { levelTarget = 0 }
    }

    /// The live level while listening (your mic) or speaking (Spark's voice), 0–1, ~20 times a second.
    func level(_ v: Double) { levelTarget = min(1, max(0, v)); levelAt = CACurrentMediaTime() }

    /// Start recording what you draw with your cursor (fn is down).
    /// `visible: false` records without drawing (hands-free voice: people move the mouse while talking, so only a
    /// deliberate loop counts, and it's shown after — see flash).
    func beginInk(visible: Bool = true) {
        guard panel != nil else { return }
        inking = true; inked = []; injected = false; inkVisible = visible
        for l in [ink, halo] { l.removeAllAnimations(); l.opacity = 1; l.path = nil }
    }
    /// "Got it — this": a ring drawn round the area you circled while talking hands-free, then fading.
    func flash(_ region: CGRect) {
        guard let panel else { return }
        let r = region.offsetBy(dx: -panel.frame.minX, dy: -panel.frame.minY).insetBy(dx: -6, dy: -6)
        let path = CGPath(ellipseIn: r, transform: nil)
        for l in [ink, halo] { l.removeAllAnimations(); l.opacity = 1 }
        CATransaction.begin(); CATransaction.setDisableActions(true); ink.path = path; halo.path = path; CATransaction.commit()
        let draw = CABasicAnimation(keyPath: "strokeEnd"); draw.fromValue = 0; draw.toValue = 1; draw.duration = 0.4
        ink.add(draw, forKey: "draw"); halo.add(draw, forKey: "draw")
        let fade = CABasicAnimation(keyPath: "opacity"); fade.fromValue = 1; fade.toValue = 0
        fade.beginTime = CACurrentMediaTime() + 1.4; fade.duration = 0.5; fade.fillMode = .forwards; fade.isRemovedOnCompletion = false
        ink.add(fade, forKey: "fade"); halo.add(fade, forKey: "fade")
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

    /// Where the orb is now (global), where a pointing flight starts.
    var globalPosition: NSPoint? { guard let panel, placed else { return nil }; return NSPoint(x: panel.frame.minX + position.x, y: panel.frame.minY + position.y) }

    /// Take the pen for a drawing tour (global coordinates, on the CACurrentMediaTime clock). False if it can't —
    /// e.g. the marks are on another display — and the overlay draws its own tip instead.
    func take(_ plan: CursorMotion.PenTour, start: CFTimeInterval) -> Bool {
        guard let panel, placed, panel.frame.contains(plan.end) else { return false }
        tour = (plan, start, NSEvent.mouseLocation); tourDone = 0; awayUntil = 0; wake = []
        CATransaction.begin(); CATransaction.setDisableActions(true); body.opacity = 1; CATransaction.commit()
        return true
    }

    /// What Spark is saying about what it's pointing at, in a bubble beside the orb (only while pointing). The bubble
    /// is sized for the whole sentence up front and the words appear at speaking pace, so it never jumps as it fills.
    func say(_ text: String) {
        guard tour != nil, let panel else { return }
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { hideBubble(); return }
        bubbleWords = clean.split(separator: " ").map(String.init); bubbleShown = 0; bubbleAt = CACurrentMediaTime()
        let size = attributed(shown: bubbleWords.count).boundingRect(with: CGSize(width: 250, height: 400), options: [.usesLineFragmentOrigin, .usesFontLeading]).integral.size
        CATransaction.begin(); CATransaction.setDisableActions(true)
        bubbleText.frame = CGRect(x: 12, y: 8, width: size.width, height: size.height)
        bubble.bounds = CGRect(x: 0, y: 0, width: size.width + 24, height: size.height + 16)
        revealBubble(now: bubbleAt)
        placeBubble(in: panel)
        CATransaction.commit()
        if bubble.opacity < 1 {
            bubble.opacity = 1
            let pop = CASpringAnimation(keyPath: "transform.scale"); pop.fromValue = 0.7; pop.toValue = 1; pop.damping = 13; pop.duration = pop.settlingDuration
            bubble.add(pop, forKey: "pop")
        }
    }
    private func attributed(shown: Int) -> NSAttributedString {
        let font = NSFont.systemFont(ofSize: 13, weight: .medium), out = NSMutableAttributedString()
        for (i, w) in bubbleWords.enumerated() {
            out.append(NSAttributedString(string: (i == 0 ? "" : " ") + w, attributes: [.font: font, .foregroundColor: i < shown ? NSColor.white : NSColor.clear]))
        }
        return out
    }
    /// Words at speaking pace (~3.6 a second), the first one at once.
    private func revealBubble(now: CFTimeInterval) {
        let n = min(bubbleWords.count, 1 + Int((now - bubbleAt) / 0.28))
        guard n != bubbleShown else { return }
        bubbleShown = n; bubbleText.string = attributed(shown: n)
    }
    private func placeBubble(in panel: NSPanel) {
        let w = bubble.bounds.width, h = bubble.bounds.height, W = panel.frame.width, H = panel.frame.height
        var x = position.x + 22 + w / 2, y = position.y + 22 + h / 2, left = false, below = false // up and to the right of the orb
        if x + w / 2 > W - 8 { x = position.x - 22 - w / 2; left = true }
        if y + h / 2 > H - 8 { y = position.y - 22 - h / 2; below = true }
        bubble.position = CGPoint(x: x, y: y)
        // A small tail on the corner facing the orb.
        // Base on the bubble's edge near the orb's corner, tip leaning out toward the orb.
        let tx: CGFloat = left ? w - 18 : 18, ty: CGFloat = below ? h - 1 : 1, dir: CGFloat = below ? 1 : -1, dx: CGFloat = left ? 1 : -1
        let tail = CGMutablePath()
        // Open path: filled like the bubble, outlined only on its two outer sides (like the bubble's own edge).
        tail.move(to: CGPoint(x: tx - 8, y: ty)); tail.addLine(to: CGPoint(x: tx + 11 * dx, y: ty + 11 * dir)); tail.addLine(to: CGPoint(x: tx + 8, y: ty))
        bubbleTail.path = tail
    }
    private func hideBubble() {
        guard bubble.opacity > 0 else { return }
        CATransaction.begin(); CATransaction.setAnimationDuration(0.25); bubble.opacity = 0; CATransaction.commit()
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
        let cx = position.x * scale, cy = (screen.frame.height - position.y) * scale
        let config = SCStreamConfiguration()
        config.width = Int(Double(display.width) * scale); config.height = Int(Double(display.height) * scale); config.showsCursor = false
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
            if inked.count > 2400 { inked.removeFirst(inked.count - 2400) } // a long monologue: the last ~20 s is plenty
            if inkVisible {
                let path = CGMutablePath()
                for (i, p) in inked.enumerated() { let q = CGPoint(x: p.x - panel.frame.minX, y: p.y - panel.frame.minY); i == 0 ? path.move(to: q) : path.addLine(to: q) }
                CATransaction.begin(); CATransaction.setDisableActions(true); ink.path = path; halo.path = path; CATransaction.commit()
            }
        }
        // The live level, smoothed so it glides; it fades out if the page stops sending (you went quiet).
        if now - levelAt > 0.3 { levelTarget = 0 }
        levelNow += (levelTarget - levelNow) * (1 - exp(-dt / 0.07))
        CATransaction.begin(); CATransaction.setDisableActions(true)
        let lv = CGFloat(levelNow)
        if state == .listening { listenHalo.opacity = Float(0.35 + 0.65 * lv); listenHalo.setAffineTransform(CGAffineTransform(scaleX: 1 + 0.9 * lv, y: 1 + 0.9 * lv)) }
        let s = state == .speaking ? 1 + 0.35 * lv : 1
        pulse.setAffineTransform(CGAffineTransform(scaleX: s, y: s))
        if bubble.opacity > 0 { revealBubble(now: now) }
        CATransaction.commit()

        if let t = tour {
            let g = t.plan.at(now - t.start)
            position = CGPoint(x: g.point.x - panel.frame.minX, y: g.point.y - panel.frame.minY)
            // A soft tail while it flies (the last ~0.16 s of its path); gone when it slows down.
            wake.append((position, now)); wake.removeAll { now - $0.1 > 0.16 }
            let path = CGMutablePath()
            if let first = wake.first, hypot(position.x - first.0.x, position.y - first.0.y) > 12 {
                path.move(to: first.0); for (p, _) in wake.dropFirst() { path.addLine(to: p) }
            }
            CATransaction.begin(); CATransaction.setDisableActions(true)
            trail.path = path
            body.position = position; body.setAffineTransform(CGAffineTransform(scaleX: g.scale, y: g.scale))
            if bubble.opacity > 0 { placeBubble(in: panel) }
            CATransaction.commit()
            if g.done {
                if tourDone == 0 { // landed: a little settle
                    tourDone = now
                    let settle = CASpringAnimation(keyPath: "transform.scale"); settle.fromValue = 1.3; settle.toValue = 1; settle.damping = 9; settle.duration = settle.settlingDuration
                    orb.add(settle, forKey: "settle")
                }
                // Home when you move away, when Spark has finished talking about it, or after a while regardless.
                let movedAway = hypot(cursor.x - t.mouse.x, cursor.y - t.mouse.y) > 100
                if movedAway || (state != .speaking && now - tourDone > 1.2) || now - tourDone > 12 {
                    tour = nil; hideBubble(); wake = []
                    CATransaction.begin(); CATransaction.setDisableActions(true); trail.path = nil; body.setAffineTransform(.identity); CATransaction.commit()
                }
            }
            return
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
            orb.add(pop, forKey: "pop")
        }
    }

    private func build(in root: CALayer) {
        let box = CGRect(x: 0, y: 0, width: 44, height: 44), c = CGPoint(x: 22, y: 22)
        body.bounds = box
        for l in [pulse, orb] { l.bounds = box; l.position = c }
        // The lit sphere: soft light behind it, a radial gradient body lit from the upper left, a dark rim so it reads
        // on white, and a small specular highlight.
        glow.type = .radial; glow.frame = box; glow.startPoint = CGPoint(x: 0.5, y: 0.5); glow.endPoint = CGPoint(x: 1, y: 1)
        sphere.type = .radial; sphere.frame = CGRect(x: 15, y: 15, width: 14, height: 14); sphere.cornerRadius = 7; sphere.masksToBounds = true
        sphere.startPoint = CGPoint(x: 0.35, y: 0.68); sphere.endPoint = CGPoint(x: 1.05, y: -0.05)
        rim.path = CGPath(ellipseIn: CGRect(x: 15, y: 15, width: 14, height: 14), transform: nil)
        rim.fillColor = NSColor.clear.cgColor; rim.lineWidth = 1.1; rim.strokeColor = NSColor.black.withAlphaComponent(0.5).cgColor
        spec.path = CGPath(ellipseIn: CGRect(x: 18.2, y: 23.4, width: 3.6, height: 2.4), transform: nil)
        spec.fillColor = NSColor.white.withAlphaComponent(0.9).cgColor
        orb.addSublayer(glow); orb.addSublayer(sphere); orb.addSublayer(rim); orb.addSublayer(spec)
        pulse.addSublayer(orb)
        // Idle: it breathes and floats, gently — alive, never busy.
        let breathe = CABasicAnimation(keyPath: "transform.scale"); breathe.fromValue = 1; breathe.toValue = 1.05
        breathe.duration = 1.6; breathe.autoreverses = true; breathe.repeatCount = .infinity; breathe.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        let float = CABasicAnimation(keyPath: "transform.translation.y"); float.fromValue = -1.2; float.toValue = 1.2
        float.duration = 2.3; float.autoreverses = true; float.repeatCount = .infinity; float.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        orb.add(breathe, forKey: "breathe"); orb.add(float, forKey: "float")
        // Listening halo (scaled by your voice) and the thinking sweep (a conic light masked to a ring).
        listenHalo.path = CGPath(ellipseIn: CGRect(x: 10, y: 10, width: 24, height: 24), transform: nil)
        listenHalo.bounds = box; listenHalo.position = c; listenHalo.fillColor = NSColor.clear.cgColor; listenHalo.lineWidth = 2; listenHalo.opacity = 0
        listenHalo.shadowColor = NSColor.black.cgColor; listenHalo.shadowOpacity = 0.4; listenHalo.shadowRadius = 1.5; listenHalo.shadowOffset = .zero
        sweep.type = .conic; sweep.frame = box; sweep.startPoint = CGPoint(x: 0.5, y: 0.5); sweep.endPoint = CGPoint(x: 0.5, y: 1); sweep.opacity = 0
        sweepMask.path = CGPath(ellipseIn: CGRect(x: 8.5, y: 8.5, width: 27, height: 27), transform: nil)
        sweepMask.fillColor = NSColor.clear.cgColor; sweepMask.strokeColor = NSColor.black.cgColor; sweepMask.lineWidth = 2.6
        sweep.mask = sweepMask
        body.addSublayer(listenHalo); body.addSublayer(sweep); body.addSublayer(pulse)
        // The flight tail, the ink you draw, and the bubble.
        trail.fillColor = NSColor.clear.cgColor; trail.lineWidth = 5; trail.lineCap = .round; trail.lineJoin = .round
        ink.fillColor = NSColor.clear.cgColor; ink.lineWidth = 4; ink.lineCap = .round; ink.lineJoin = .round
        ink.shadowRadius = 6; ink.shadowOpacity = 0.9; ink.shadowOffset = .zero
        halo.fillColor = NSColor.clear.cgColor; halo.lineWidth = 7; halo.lineCap = .round; halo.lineJoin = .round
        halo.strokeColor = NSColor.black.withAlphaComponent(0.3).cgColor
        root.addSublayer(halo); root.addSublayer(ink); root.addSublayer(trail)
        bubble.backgroundColor = NSColor(calibratedRed: 0.07, green: 0.065, blue: 0.09, alpha: 0.95).cgColor
        bubble.cornerRadius = 12; bubble.borderWidth = 1; bubble.opacity = 0
        bubble.shadowColor = NSColor.black.cgColor; bubble.shadowOpacity = 0.35; bubble.shadowRadius = 12; bubble.shadowOffset = CGSize(width: 0, height: -4)
        bubbleText.isWrapped = true; bubbleText.contentsScale = NSScreen.main?.backingScaleFactor ?? 2
        bubbleTail.fillColor = bubble.backgroundColor; bubbleTail.lineWidth = 1; bubbleTail.lineJoin = .round
        bubble.addSublayer(bubbleTail); bubble.addSublayer(bubbleText)
        root.addSublayer(body)
        root.addSublayer(bubble)
        restyle()
    }

    private func restyle() {
        let c = color.usingColorSpace(.sRGB) ?? color
        let light = c.brightnessComponent > 0.85 && c.saturationComponent < 0.2
        // A white ("mono") accent becomes a pearl: white to cool grey, with a cool glow so it still reads on white.
        let hi = light ? NSColor.white : c.blended(withFraction: 0.55, of: .white) ?? c
        let mid = light ? NSColor(calibratedWhite: 0.9, alpha: 1) : c
        let lo = light ? NSColor(calibratedRed: 0.62, green: 0.66, blue: 0.76, alpha: 1) : c.blended(withFraction: 0.45, of: .black) ?? c
        sphere.colors = [hi.cgColor, mid.cgColor, lo.cgColor]; sphere.locations = [0, 0.45, 1]
        let aura = light ? NSColor(calibratedRed: 0.6, green: 0.68, blue: 0.9, alpha: 1) : c
        glow.colors = [aura.withAlphaComponent(0.5).cgColor, aura.withAlphaComponent(0).cgColor]
        let ringColor = light ? NSColor(calibratedWhite: 0.55, alpha: 1) : c.withAlphaComponent(0.95) // a white ring would vanish on white
        listenHalo.strokeColor = ringColor.cgColor
        sweep.colors = [ringColor.withAlphaComponent(0).cgColor, ringColor.withAlphaComponent(0.2).cgColor, ringColor.cgColor]
        trail.strokeColor = aura.withAlphaComponent(0.35).cgColor
        ink.strokeColor = color.withAlphaComponent(0.9).cgColor; ink.shadowColor = (light ? aura : color).cgColor
        bubble.borderColor = aura.withAlphaComponent(0.5).cgColor; bubbleTail.strokeColor = bubble.borderColor
    }

    /// Self-test: the buddy (in its current state) drawn on a white and a dark card, side by side — contrast on both.
    func preview(to path: String) -> Bool {
        let scale: CGFloat = 4, w = 120 * scale, h = 60 * scale
        guard let ctx = CGContext(data: nil, width: Int(w), height: Int(h), bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
        ctx.setFillColor(NSColor.white.cgColor); ctx.fill(CGRect(x: 0, y: 0, width: w / 2, height: h))
        ctx.setFillColor(NSColor(calibratedWhite: 0.12, alpha: 1).cgColor); ctx.fill(CGRect(x: w / 2, y: 0, width: w / 2, height: h))
        for x in [w / 4, 3 * w / 4] {
            ctx.saveGState(); ctx.translateBy(x: x - 22 * scale, y: h / 2 - 22 * scale); ctx.scaleBy(x: scale, y: scale)
            if state == .listening { listenHalo.render(in: ctx) }
            if state == .thinking { sweep.render(in: ctx) }
            orb.render(in: ctx)
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
