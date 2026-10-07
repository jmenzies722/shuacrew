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
    /// Shua's voice on the Mac (ShuaCrew's voice engine), so the phone speaks with the same one.
    var voiceId: String?
    var voiceSpeed: Double?
    var at: Double

    private static let storeKey = "shua.look"
    /// The last one the Mac shared, else the one this app was built with (your Shua at build time), so it's yours
    /// from the first launch, before pairing.
    static func cached() -> ShuaLook? {
        if let saved = UserDefaults.standard.data(forKey: storeKey).flatMap({ try? JSONDecoder().decode(ShuaLook.self, from: $0) }) { return saved }
        return Bundle.main.url(forResource: "DefaultShua", withExtension: "json").flatMap { try? Data(contentsOf: $0) }.flatMap { try? JSONDecoder().decode(ShuaLook.self, from: $0) }
    }
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

/// The Mac's drawing, shown by WebKit: transparent, never touchable, the page's own JavaScript switched off. This app
/// gives it life from its own script world: it blinks on the Mac's rhythm (3.5–6.5 s), its eyes follow `gaze`, and moods
/// ease in rather than snapping.
struct ShuaAvatar: UIViewRepresentable {
    let look: ShuaLook
    let mood: SparkMood
    var gaze: CGVector = .zero

    @MainActor final class Coordinator {
        var loaded: ShuaLook?
        var mood: SparkMood = .idle
        var gaze: CGVector = .zero
        weak var web: WKWebView?
        private var blinker: Task<Void, Never>?
        func startBlinking() {
            blinker?.cancel()
            blinker = Task { @MainActor [weak self] in
                while !Task.isCancelled {
                    try? await Task.sleep(for: .milliseconds(Int.random(in: 3500...6500)))
                    guard let web = self?.web, self?.mood != .sleepy else { continue }
                    web.evaluateJavaScript("document.documentElement.dataset.blink='1';setTimeout(function(){delete document.documentElement.dataset.blink},240)", in: nil, in: .defaultClient) { _ in }
                }
            }
        }
        deinit { blinker?.cancel() }
    }
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
        context.coordinator.web = web
        load(web, context)
        context.coordinator.startBlinking()
        return web
    }

    func updateUIView(_ web: WKWebView, context: Context) {
        let c = context.coordinator
        if c.loaded != look { load(web, context); return }
        if c.mood != mood {
            c.mood = mood
            web.evaluateJavaScript("(function(){var e=document.querySelector('.spark-character');if(e)e.className=e.className.replace(/mood-[a-z]+/,'mood-\(mood.cssName)');})()", in: nil, in: .defaultClient) { _ in }
        }
        // Eyes follow, a few pixels at most; skip tiny changes so WebKit isn't repainting for nothing.
        if abs(c.gaze.dx - gaze.dx) + abs(c.gaze.dy - gaze.dy) > 0.04 {
            c.gaze = gaze
            let x = String(format: "%.1f", max(-1, min(1, gaze.dx)) * 3)
            let y = String(format: "%.1f", max(-1, min(1, gaze.dy)) * 2)
            web.evaluateJavaScript("document.documentElement.style.setProperty('--gx','\(x)px');document.documentElement.style.setProperty('--gy','\(y)px')", in: nil, in: .defaultClient) { _ in }
        }
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
        /* The phone's own life: moods ease in, eyes follow. */
        .robot-head,.robot-body,.robot-arm-right,.robot-arm-left{transition:transform .5s cubic-bezier(.2,.9,.3,1.15)}
        .robot-eyes{translate:var(--gx,0) var(--gy,0);transition:translate .18s ease-out,transform .5s cubic-bezier(.2,.9,.3,1.15)}
        </style></head><body>\(markup)</body></html>
        """
    }
}

/// Shua wherever it appears on the phone, alive: it floats and sways a little, its eyes follow your finger (and the
/// phone's tilt), it blinks, and a tap makes it wave. Your own character once the Mac has shared it.
struct ShuaCharacter: View {
    @Environment(SparkLink.self) private var link
    @Environment(\.accessibilityReduceMotion) private var still
    let mood: SparkMood
    var tilt: CGVector = .zero
    /// Smaller copies (the mini Shua on other tabs) float less.
    var lively: Double = 1
    @State private var touch: CGVector?
    @State private var waving = false

    var body: some View {
        GeometryReader { geo in
            TimelineView(.animation(minimumInterval: 1 / 30, paused: still)) { ctx in
                let t = ctx.date.timeIntervalSinceReferenceDate
                let float = still ? 0 : sin(t * 1.2) * 5 * lively, sway = still ? 0 : sin(t * 0.55) * 1.6 * lively
                let gaze = touch ?? CGVector(dx: tilt.dx * 1.4 + sin(t * 0.31) * 0.35, dy: tilt.dy * 1.4 + cos(t * 0.23) * 0.25)
                let side = min(geo.size.width, geo.size.height)
                character(mood: waving ? .happy : mood, gaze: gaze)
                    .frame(width: side, height: side) // always a square, centred: the drawing is never cut off
                    .rotation3DEffect(.degrees(Double(tilt.dx) * 10), axis: (x: 0, y: 1, z: 0))
                    .rotation3DEffect(.degrees(Double(-tilt.dy) * 6), axis: (x: 1, y: 0, z: 0))
                    .rotationEffect(.degrees(sway))
                    .offset(x: tilt.dx * 6, y: float + tilt.dy * 4)
                    .position(x: geo.size.width / 2, y: geo.size.height / 2)
            }
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0)
                .onChanged { v in
                    let c = CGPoint(x: geo.size.width / 2, y: geo.size.height * 0.4)
                    touch = CGVector(dx: (v.location.x - c.x) / (geo.size.width / 2), dy: (v.location.y - c.y) / (geo.size.height / 2))
                }
                .onEnded { v in
                    withAnimation(.smooth) { touch = nil }
                    if abs(v.translation.width) + abs(v.translation.height) < 10 { wave() }
                })
        }
        .sensoryFeedback(.impact(weight: .light), trigger: waving) { _, new in new }
        .accessibilityLabel("\(link.look?.name ?? "Shua"), \(mood.cssName)")
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { wave() }
    }

    @ViewBuilder private func character(mood: SparkMood, gaze: CGVector) -> some View {
        if let look = link.look {
            ShuaAvatar(look: look, mood: mood, gaze: gaze).aspectRatio(1, contentMode: .fit)
        } else {
            SparkFace(mood: mood, tilt: gaze)
        }
    }

    private func wave() {
        guard !waving else { return }
        waving = true
        Task { try? await Task.sleep(for: .seconds(2.2)); waving = false }
    }
}
