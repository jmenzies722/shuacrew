import Foundation

/// Which files Spark may look at: inside your home folder, never your sealed work folders, secrets or other apps'
/// private data. `..` and `~` are resolved first, so nothing can walk around the rules.
public enum MacPaths {
    static let sealed = ["/Nectar-Work", "/Developer/work", "/.ssh", "/.aws", "/.gnupg", "/.config/gcloud", "/.kube",
                         "/Library/Keychains", "/Library/Mail", "/Library/Messages", "/Library/Cookies", "/Library/Application Support/com.apple.TCC"]
    public static func allowed(_ raw: String, home: String) -> String? {
        let expanded = raw == "~" ? home : raw.hasPrefix("~/") ? home + raw.dropFirst() : raw
        let full = (expanded as NSString).standardizingPath
        guard full == home || full.hasPrefix(home + "/") else { return nil }
        let inside = String(full.dropFirst(home.count))
        if sealed.contains(where: { inside == $0 || inside.hasPrefix($0 + "/") }) { return nil }
        let name = (full as NSString).lastPathComponent.lowercased()
        if name == ".env" || name.hasPrefix(".env.") || name.hasSuffix(".pem") || name.hasSuffix(".key") || name == "id_rsa" || name == "id_ed25519" { return nil }
        return full
    }
}
