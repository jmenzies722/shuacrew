import Foundation

/// Which running app you mean when you say "quit Maps" or "close VS Code" — and the ones Spark never quits.
/// Pure, so the rules are tested rather than hoped for.
public enum AppMatch {
    /// What people call apps, mapped to their real names.
    public static let aliases = ["vs code": "Visual Studio Code", "vscode": "Visual Studio Code", "code": "Visual Studio Code", "chrome": "Google Chrome",
                                 "settings": "System Settings", "system preferences": "System Settings", "iterm": "iTerm2", "maps": "Maps", "music": "Music"]
    /// Never quit by voice: ShuaCrew itself and the parts of macOS that keep the desktop running.
    public static let protected: Set<String> = ["dev.shuacrew.mac", "com.apple.finder", "com.apple.dock", "com.apple.loginwindow", "com.apple.systemuiserver",
                                                "com.apple.controlcenter", "com.apple.WindowManager", "com.apple.notificationcenterui", "com.apple.Spotlight"]

    /// The running app a spoken name means (exact name, then a prefix, then the shortest name containing it), or nil.
    /// `running` is (name, bundle id) of regular apps. The word "the" and a trailing "app"/".app" are ignored.
    public static func pick(_ query: String, running: [(name: String, bundle: String)]) -> Int? {
        var q = query.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        for junk in ["the ", "my "] where q.hasPrefix(junk) { q = String(q.dropFirst(junk.count)) }
        for junk in [" application", " app", ".app"] where q.hasSuffix(junk) { q = String(q.dropLast(junk.count)) }
        q = (aliases[q] ?? q).lowercased()
        guard !q.isEmpty else { return nil }
        let names = running.map { $0.name.lowercased() }
        if let i = names.firstIndex(of: q) { return i }
        if let i = names.firstIndex(where: { $0.hasPrefix(q) }) { return i }
        return names.indices.filter { names[$0].contains(q) }.min { names[$0].count < names[$1].count }
    }

    public static func isProtected(_ bundle: String) -> Bool { protected.contains(bundle) || bundle.hasPrefix("dev.shuacrew.") }
}
