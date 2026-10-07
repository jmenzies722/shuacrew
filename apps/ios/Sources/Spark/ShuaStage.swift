import SwiftUI

/// The light Shua lives in: a slow, living mesh gradient in your accent, warmer while Shua talks, amber when
/// something needs you, green when something lands, deep and quiet when it sleeps. Never distracting: it drifts.
struct ShuaStage: View {
    let mood: SparkMood
    var accent: Color = .shuaPurple
    @Environment(\.accessibilityReduceMotion) private var still

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30, paused: still)) { ctx in
            let t = still ? 0 : ctx.date.timeIntervalSinceReferenceDate
            MeshGradient(width: 3, height: 3, points: points(t), colors: colors, smoothsColors: true)
        }
        .overlay(LinearGradient(colors: [.clear, .black.opacity(0.55), .black], startPoint: .center, endPoint: .bottom))
        .animation(.smooth(duration: 1.4), value: mood)
        .ignoresSafeArea()
    }

    /// The middle points wander a little; the edges stay put, so the light moves without the frame moving.
    private func points(_ t: Double) -> [SIMD2<Float>] {
        let w = { (speed: Double, phase: Double, amount: Float) in Float(sin(t * speed + phase)) * amount }
        return [
            [0, 0], [0.5 + w(0.21, 0, 0.12), 0], [1, 0],
            [0, 0.5 + w(0.17, 1, 0.1)], [0.5 + w(0.13, 2, 0.16), 0.45 + w(0.19, 3, 0.12)], [1, 0.5 + w(0.15, 4, 0.1)],
            [0, 1], [0.5 + w(0.11, 5, 0.12), 1], [1, 1],
        ]
    }

    private var colors: [Color] {
        let key: Color = switch mood {
        case .concerned: .orange
        case .happy: .green
        case .sleepy: .indigo
        default: accent
        }
        let lit = mood == .speaking ? 0.85 : mood == .thinking ? 0.7 : mood == .sleepy ? 0.35 : 0.55
        return [
            key.opacity(lit), Color(red: 0.08, green: 0.07, blue: 0.16), key.mix(with: .purple, by: 0.4).opacity(lit * 0.9),
            Color(red: 0.05, green: 0.05, blue: 0.1), key.opacity(lit * 0.45), Color(red: 0.06, green: 0.04, blue: 0.12),
            .black, .black, .black,
        ]
    }
}

/// A soft ring behind Shua that breathes while it talks or listens: you can see it's alive before it says a word.
struct ShuaAura: View {
    let active: Bool
    var accent: Color = .shuaPurple
    @State private var pulse = false
    var body: some View {
        ZStack {
            Circle().fill(RadialGradient(colors: [accent.opacity(active ? 0.45 : 0.18), .clear], center: .center, startRadius: 10, endRadius: 170))
                .scaleEffect(pulse && active ? 1.12 : 1)
            Circle().strokeBorder(accent.opacity(active ? 0.5 : 0.12), lineWidth: 1.5)
                .scaleEffect(pulse && active ? 1.18 : 0.98)
                .opacity(pulse && active ? 0 : 1)
        }
        .animation(active ? .easeInOut(duration: 1.1).repeatForever(autoreverses: false) : .smooth, value: pulse)
        .onAppear { pulse = true }
        .allowsHitTesting(false)
    }
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
