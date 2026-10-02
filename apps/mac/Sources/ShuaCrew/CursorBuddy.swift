import AppKit
import QuartzCore
import ScreenCaptureKit
import ShuaCrewCore

/// Spark beside your pointer, always there and never in the way: a small lit arrow that trails yours, shows what Spark
/// is doing and flies to whatever Spark points at — drawing it — then comes back.
///
/// Built for fluidity: a few tiny layers in a transparent, click-through panel, moved in step with the display's own
/// refresh (120 Hz on ProMotion) by a frame-rate-independent spring. The old follow mode moved the whole Spark window
/// (a web view) on a 60 Hz timer, which the window server can't keep smooth.
///
/// Design: a rounded triangle (Clicky's shape, made premium) filled with ShuaCrew's gradient — your finish's two ends,
/// or the accent running into its pink blend like the logo — under a glass sheen, with a bevel edge (white inside,
/// dark outside, so it reads on white and black) and a soft glow in its colours. It points at your pointer while it
/// follows you and along its path while it flies or draws. It stays small when idle. Listening becomes a waveform; thinking has a light sweeping round it; speaking,
/// a steady ring and a gentle voice pulse. In flight it leaves a soft tail and settles without bouncing; while it points,
/// a bubble beside it reveals the words as they're spoken.
@MainActor
final class CursorBuddy: NSObject {
    enum State: String { case idle, listening, thinking, speaking }

    private var panel: NSPanel?
    private let body = CALayer(), pulse = CALayer(), orb = CALayer()
    private let glow = CAGradientLayer(), sphere = CAGradientLayer(), rim = CAShapeLayer(), spec = CAShapeLayer(), dart = CAShapeLayer()
    /// The glass sheen over the top half of the triangle (its own mask: a layer can mask only one other).
    private let sheen = CAGradientLayer(), sheenMask = CAShapeLayer()
    /// Which way the arrow points (radians, 0 = right, AppKit's y up). It starts up-left, at your pointer.
    private var heading: CGFloat = 3 * .pi / 4
    private let listenHalo = CAShapeLayer(), sweep = CAGradientLayer(), sweepMask = CAShapeLayer()
    private let trail = CAShapeLayer()
    /// While you talk, the orb becomes a waveform: bars that move with your voice.
    private let wave = CALayer(), bars = (0..<5).map { _ in CALayer() }
    private var reducedMotion = false
    private var presenceScale: CGFloat = 0.78
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
    /// Exact boxes round what you picked or circled (snapped to real edges), replacing the rough ink.
    private let picks = CAShapeLayer(), picksHalo = CAShapeLayer()
    private(set) var state: State = .idle
    var color: NSColor = NSColor(calibratedRed: 0.56, green: 0.28, blue: 1, alpha: 1) { didSet { restyle() } }
    /// The cursor's fill, tail to tip (the page sends it with the state); nil: drawn from `color`.
    var gradient: (NSColor, NSColor)? { didSet { restyle() } }
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
        reducedMotion = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
        build(in: root.layer!)
        updateMotion()
        p.orderFrontRegardless()
        panel = p; placed = false; lastTick = 0
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
        CATransaction.begin(); CATransaction.setAnimationDuration(reducedMotion ? 0 : 0.18)
        sweep.opacity = new == .thinking ? 1 : 0
        listenHalo.opacity = new == .speaking ? 0.75 : 0
        // Listening: the orb melts into the waveform (and back when you stop).
        let listening = new == .listening
        wave.opacity = listening ? 1 : 0; pulse.opacity = listening ? 0 : 1
        wave.setAffineTransform(listening ? .identity : CGAffineTransform(scaleX: 0.4, y: 0.4))
        pulse.setAffineTransform(listening ? CGAffineTransform(scaleX: 0.4, y: 0.4) : .identity)
        CATransaction.commit()
        updateMotion()
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

    /// Box exactly these (global rects): drawn on, in place of the rough ink, then fading after a while.
    func showPicks(_ rects: [CGRect], add: Bool = false, hold: CFTimeInterval = 6) {
        guard let panel, !rects.isEmpty else { return }
        let path = add ? (picks.path.map { CGMutablePath() .appending($0) } ?? CGMutablePath()) : CGMutablePath()
        for r in rects {
            let local = r.offsetBy(dx: -panel.frame.minX, dy: -panel.frame.minY).insetBy(dx: -5, dy: -4)
            path.addRoundedRect(in: local, cornerWidth: min(8, local.height / 2), cornerHeight: min(8, local.height / 2))
        }
        for l in [ink, halo] { l.removeAllAnimations(); l.opacity = 0 } // the rough stroke gives way to the exact boxes
        for l in [picks, picksHalo] { l.removeAllAnimations(); l.opacity = 1 }
        CATransaction.begin(); CATransaction.setDisableActions(true); picks.path = path; picksHalo.path = path; CATransaction.commit()
        let draw = CABasicAnimation(keyPath: "strokeEnd"); draw.fromValue = add ? 0.6 : 0; draw.toValue = 1; draw.duration = 0.35
        draw.timingFunction = CAMediaTimingFunction(name: .easeOut)
        picks.add(draw, forKey: "draw"); picksHalo.add(draw, forKey: "draw")
        let fade = CABasicAnimation(keyPath: "opacity"); fade.fromValue = 1; fade.toValue = 0
        fade.beginTime = CACurrentMediaTime() + hold; fade.duration = 0.5; fade.fillMode = .forwards; fade.isRemovedOnCompletion = false
        picks.add(fade, forKey: "fade"); picksHalo.add(fade, forKey: "fade")
    }
    func clearPicks() { for l in [picks, picksHalo] { l.removeAllAnimations(); l.opacity = 0; l.path = nil } }

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
            if !reducedMotion {
                let fade = CABasicAnimation(keyPath: "opacity"); fade.fromValue = 0; fade.toValue = 1; fade.duration = 0.16
                bubble.add(fade, forKey: "appear")
            }
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
        let n = reducedMotion ? bubbleWords.count : min(bubbleWords.count, 1 + Int((now - bubbleAt) / 0.28))
        guard n != bubbleShown else { return }
        bubbleShown = n; bubbleText.string = attributed(shown: n)
    }
    private func placeBubble(in panel: NSPanel) {
        let visible = (panel.screen?.visibleFrame ?? panel.frame).offsetBy(dx: -panel.frame.minX, dy: -panel.frame.minY)
        let frame = CursorMotion.captionFrame(near: position, size: bubble.bounds.size, visible: visible)
        bubble.position = CGPoint(x: frame.midX, y: frame.midY)
        bubble.bounds.size = frame.size
        bubbleText.frame.size = CGSize(width: max(0, frame.width - 24), height: max(0, frame.height - 16))
        let below = frame.midY < position.y
        let tx = min(frame.width - 18, max(18, position.x - frame.minX))
        let ty: CGFloat = below ? frame.height - 1 : 1, dir: CGFloat = below ? 1 : -1
        let dx: CGFloat = frame.midX < position.x ? 1 : -1
        let tail = CGMutablePath()
        // Open path: filled like the bubble, outlined only on its two outer sides (like the bubble's own edge).
        tail.move(to: CGPoint(x: tx - 8, y: ty)); tail.addLine(to: CGPoint(x: tx + 11 * dx, y: ty + 11 * dir)); tail.addLine(to: CGPoint(x: tx + 8, y: ty))
        bubbleTail.path = tail
    }
    private func hideBubble() {
        guard bubble.opacity > 0 else { return }
        CATransaction.begin(); CATransaction.setAnimationDuration(reducedMotion ? 0 : 0.18); bubble.opacity = 0; CATransaction.commit()
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
        let reduce = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
        if reducedMotion != reduce { reducedMotion = reduce; updateMotion() }
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
        if state == .listening { layoutWave(heights: CursorMotion.waveBars(level: levelNow, t: reducedMotion ? 0 : now)) }
        else { let s = state == .speaking && !reducedMotion ? 1 + 0.16 * lv : 1; pulse.setAffineTransform(CGAffineTransform(scaleX: s, y: s)) }
        if bubble.opacity > 0 { revealBubble(now: now) }
        CATransaction.commit()

        if let t = tour {
            let g = t.plan.at(reducedMotion ? t.plan.duration : now - t.start)
            let next = CGPoint(x: g.point.x - panel.frame.minX, y: g.point.y - panel.frame.minY)
            // Point along the path while it flies or draws; once it stops, keep pointing at the mark.
            if hypot(next.x - position.x, next.y - position.y) > 0.5 { aim(atan2(next.y - position.y, next.x - position.x), dt: dt) }
            position = next
            // A soft tail while it flies (the last ~0.16 s of its path); gone when it slows down.
            wake.append((position, now)); wake.removeAll { now - $0.1 > 0.16 }
            let path = CGMutablePath()
            if !reducedMotion, let first = wake.first, hypot(position.x - first.0.x, position.y - first.0.y) > 12 {
                path.move(to: first.0); for (p, _) in wake.dropFirst() { path.addLine(to: p) }
            }
            CATransaction.begin(); CATransaction.setDisableActions(true)
            trail.path = path
            body.position = position; body.setAffineTransform(CGAffineTransform(scaleX: reducedMotion ? 1 : 1 + (g.scale - 1) * 0.3, y: reducedMotion ? 1 : 1 + (g.scale - 1) * 0.3))
            if bubble.opacity > 0 { placeBubble(in: panel) }
            CATransaction.commit()
            if g.done {
                if tourDone == 0 { tourDone = now }
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
        let target = CursorMotion.anchor(cursor: CGPoint(x: cursor.x - panel.frame.minX, y: cursor.y - panel.frame.minY), visible: visible, size: CGSize(width: 44, height: 44))
        position = placed && !reducedMotion ? CursorMotion.follow(current: position, target: target, dt: dt, response: 0.055) : target
        // Beside you, it points at your pointer.
        let mine = CGPoint(x: cursor.x - panel.frame.minX, y: cursor.y - panel.frame.minY)
        if hypot(mine.x - position.x, mine.y - position.y) > 4 { aim(atan2(mine.y - position.y, mine.x - position.x), dt: dt) }
        let desiredScale: CGFloat = state == .idle ? 0.78 : 1
        presenceScale += (desiredScale - presenceScale) * (reducedMotion ? 1 : CGFloat(1 - exp(-dt / 0.12)))
        placed = true
        let back = awayUntil > 0 && now >= awayUntil
        CATransaction.begin(); CATransaction.setDisableActions(true)
        body.position = position
        body.setAffineTransform(CGAffineTransform(scaleX: presenceScale, y: presenceScale))
        CATransaction.commit()
        if back { // return with a short fade, without a scale bounce
            awayUntil = 0
            CATransaction.begin(); CATransaction.setAnimationDuration(reducedMotion ? 0 : 0.18); body.opacity = 1; CATransaction.commit()
        }
    }

    /// Turn the arrow toward `angle`: smoothly, the short way round (at once with Reduce Motion).
    private func aim(_ angle: CGFloat, dt: Double) {
        heading = reducedMotion ? angle : CursorMotion.turn(current: heading, target: angle, dt: dt)
        CATransaction.begin(); CATransaction.setDisableActions(true); orb.setAffineTransform(CGAffineTransform(rotationAngle: heading)); CATransaction.commit()
    }

    /// State is readable without decorative motion; changing the macOS preference takes effect immediately.
    private func updateMotion() {
        orb.removeAllAnimations(); sweep.removeAllAnimations(); bubble.removeAllAnimations()
        guard !reducedMotion else { return }
        if state == .idle {
            let breathe = CABasicAnimation(keyPath: "opacity"); breathe.fromValue = 0.78; breathe.toValue = 1
            breathe.duration = 2.4; breathe.autoreverses = true; breathe.repeatCount = .infinity
            breathe.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
            orb.add(breathe, forKey: "breathe")
        } else if state == .thinking {
            let spin = CABasicAnimation(keyPath: "transform.rotation.z"); spin.fromValue = 0; spin.toValue = -2 * Double.pi
            spin.duration = 1.6; spin.repeatCount = .infinity
            sweep.add(spin, forKey: "spin")
        }
    }

    private func build(in root: CALayer) {
        let box = CGRect(x: 0, y: 0, width: 44, height: 44), c = CGPoint(x: 22, y: 22)
        body.bounds = box
        for l in [pulse, orb] { l.bounds = box; l.position = c }
        // The triangle, pointing right (the orb layer turns it), corners rounded: the gradient fill, a glass sheen on
        // its upper half, then the bevel — a dark outer hairline under a white inner one. It fits inside the thinking ring.
        let arrow = CGMutablePath(), corners = [CGPoint(x: 34, y: 22), CGPoint(x: 15, y: 29.8), CGPoint(x: 15, y: 14.2)]
        arrow.move(to: CGPoint(x: (corners[2].x + corners[0].x) / 2, y: (corners[2].y + corners[0].y) / 2))
        for i in 0..<3 { arrow.addArc(tangent1End: corners[i], tangent2End: corners[(i + 1) % 3], radius: i == 0 ? 2.2 : 3.2) }
        arrow.closeSubpath()
        glow.type = .radial; glow.frame = box; glow.startPoint = CGPoint(x: 0.5, y: 0.5); glow.endPoint = CGPoint(x: 1, y: 1)
        dart.path = arrow; dart.fillColor = NSColor.black.cgColor
        sphere.type = .axial; sphere.frame = box; sphere.mask = dart
        sphere.startPoint = CGPoint(x: 0.3, y: 0.75); sphere.endPoint = CGPoint(x: 0.75, y: 0.4)
        sheenMask.path = arrow; sheenMask.fillColor = NSColor.black.cgColor
        sheen.frame = box; sheen.mask = sheenMask; sheen.startPoint = CGPoint(x: 0.5, y: 0.72); sheen.endPoint = CGPoint(x: 0.5, y: 0.47)
        sheen.colors = [NSColor.white.withAlphaComponent(0.42).cgColor, NSColor.white.withAlphaComponent(0).cgColor]
        rim.path = arrow; rim.lineJoin = .round; rim.fillColor = NSColor.clear.cgColor; rim.lineWidth = 1.8
        rim.strokeColor = NSColor.black.withAlphaComponent(0.42).cgColor
        rim.shadowColor = NSColor.black.cgColor; rim.shadowOpacity = 0.3; rim.shadowRadius = 2.5; rim.shadowOffset = .zero
        spec.path = arrow; spec.lineJoin = .round; spec.fillColor = NSColor.clear.cgColor; spec.lineWidth = 0.7
        spec.strokeColor = NSColor.white.withAlphaComponent(0.55).cgColor
        orb.addSublayer(glow); orb.addSublayer(rim); orb.addSublayer(sphere); orb.addSublayer(sheen); orb.addSublayer(spec)
        pulse.addSublayer(orb)
        // Listening halo (scaled by your voice) and the thinking sweep (a conic light masked to a ring).
        listenHalo.path = CGPath(ellipseIn: CGRect(x: 10, y: 10, width: 24, height: 24), transform: nil)
        listenHalo.bounds = box; listenHalo.position = c; listenHalo.fillColor = NSColor.clear.cgColor; listenHalo.lineWidth = 2; listenHalo.opacity = 0
        listenHalo.shadowColor = NSColor.black.cgColor; listenHalo.shadowOpacity = 0.4; listenHalo.shadowRadius = 1.5; listenHalo.shadowOffset = .zero
        sweep.type = .conic; sweep.frame = box; sweep.startPoint = CGPoint(x: 0.5, y: 0.5); sweep.endPoint = CGPoint(x: 0.5, y: 1); sweep.opacity = 0
        sweepMask.path = CGPath(ellipseIn: CGRect(x: 8.5, y: 8.5, width: 27, height: 27), transform: nil)
        sweepMask.fillColor = NSColor.clear.cgColor; sweepMask.strokeColor = NSColor.black.cgColor; sweepMask.lineWidth = 2.6
        sweep.mask = sweepMask
        body.addSublayer(listenHalo); body.addSublayer(sweep); body.addSublayer(pulse)
        wave.bounds = box; wave.position = c; wave.opacity = 0
        for b in bars { b.cornerRadius = 1.75; b.borderWidth = 0.8; b.shadowOpacity = 0.55; b.shadowRadius = 3; b.shadowOffset = .zero; wave.addSublayer(b) }
        layoutWave(heights: CursorMotion.waveBars(level: 0, t: 0))
        body.addSublayer(wave)
        // The flight tail, the ink you draw, and the bubble.
        trail.fillColor = NSColor.clear.cgColor; trail.lineWidth = 3; trail.lineCap = .round; trail.lineJoin = .round
        ink.fillColor = NSColor.clear.cgColor; ink.lineWidth = 4; ink.lineCap = .round; ink.lineJoin = .round
        ink.shadowRadius = 6; ink.shadowOpacity = 0.9; ink.shadowOffset = .zero
        halo.fillColor = NSColor.clear.cgColor; halo.lineWidth = 7; halo.lineCap = .round; halo.lineJoin = .round
        halo.strokeColor = NSColor.black.withAlphaComponent(0.3).cgColor
        for (l, w) in [(picksHalo, CGFloat(6)), (picks, CGFloat(2.5))] { l.fillColor = NSColor.clear.cgColor; l.lineWidth = w; l.lineJoin = .round; l.lineCap = .round; l.opacity = 0 }
        picksHalo.strokeColor = NSColor.black.withAlphaComponent(0.28).cgColor
        picks.shadowRadius = 5; picks.shadowOpacity = 0.8; picks.shadowOffset = .zero
        root.addSublayer(halo); root.addSublayer(ink); root.addSublayer(picksHalo); root.addSublayer(picks); root.addSublayer(trail)
        bubble.backgroundColor = NSColor(calibratedRed: 0.07, green: 0.065, blue: 0.09, alpha: 0.95).cgColor
        bubble.cornerRadius = 10; bubble.borderWidth = 1; bubble.opacity = 0
        bubble.shadowColor = NSColor.black.cgColor; bubble.shadowOpacity = 0.22; bubble.shadowRadius = 12; bubble.shadowOffset = CGSize(width: 0, height: -4)
        bubbleText.isWrapped = true; bubbleText.contentsScale = NSScreen.main?.backingScaleFactor ?? 2
        bubbleTail.fillColor = bubble.backgroundColor; bubbleTail.lineWidth = 1; bubbleTail.lineJoin = .round
        bubble.addSublayer(bubbleTail); bubble.addSublayer(bubbleText)
        root.addSublayer(body)
        root.addSublayer(bubble)
        restyle()
    }

    /// Bars centred in the orb's box, 3.5 pt wide with 2.5 pt gaps, growing up and down from the middle.
    private func layoutWave(heights: [CGFloat]) {
        let w: CGFloat = 3.5, gap: CGFloat = 2.5, total = CGFloat(bars.count) * w + CGFloat(bars.count - 1) * gap
        for (i, b) in bars.enumerated() {
            let h = i < heights.count ? heights[i] : 4
            b.frame = CGRect(x: 22 - total / 2 + CGFloat(i) * (w + gap), y: 22 - h / 2, width: w, height: h)
        }
    }

    private func restyle() {
        let c = color.usingColorSpace(.sRGB) ?? color
        let light = c.brightnessComponent > 0.85 && c.saturationComponent < 0.2
        // A white ("mono") accent becomes a pearl: white to cool grey, with a cool glow so it still reads on white.
        let hi = light ? NSColor.white : c.blended(withFraction: 0.55, of: .white) ?? c
        let lo = light ? NSColor(calibratedRed: 0.62, green: 0.66, blue: 0.76, alpha: 1) : c.blended(withFraction: 0.45, of: .black) ?? c
        let ends = gradient.map { ($0.0.usingColorSpace(.sRGB) ?? $0.0, $0.1.usingColorSpace(.sRGB) ?? $0.1) } ?? (hi, lo)
        sphere.colors = [ends.0.cgColor, ends.1.cgColor]; sphere.locations = [0, 1]
        let aura = light ? NSColor(calibratedRed: 0.6, green: 0.68, blue: 0.9, alpha: 1) : ends.1.blended(withFraction: 0.5, of: ends.0) ?? c
        glow.colors = [aura.withAlphaComponent(0.32).cgColor, aura.withAlphaComponent(0).cgColor]
        let ringColor = light ? NSColor(calibratedWhite: 0.55, alpha: 1) : c.withAlphaComponent(0.95) // a white ring would vanish on white
        listenHalo.strokeColor = ringColor.cgColor
        // Waveform bars: the accent (pearl for mono) with a thin dark edge and glow, so they read on white and on black.
        for b in bars { b.backgroundColor = (light ? NSColor.white : hi).cgColor; b.borderColor = NSColor.black.withAlphaComponent(0.45).cgColor; b.shadowColor = aura.cgColor }
        // The thinking sweep runs through the same gradient as the cursor (pearl and silver keep the grey ring).
        let sweepEnds = gradient == nil || light ? (ringColor, ringColor) : (ends.1, ends.0)
        sweep.colors = [sweepEnds.0.withAlphaComponent(0).cgColor, sweepEnds.0.withAlphaComponent(0.35).cgColor, sweepEnds.1.cgColor]
        trail.strokeColor = aura.withAlphaComponent(0.35).cgColor
        ink.strokeColor = color.withAlphaComponent(0.9).cgColor; ink.shadowColor = (light ? aura : color).cgColor
        picks.strokeColor = (light ? NSColor.white : color).cgColor; picks.shadowColor = (light ? aura : color).cgColor
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
            if state == .idle { ctx.translateBy(x: 22, y: 22); ctx.scaleBy(x: 0.78, y: 0.78); ctx.translateBy(x: -22, y: -22) }
            if state == .listening { wave.render(in: ctx) }
            if state == .thinking { sweep.render(in: ctx) }
            if state == .speaking { listenHalo.render(in: ctx) }
            if state != .listening { orb.render(in: ctx) }
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

private extension CGMutablePath {
    func appending(_ other: CGPath) -> CGMutablePath { addPath(other); return self }
}
