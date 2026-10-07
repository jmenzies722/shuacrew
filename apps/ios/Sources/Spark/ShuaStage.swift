import SwiftUI

/// Noir: black, lit like a stage. A key light in your accent behind Shua (brighter while it talks, amber when something
/// needs you, green when something lands, dim when it sleeps), a faint rim of light from above, and a vignette. The
/// layers drift a touch against the phone's tilt, so the screen has depth: never a flat fill.
struct NoirBackdrop: View {
    let mood: SparkMood
    var accent: Color = .shuaPurple
    var tilt: CGVector = .zero
    /// Where the key light sits (Shua's position on screen).
    var focus: UnitPoint = UnitPoint(x: 0.5, y: 0.28)
    var reach: CGFloat = 380
    @Environment(\.accessibilityReduceMotion) private var still

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 20, paused: still)) { ctx in
            let breath = still ? 1 : 1 + 0.04 * sin(ctx.date.timeIntervalSinceReferenceDate * 0.8)
            let at = UnitPoint(x: focus.x - tilt.dx * 0.04, y: focus.y - tilt.dy * 0.03)
            ZStack {
                Color.black
                RadialGradient(colors: [key.opacity(intensity), key.opacity(intensity * 0.28), .clear], center: at, startRadius: 0, endRadius: reach * breath)
                RadialGradient(colors: [key.opacity(intensity * 0.35), .clear], center: UnitPoint(x: at.x, y: at.y + 0.3), startRadius: 0, endRadius: reach * 0.7)
                LinearGradient(colors: [.white.opacity(0.07), .clear], startPoint: .top, endPoint: UnitPoint(x: 0.5, y: 0.35))
                RadialGradient(colors: [.clear, .black.opacity(0.75)], center: .center, startRadius: 220, endRadius: 760)
            }
        }
        .animation(.smooth(duration: 1.2), value: mood)
        .ignoresSafeArea()
    }

    private var key: Color {
        switch mood {
        case .concerned: .orange
        case .happy: .green
        case .sleepy: .indigo
        default: accent
        }
    }
    private var intensity: Double {
        switch mood {
        case .speaking: 0.34
        case .thinking: 0.27
        case .sleepy: 0.12
        default: 0.2
        }
    }
}

/// Kept for older call sites: the Noir backdrop.
typealias ShuaStage = NoirBackdrop

/// Where Shua stands: a soft lit floor and a contact shadow, so it's in a place, not pasted on.
struct ShuaFloor: View {
    var accent: Color = .shuaPurple
    var body: some View {
        ZStack {
            Ellipse().fill(RadialGradient(colors: [accent.opacity(0.28), .clear], center: .center, startRadius: 0, endRadius: 140)).frame(width: 280, height: 70)
            Ellipse().fill(.black.opacity(0.65)).frame(width: 150, height: 22).blur(radius: 10)
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
