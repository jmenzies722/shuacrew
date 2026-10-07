import CoreImage.CIFilterBuiltins
import SwiftUI

/// The room everything sits in: black, with a slow living mesh of your accent drifting through it — brighter while
/// Shua talks, amber when something needs you, green when something lands, deep indigo when it sleeps — a fine film
/// grain so it reads as light, not a flat fill, and a vignette. It leans a touch against the phone's tilt.
struct NoirBackdrop: View {
    let mood: SparkMood
    var accent: Color = .shuaPurple
    var tilt: CGVector = .zero
    /// Where the light gathers (Shua's position on screen).
    var focus: UnitPoint = UnitPoint(x: 0.5, y: 0.28)
    var reach: CGFloat = 380
    @Environment(\.accessibilityReduceMotion) private var still

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 24, paused: still)) { ctx in
            let t = still ? 0 : ctx.date.timeIntervalSinceReferenceDate
            ZStack {
                Color.black
                MeshGradient(width: 3, height: 3, points: points(at: t), colors: [
                    .black, key.opacity(glow * 0.35), .black,
                    second.opacity(glow * 0.28), key.opacity(glow), .black,
                    .black, second.opacity(glow * 0.22), .black,
                ], smoothsColors: true)
                LinearGradient(colors: [.white.opacity(0.06), .clear], startPoint: .top, endPoint: UnitPoint(x: 0.5, y: 0.3))
                RadialGradient(colors: [.clear, .black.opacity(0.7)], center: .center, startRadius: 240, endRadius: 820)
                Grain()
            }
        }
        .animation(.smooth(duration: 1.2), value: mood)
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }

    /// The mesh's points: the corners pinned, the edges and the centre drifting slowly, the centre on Shua.
    private func points(at t: Double) -> [SIMD2<Float>] {
        func drift(_ speed: Double, _ amount: Float = 0.06) -> Float { Float(sin(t * speed)) * amount }
        let fx = Float(focus.x - tilt.dx * 0.04), fy = Float(focus.y - tilt.dy * 0.03)
        return [
            [0, 0], [0.5 + drift(0.21), 0], [1, 0],
            [0, 0.45 + drift(0.17)], [fx + drift(0.13, 0.08), fy + drift(0.11, 0.06)], [1, 0.5 + drift(0.19)],
            [0, 1], [0.5 + drift(0.15), 1], [1, 1],
        ]
    }

    private var key: Color {
        switch mood {
        case .concerned: .orange
        case .happy: .green
        case .sleepy: .indigo
        default: accent
        }
    }
    /// A cooler partner colour, so the light has depth instead of one flat hue.
    private var second: Color { mood == .concerned ? .red : mood == .sleepy ? .blue : .indigo }
    private var glow: Double {
        switch mood {
        case .speaking: 0.62
        case .thinking: 0.5
        case .sleepy: 0.22
        default: 0.4
        }
    }
}

/// Kept for older call sites: the backdrop.
typealias ShuaStage = NoirBackdrop

/// A fine film grain over the light: made once, tiled, barely there.
struct Grain: View {
    @MainActor private static let tile: Image? = {
        guard let noise = CIFilter.randomGenerator().outputImage?.cropped(to: CGRect(x: 0, y: 0, width: 192, height: 192)) else { return nil }
        let mono = CIFilter.colorControls(); mono.inputImage = noise; mono.saturation = 0
        guard let out = mono.outputImage, let cg = CIContext().createCGImage(out, from: out.extent) else { return nil }
        return Image(decorative: cg, scale: 2)
    }()
    var body: some View {
        if let tile = Self.tile {
            Rectangle().fill(.image(tile)).opacity(0.05).blendMode(.overlay).allowsHitTesting(false)
        }
    }
}

/// Where Shua stands: a soft lit floor and a contact shadow, so it's in a place, not pasted on.
struct ShuaFloor: View {
    var accent: Color = .shuaPurple
    var body: some View {
        ZStack {
            Ellipse().fill(RadialGradient(colors: [accent.opacity(0.32), .clear], center: .center, startRadius: 0, endRadius: 140)).frame(width: 280, height: 70)
            Ellipse().fill(.black.opacity(0.7)).frame(width: 150, height: 22).blur(radius: 10)
        }
        .allowsHitTesting(false)
    }
}

/// A breathing ring for the talk orb while Shua listens or speaks.
struct ShuaAura: View {
    let active: Bool
    var accent: Color = .shuaPurple
    @State private var pulse = false
    var body: some View {
        ZStack {
            Circle().strokeBorder(accent.opacity(active ? 0.55 : 0), lineWidth: 2).scaleEffect(pulse && active ? 1.5 : 1).opacity(pulse && active ? 0 : 1)
            Circle().strokeBorder(accent.opacity(active ? 0.35 : 0), lineWidth: 1.5).scaleEffect(pulse && active ? 1.9 : 1.1).opacity(pulse && active ? 0 : 1)
        }
        .animation(active ? .easeOut(duration: 1.4).repeatForever(autoreverses: false) : .smooth, value: pulse)
        .onAppear { pulse = true }
        .allowsHitTesting(false)
    }
}

/// The house surface: Liquid Glass with a lit top edge, so cards catch the light like real glass.
struct LitGlass: ViewModifier {
    var radius: CGFloat = 28
    var tint: Color? = nil
    func body(content: Content) -> some View {
        content
            .glassEffect(tint.map { .regular.tint($0.opacity(0.18)) } ?? .regular, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous)
                .strokeBorder(LinearGradient(colors: [.white.opacity(0.22), .white.opacity(0.04), .white.opacity(0.02)], startPoint: .top, endPoint: .bottom), lineWidth: 1)
                .allowsHitTesting(false))
    }
}

extension View {
    func litGlass(_ radius: CGFloat = 28, tint: Color? = nil) -> some View { modifier(LitGlass(radius: radius, tint: tint)) }
    /// Rows and cards ease in as they scroll into view and settle back as they leave: the list feels alive.
    func scrollSettle() -> some View {
        scrollTransition(.interactive, axis: .vertical) { content, phase in
            content.opacity(phase.isIdentity ? 1 : 0.55).scaleEffect(phase.isIdentity ? 1 : 0.96).blur(radius: phase.isIdentity ? 0 : 1.5)
        }
    }
}

/// A soft fade at a screen's edge, so what scrolls under the status bar or the floating controls dissolves into the
/// dark instead of colliding with them.
struct EdgeFade: View {
    var edge: VerticalEdge = .top
    var height: CGFloat = 110
    var body: some View {
        LinearGradient(colors: [.black.opacity(0.92), .black.opacity(0.6), .clear], startPoint: edge == .top ? .top : .bottom, endPoint: edge == .top ? .bottom : .top)
            .frame(height: height)
            .frame(maxHeight: .infinity, alignment: edge == .top ? .top : .bottom)
            .ignoresSafeArea()
            .allowsHitTesting(false)
    }
}

/// A large page title with a quiet line under it, the way Apple's own apps open.
struct PageTitle: View {
    let title: String
    var subtitle: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let subtitle { Text(subtitle).noirLabel(Noir.soft) }
            Text(title).font(Noir.display(40)).tracking(-0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 24).padding(.top, 12)
    }
}

/// Your font (Settings → Font): SF Pro unless you pick another. Every Noir style reads it, so changing it restyles
/// the whole app at once.
enum ShuaFont: String, CaseIterable, Identifiable {
    case sf, rounded, serif, mono
    var id: String { rawValue }
    var name: String {
        switch self { case .sf: "SF Pro"; case .rounded: "SF Rounded"; case .serif: "New York"; case .mono: "SF Mono" }
    }
    var design: Font.Design {
        switch self { case .sf: .default; case .rounded: .rounded; case .serif: .serif; case .mono: .monospaced }
    }
}

@MainActor @Observable final class ShuaType {
    static let shared = ShuaType()
    var font: ShuaFont { didSet { UserDefaults.standard.set(font.rawValue, forKey: "shua.font") } }
    private init() { font = ShuaFont(rawValue: UserDefaults.standard.string(forKey: "shua.font") ?? "") ?? .sf }
}

/// The type scale, in your font: large tight headlines, an easy reading size for what Shua says, small tracked labels.
@MainActor enum Noir {
    private static var design: Font.Design { ShuaType.shared.font.design }
    static func display(_ size: CGFloat = 34) -> Font { .system(size: size, weight: .bold, design: design) }
    static func voice(_ size: CGFloat = 23) -> Font { .system(size: size, weight: .medium, design: design) }
    static var lead: Font { .system(size: 17, weight: .regular, design: design) }
    static var body: Font { .system(size: 16, weight: .regular, design: design) }
    static var title: Font { .system(size: 17, weight: .semibold, design: design) }
    static var label: Font { .system(size: 12, weight: .semibold, design: design) }
    static let soft = Color.white.opacity(0.62)
    static let faint = Color.white.opacity(0.38)
}

extension View {
    /// A small tracked label: NEEDS YOUR OK, WORKING NOW…
    func noirLabel(_ color: Color = Noir.faint) -> some View { font(Noir.label).tracking(1.4).textCase(.uppercase).foregroundStyle(color) }
}

/// Words a person would use: what a command is for, why it's asking, and hello by the time of day.
enum Plainly {
    private static let phrases: [(String, String)] = [
        (#"^git\s+push\b"#, "push to GitHub"), (#"^(rm|rmdir)\b"#, "delete files"), (#"^git\s+commit\b"#, "save the changes in git"),
        (#"^git\s+(checkout|switch|merge|rebase|reset)\b"#, "change git branches"),
        (#"^(npm|pnpm|yarn|bun)\s+(install|i|add)\b|^(pip3?|uv)\s+(install|add)\b|^brew\s+install\b"#, "install packages"),
        (#"^mv\b"#, "move files"), (#"^cp\b"#, "copy files"), (#"^(curl|wget)\b"#, "fetch something from the web"),
        (#"^osascript\b"#, "control an app on your Mac"), (#"^open\b"#, "open something on your Mac"),
        (#"^(npm|pnpm|yarn|bun)\s+(run\s+)?test\b|^(vitest|jest|pytest)\b|^(swift|cargo|go)\s+test\b"#, "run the tests"),
        (#"^(npm|pnpm|yarn|bun)\s+(run\s+)?build\b|^(tsc|xcodebuild)\b|^(swift|cargo|go)\s+build\b|^make\b"#, "build the project"),
        (#"^(mkdir|touch)\b"#, "create files"), (#"^git\s+(status|diff|log|show|blame|branch)\b"#, "check the code changes"),
        (#"^(rg|grep|ag|fd|find|ls|tree|cat|head|tail|wc|pwd|sed\s+-n|awk|stat|file|du|cd)\b"#, "look through the project's files"),
    ]

    /// The command inside a `/bin/zsh -lc "…"` wrapper (Codex runs everything that way).
    static func unwrap(_ command: String) -> String {
        let pattern = #"^\s*(?:/usr)?(?:/bin/)?(?:zsh|bash|sh)\s+-l?c\s+(['"])([\s\S]*)\1\s*$"#
        guard let re = try? NSRegularExpression(pattern: pattern), let m = re.firstMatch(in: command, range: NSRange(command.startIndex..., in: command)),
              let r = Range(m.range(at: 2), in: command) else { return command }
        return String(command[r])
    }

    /// "look through the project's files", "run the tests", "push to GitHub"… The weightiest part of a chain wins.
    static func command(_ raw: String) -> String {
        let parts = unwrap(raw).components(separatedBy: CharacterSet(charactersIn: ";|&\n")).map { $0.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: #"^\\|^(/usr)?(/local)?/s?bin/"#, with: "", options: .regularExpression) }.filter { !$0.isEmpty }
        for (pattern, words) in phrases where parts.contains(where: { $0.range(of: pattern, options: .regularExpression) != nil }) { return words }
        return "run a command"
    }

    /// What an approval wants, in words, for any tool.
    static func asking(tool: String, command: String?, path: String?) -> String {
        if let command { return command.isEmpty ? "run a command" : Self.command(command) }
        if let path { return (["Edit", "Write", "MultiEdit", "apply_patch", "fileChange"].contains(tool) ? "change " : "open ") + (path as NSString).lastPathComponent }
        return "use " + tool.replacingOccurrences(of: "mcp__", with: "").replacingOccurrences(of: "__", with: " · ")
    }

    static func why(rule: String?, reason: String) -> String {
        switch rule {
        case "default.ask": "It hasn't asked to do this before."
        case "ask.outward": "It reaches beyond this Mac or is hard to undo."
        default: reason.isEmpty ? "" : reason.prefix(1).uppercased() + reason.dropFirst() + (reason.hasSuffix(".") ? "" : ".")
        }
    }

    /// Hello, by the time of day.
    static func hello(_ name: String? = nil, at date: Date = .now) -> String {
        let h = Calendar.current.component(.hour, from: date)
        let part = h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : h < 22 ? "Good evening" : "Up late"
        return name.map { "\(part), \($0)." } ?? "\(part)."
    }

    /// "just now", "4 min", "1 h 20 min".
    static func since(_ seconds: Double) -> String {
        let m = Int(seconds / 60)
        return m < 1 ? "just now" : m < 60 ? "\(m) min" : "\(m / 60) h \(m % 60) min"
    }
}
