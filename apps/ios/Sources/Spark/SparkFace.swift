import SwiftUI
import CoreMotion

enum SparkMood: Equatable { case idle, thinking, speaking, happy, concerned, sleepy }

/// Tilt, read gently: where Spark looks when nothing else draws its eye.
@MainActor @Observable final class SparkTilt {
    private(set) var gaze = CGVector.zero
    private let motion = CMMotionManager()
    func start() {
        guard motion.isDeviceMotionAvailable, !motion.isDeviceMotionActive else { return }
        motion.deviceMotionUpdateInterval = 1 / 30
        motion.startDeviceMotionUpdates(to: .main) { [weak self] data, _ in
            guard let g = data?.gravity else { return }
            // Upright phone: gravity.y ≈ -1. Lean it and Spark's eyes follow, a little.
            let target = CGVector(dx: max(-1, min(1, g.x * 2.2)), dy: max(-1, min(1, (g.y + 0.75) * 2)))
            guard let self else { return }
            self.gaze = CGVector(dx: self.gaze.dx * 0.8 + target.dx * 0.2, dy: self.gaze.dy * 0.8 + target.dy * 0.2)
        }
    }
    func stop() { motion.stopDeviceMotionUpdates() }
}

/// Spark, drawn natively from the same geometry as the Mac's robot (a 100×110 sketch): ceramic shell, dark glass
/// visor, glowing eyes. It blinks, glances around, follows your tilt, breathes, and its face says what it's doing.
struct SparkFace: View {
    var mood: SparkMood
    var tilt: CGVector = .zero
    var level: Double = 0          // voice loudness 0…1 while speaking: the mouth opens with it
    var shell = Color(red: 0.96, green: 0.71, blue: 0.27)
    var eyes = Color(red: 0.65, green: 0.95, blue: 0.99)

    @State private var bounce = 0.0

    var body: some View {
        TimelineView(.animation) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            Canvas { ctx, size in draw(&ctx, size: size, t: t) }
        }
        .aspectRatio(100 / 110, contentMode: .fit)
        .scaleEffect(1 + bounce * 0.06)
        .onTapGesture {
            UIImpactFeedbackGenerator(style: .soft).impactOccurred()
            withAnimation(.spring(response: 0.25, dampingFraction: 0.35)) { bounce = 1 }
            withAnimation(.spring(response: 0.5, dampingFraction: 0.6).delay(0.18)) { bounce = 0 }
        }
        .accessibilityElement()
        .accessibilityLabel("Spark")
        .accessibilityValue(String(describing: mood))
    }

    private func draw(_ ctx: inout GraphicsContext, size: CGSize, t: Double) {
        let k = min(size.width / 100, size.height / 110)
        ctx.translateBy(x: (size.width - 100 * k) / 2, y: (size.height - 110 * k) / 2)
        ctx.scaleBy(x: k, y: k)
        let breathe = sin(t * (mood == .sleepy ? 1.1 : 1.9)) * (mood == .sleepy ? 1.6 : 1.0)
        let happyHop = mood == .happy ? abs(sin(t * 6)) * -2.5 : 0
        let deep = shell.mix(.black, 0.35), light = shell.mix(.white, 0.45)
        let trim = Color(red: 0.17, green: 0.2, blue: 0.25)

        // Shadow on the floor: breathes opposite to the body.
        ctx.fill(Path(ellipseIn: CGRect(x: 30 + breathe * 0.3, y: 101, width: 40 - breathe * 0.6, height: 6)), with: .color(.black.opacity(0.28)))
        ctx.translateBy(x: 0, y: breathe + happyHop)

        // Boots, legs, body (an egg), arms.
        for x in [43.5, 56.5] {
            ctx.fill(Path(roundedRect: CGRect(x: x - 3.5, y: 86, width: 7, height: 9), cornerRadius: 3), with: .color(trim))
            ctx.fill(Path(roundedRect: CGRect(x: x - 8, y: 93, width: 16, height: 9), cornerRadius: 4.5), with: .linearGradient(Gradient(colors: [light, shell, deep]), startPoint: CGPoint(x: x, y: 93), endPoint: CGPoint(x: x, y: 102)))
        }
        var egg = Path()
        egg.move(to: CGPoint(x: 35, y: 67)); egg.addQuadCurve(to: CGPoint(x: 50, y: 60), control: CGPoint(x: 35, y: 60))
        egg.addQuadCurve(to: CGPoint(x: 65, y: 67), control: CGPoint(x: 65, y: 60)); egg.addLine(to: CGPoint(x: 64, y: 79))
        egg.addQuadCurve(to: CGPoint(x: 50, y: 92), control: CGPoint(x: 62, y: 92)); egg.addQuadCurve(to: CGPoint(x: 36, y: 79), control: CGPoint(x: 38, y: 92))
        egg.closeSubpath()
        ctx.fill(egg, with: .radialGradient(Gradient(colors: [light, shell, deep]), center: CGPoint(x: 44, y: 66), startRadius: 0, endRadius: 34))
        ctx.fill(Path(ellipseIn: CGRect(x: 47, y: 72, width: 6, height: 6)), with: .color(eyes.opacity(0.9)))   // the glowing button
        let wave = mood == .happy ? sin(t * 10) * 14 : mood == .speaking ? sin(t * 3) * 4 : 0
        for s in [-1.0, 1.0] {
            var arm = ctx
            arm.translateBy(x: 50 + s * 21, y: 75)
            arm.rotate(by: .degrees(-s * 22 + (s > 0 ? -wave : 0)))
            arm.fill(Path(ellipseIn: CGRect(x: -5.2, y: -7.4, width: 10.4, height: 14.8)), with: .linearGradient(Gradient(colors: [light, shell]), startPoint: CGPoint(x: 0, y: -7), endPoint: CGPoint(x: 0, y: 7)))
            ctx.fill(Path(ellipseIn: CGRect(x: 50 + s * 16 - 4.6, y: 67.5 - 4.6, width: 9.2, height: 9.2)), with: .color(trim))
        }
        ctx.fill(Path(roundedRect: CGRect(x: 44, y: 58, width: 12, height: 6), cornerRadius: 2), with: .color(trim))   // neck

        // Head: a lit shell with a rim light, then the dark glass visor.
        let head = CGRect(x: 15, y: 9, width: 70, height: 52)
        var tiltHead = ctx
        tiltHead.translateBy(x: 50, y: 35)
        tiltHead.rotate(by: .degrees(tilt.dx * 4 + (mood == .thinking ? sin(t * 1.3) * 3 : 0)))
        tiltHead.translateBy(x: -50, y: -35)
        tiltHead.fill(Path(roundedRect: head, cornerRadius: 25), with: .radialGradient(Gradient(colors: [light, shell, deep]), center: CGPoint(x: 38, y: 18), startRadius: 0, endRadius: 70))
        tiltHead.stroke(Path(roundedRect: head.insetBy(dx: 0.6, dy: 0.6), cornerRadius: 24.5), with: .linearGradient(Gradient(colors: [.white.opacity(0.7), .clear]), startPoint: CGPoint(x: 50, y: 9), endPoint: CGPoint(x: 50, y: 30)), lineWidth: 1.2)
        tiltHead.fill(Path(ellipseIn: CGRect(x: 26, y: 12, width: 26, height: 7)), with: .color(.white.opacity(0.28)))   // shine
        let visor = CGRect(x: 22, y: 18, width: 56, height: 35)
        tiltHead.fill(Path(roundedRect: visor.insetBy(dx: -1.4, dy: -1.4), cornerRadius: 17.4), with: .color(trim))
        tiltHead.fill(Path(roundedRect: visor, cornerRadius: 16), with: .linearGradient(Gradient(colors: [Color(red: 0.15, green: 0.19, blue: 0.25), Color(red: 0.02, green: 0.03, blue: 0.04)]), startPoint: CGPoint(x: 30, y: 18), endPoint: CGPoint(x: 55, y: 53)))
        tiltHead.fill(Path(roundedRect: visor, cornerRadius: 16), with: .radialGradient(Gradient(colors: [eyes.opacity(0.22), .clear]), center: CGPoint(x: 50, y: 34), startRadius: 0, endRadius: 30))

        // Eyes: blink on a natural rhythm (sometimes twice), glance around, follow your tilt.
        let cycle = t.truncatingRemainder(dividingBy: 4.6)
        var open = 1.0
        if cycle < 0.16 { open = abs(cycle - 0.08) / 0.08 }
        if Int(t / 4.6) % 3 == 0, cycle > 0.3, cycle < 0.46 { open = min(open, abs(cycle - 0.38) / 0.08) }
        if mood == .sleepy { open = min(open, 0.18 + 0.08 * sin(t * 1.1)) }
        let glanceSeed = floor(t / 2.7)
        let glance = CGVector(dx: sin(glanceSeed * 12.9898) * 2.2, dy: cos(glanceSeed * 78.233) * 1.2)
        let look = mood == .thinking ? CGVector(dx: 3, dy: -3) : CGVector(dx: glance.dx + tilt.dx * 3.5, dy: glance.dy + tilt.dy * 2.5)
        var glow = tiltHead
        glow.addFilter(.shadow(color: eyes.opacity(0.9), radius: 2.6))
        for s in [-1.0, 1.0] {
            let cx = 50 + s * 12 + look.dx, cy = 34.5 + look.dy
            switch mood {
            case .happy:
                var arc = Path(); arc.addArc(center: CGPoint(x: cx, y: cy + 1.5), radius: 4.2, startAngle: .degrees(200), endAngle: .degrees(340), clockwise: false)
                glow.stroke(arc, with: .color(eyes), style: StrokeStyle(lineWidth: 2.4, lineCap: .round))
            case .concerned:
                glow.fill(Path(ellipseIn: CGRect(x: cx - 3.4, y: cy - 3 * open, width: 6.8, height: 6 * open)), with: .color(Color(red: 1, green: 0.75, blue: 0.3)))
                // Worried, not cross: the inner ends of the brows lift.
                var brow = Path(); brow.move(to: CGPoint(x: cx - 4, y: cy - 6.5 - s * 1.3)); brow.addLine(to: CGPoint(x: cx + 4, y: cy - 6.5 + s * 1.3))
                glow.stroke(brow, with: .color(eyes.opacity(0.8)), style: StrokeStyle(lineWidth: 1.4, lineCap: .round))
            default:
                let h = max(0.8, 10 * open)
                glow.fill(Path(roundedRect: CGRect(x: cx - 4, y: cy - h / 2, width: 8, height: h), cornerRadius: 4), with: .color(eyes))
                if open > 0.6 { glow.fill(Path(ellipseIn: CGRect(x: cx + 0.6, y: cy - 3.4, width: 2.2, height: 2.2)), with: .color(.white.opacity(0.85))) }
            }
        }
        // Mouth: a smile at rest, a line while thinking, open with the voice while speaking.
        let my = 45.5
        switch mood {
        case .speaking:
            let o = 1.2 + max(level, abs(sin(t * 11)) * 0.6) * 4.2
            glow.fill(Path(ellipseIn: CGRect(x: 46, y: my - o / 2, width: 8, height: o)), with: .color(eyes))
        case .thinking, .sleepy:
            var line = Path(); line.move(to: CGPoint(x: 46.5, y: my)); line.addLine(to: CGPoint(x: 53.5, y: my))
            glow.stroke(line, with: .color(eyes.opacity(0.8)), style: StrokeStyle(lineWidth: 1.6, lineCap: .round))
        case .concerned:
            var frown = Path(); frown.move(to: CGPoint(x: 45.5, y: my + 1.5)); frown.addQuadCurve(to: CGPoint(x: 54.5, y: my + 1.5), control: CGPoint(x: 50, y: my - 0.2))
            glow.stroke(frown, with: .color(eyes.opacity(0.8)), style: StrokeStyle(lineWidth: 1.6, lineCap: .round))
        default:
            var smile = Path(); smile.move(to: CGPoint(x: 44.5, y: my - 1.5)); smile.addQuadCurve(to: CGPoint(x: 55.5, y: my - 1.5), control: CGPoint(x: 50, y: my + (mood == .happy ? 5 : 3)))
            glow.stroke(smile, with: .color(eyes), style: StrokeStyle(lineWidth: 1.8, lineCap: .round))
        }
        // Thinking: three dots drift up beside the head.
        if mood == .thinking {
            for i in 0..<3 {
                let p = (t * 0.9 + Double(i) / 3).truncatingRemainder(dividingBy: 1)
                ctx.fill(Path(ellipseIn: CGRect(x: 84 + Double(i) * 3, y: 18 - p * 14, width: 3, height: 3)), with: .color(eyes.opacity(1 - p)))
            }
        }
        if mood == .sleepy {
            let p = (t * 0.4).truncatingRemainder(dividingBy: 1)
            ctx.draw(Text("z").font(.system(size: 8 + p * 5, weight: .bold, design: .rounded)).foregroundStyle(eyes.opacity(1 - p)), at: CGPoint(x: 84 + p * 6, y: 14 - p * 12))
        }
    }
}

private extension Color {
    func mix(_ other: Color, _ amount: Double) -> Color {
        let a = UIColor(self), b = UIColor(other)
        var (r1, g1, b1, a1, r2, g2, b2, a2) = (CGFloat(0), CGFloat(0), CGFloat(0), CGFloat(0), CGFloat(0), CGFloat(0), CGFloat(0), CGFloat(0))
        a.getRed(&r1, green: &g1, blue: &b1, alpha: &a1); b.getRed(&r2, green: &g2, blue: &b2, alpha: &a2)
        let k = CGFloat(amount)
        return Color(red: r1 + (r2 - r1) * k, green: g1 + (g2 - g1) * k, blue: b1 + (b2 - b1) * k, opacity: a1 + (a2 - a1) * k)
    }
}
