import SwiftUI
import WebKit

/// Your Shua, exactly as you designed it on the Mac. The Mac renders your character with its own drawing (character,
/// finish, eyes, accessories, accent) and publishes the SVG and its mood CSS; the phone shows that very drawing, so
/// there is one Shua, not a lookalike. Cached, so it's there the moment the app opens, even offline.
struct ShuaLook: Codable, Equatable, Sendable {
    var name: String
    var markup: String
    var css: String
    var accent: String
    var at: Double

    private static let storeKey = "shua.look"
    static func cached() -> ShuaLook? { UserDefaults.standard.data(forKey: storeKey).flatMap { try? JSONDecoder().decode(ShuaLook.self, from: $0) } }
    func cache() { if let data = try? JSONEncoder().encode(self) { UserDefaults.standard.set(data, forKey: Self.storeKey) } }

    /// Your accent from the Mac, for the glow and tint.
    var accentColor: Color { Color(hex: accent) ?? .shuaPurple }
}

extension Color {
    static let shuaPurple = Color(red: 0.557, green: 0.282, blue: 1.0)
    init?(hex: String) {
        let s = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        guard s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
        self.init(red: Double(v >> 16 & 0xff) / 255, green: Double(v >> 8 & 0xff) / 255, blue: Double(v & 0xff) / 255)
    }
}

extension SparkMood {
    /// The same mood names the Mac's character CSS uses.
    var cssName: String {
        switch self {
        case .idle: "idle"
        case .thinking: "thinking"
        case .speaking: "speaking"
        case .happy: "happy"
        case .concerned: "concerned"
        case .sleepy: "sleepy"
        }
    }
}

/// The Mac's drawing, shown by WebKit: transparent, never touchable, the page's own JavaScript switched off. Only this
/// app changes the mood (in its own script world), in place, so the character's animations carry on smoothly.
struct ShuaAvatar: UIViewRepresentable {
    let look: ShuaLook
    let mood: SparkMood

    final class Coordinator { var loaded: ShuaLook?; var mood: SparkMood = .idle }
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.defaultWebpagePreferences.allowsContentJavaScript = false
        config.suppressesIncrementalRendering = true
        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = .clear
        web.scrollView.backgroundColor = .clear
        web.scrollView.isScrollEnabled = false
        web.isUserInteractionEnabled = false
        web.accessibilityElementsHidden = true
        load(web, context)
        return web
    }

    func updateUIView(_ web: WKWebView, context: Context) {
        if context.coordinator.loaded != look { load(web, context); return }
        guard context.coordinator.mood != mood else { return }
        context.coordinator.mood = mood
        web.evaluateJavaScript("(function(){var e=document.querySelector('.spark-character');if(e)e.className=e.className.replace(/mood-[a-z]+/,'mood-\(mood.cssName)');})()", in: nil, in: .defaultClient) { _ in }
    }

    private func load(_ web: WKWebView, _ context: Context) {
        context.coordinator.loaded = look
        context.coordinator.mood = mood
        web.loadHTMLString(Self.page(look, mood: mood), baseURL: nil)
    }

    static func page(_ look: ShuaLook, mood: SparkMood) -> String {
        let markup = look.markup.replacingOccurrences(of: "mood-idle", with: "mood-\(mood.cssName)")
        return """
        <!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>\(look.css)
        html,body{margin:0;height:100%;background:transparent;overflow:hidden}
        body{display:grid;place-items:center}
        .spark-character{width:100vmin!important;height:100vmin!important;display:block}
        .spark-character svg{width:100%;height:100%;display:block}
        </style></head><body>\(markup)</body></html>
        """
    }
}

/// Shua wherever it appears on the phone: your own character once the Mac has shared it, Shua's built-in face until
/// then. Leans with the phone, so it feels like it's really there.
struct ShuaCharacter: View {
    @Environment(SparkLink.self) private var link
    let mood: SparkMood
    var tilt: CGVector = .zero

    var body: some View {
        Group {
            if let look = link.look {
                ShuaAvatar(look: look, mood: mood)
                    .aspectRatio(1, contentMode: .fit)
                    .rotation3DEffect(.degrees(Double(tilt.dx) * 10), axis: (x: 0, y: 1, z: 0))
                    .rotation3DEffect(.degrees(Double(-tilt.dy) * 6), axis: (x: 1, y: 0, z: 0))
                    .offset(x: tilt.dx * 6, y: tilt.dy * 4)
                    .animation(.interactiveSpring(response: 0.5, dampingFraction: 0.8), value: tilt.dx)
            } else {
                SparkFace(mood: mood, tilt: tilt)
            }
        }
        .accessibilityLabel("\(link.look?.name ?? "Shua"), \(mood.cssName)")
    }
}
