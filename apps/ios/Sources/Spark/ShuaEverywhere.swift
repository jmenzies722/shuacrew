import SwiftUI

/// The tabs of the app, so any screen can take you to another.
enum PhoneTab: Hashable { case shua, today, crew, settings }

private struct GoHomeKey: EnvironmentKey { static let defaultValue: @MainActor () -> Void = {} }
private struct OpenTabKey: EnvironmentKey { static let defaultValue: @MainActor (PhoneTab) -> Void = { _ in } }
extension EnvironmentValues {
    /// Take me to Shua's home tab.
    var goHome: @MainActor () -> Void { get { self[GoHomeKey.self] } set { self[GoHomeKey.self] = newValue } }
    /// Take me to that tab.
    var openTab: @MainActor (PhoneTab) -> Void { get { self[OpenTabKey.self] } set { self[OpenTabKey.self] = newValue } }
}

/// Shua on every other tab, in the tab bar's own glass: its face, what it's saying (or "Ask Shua"), and a mic you hold
/// to talk right where you are. Tap Shua to go home. Folds into the tab bar as you scroll, like Music's player.
struct ShuaAccessory: View {
    @Environment(SparkLink.self) private var link
    @Environment(\.goHome) private var goHome
    @Environment(\.tabViewBottomAccessoryPlacement) private var placement
    @State private var listen = ShuaListen()
    private var voice: ShuaVoice { .shared }

    var body: some View {
        HStack(spacing: 10) {
            ShuaCharacter(mood: mood, lively: 0.35)
                .frame(width: placement == .inline ? 26 : 32, height: placement == .inline ? 26 : 32)
                .allowsHitTesting(false)
            Text(words).font(.system(size: 15, weight: .medium)).lineLimit(1)
                .foregroundStyle(listen.listening || link.asking || recent != nil ? .white : Noir.soft)
                .contentTransition(.opacity)
                .frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: listen.listening ? "waveform" : "mic.fill")
                .font(.system(size: 15, weight: .semibold))
                .symbolEffect(.variableColor.iterative, isActive: listen.listening)
                .frame(width: 34, height: 34)
                .background((link.look?.accentColor ?? .shuaPurple).opacity(listen.listening ? 0.9 : 0.55), in: Circle())
                .scaleEffect(listen.listening ? 1.12 : 1)
                .gesture(DragGesture(minimumDistance: 0)
                    .onChanged { _ in if !listen.listening { UIImpactFeedbackGenerator(style: .medium).impactOccurred(); Task { await listen.start() } } }
                    .onEnded { _ in Task { let said = await listen.stop(); if !said.isEmpty { await link.ask(said) } } })
                .accessibilityLabel("Hold to talk to Shua")
        }
        .padding(.horizontal, 12)
        .contentShape(Rectangle())
        .onTapGesture { goHome() }
        .animation(.smooth(duration: 0.25), value: words)
        .animation(.spring(response: 0.3), value: listen.listening)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Shua: \(words). Tap to go to Shua.")
    }

    /// Shua's latest reply while it's fresh.
    private var recent: String? {
        guard let line = link.chat.last(where: { $0.role == .shua }), line.pending || Date.now.timeIntervalSince(line.at) < 60 else { return nil }
        return line.pending && line.text.isEmpty ? "Thinking…" : SparkLink.speakable(line.text)
    }
    private var words: String {
        if listen.listening { return listen.heard.isEmpty ? "Listening…" : listen.heard }
        if link.asking, recent == nil { return "On it…" }
        return recent ?? (link.pairing == nil ? "Pair with your Mac to talk to Shua" : "Ask Shua anything")
    }
    private var mood: SparkMood {
        if voice.speaking { return .speaking }
        if listen.listening || link.asking { return .thinking }
        return link.mood
    }
}
