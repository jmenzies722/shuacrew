import SwiftUI

/// The tabs of the app, so any screen can bring you home to Shua.
enum PhoneTab: Hashable { case shua, today, crew, settings }

private struct GoHomeKey: EnvironmentKey { static let defaultValue: @MainActor () -> Void = {} }
extension EnvironmentValues {
    /// Take me to Shua's home tab.
    var goHome: @MainActor () -> Void { get { self[GoHomeKey.self] } set { self[GoHomeKey.self] = newValue } }
}

/// Shua on every other tab: small, alive, in the corner above the tab bar, with its latest words beside it. Tap to go
/// to Shua; hold to talk to it right where you are.
struct MiniShua: View {
    @Environment(SparkLink.self) private var link
    @Environment(\.goHome) private var goHome
    @State private var listen = ShuaListen()
    private var voice: ShuaVoice { .shared }

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if let words { bubble(words).transition(.move(edge: .trailing).combined(with: .opacity)) }
            ShuaCharacter(mood: mood, lively: 0.6)
                .frame(width: 68, height: 68)
                .padding(4)
                .background(.ultraThinMaterial, in: Circle())
                .overlay(Circle().strokeBorder((link.look?.accentColor ?? .shuaPurple).opacity(listen.listening ? 0.9 : 0.25), lineWidth: listen.listening ? 2 : 1))
                .shadow(color: .black.opacity(0.4), radius: 12, y: 6)
                .scaleEffect(listen.listening ? 1.12 : 1)
                .simultaneousGesture(TapGesture().onEnded { goHome() })
                .simultaneousGesture(LongPressGesture(minimumDuration: 0.3).sequenced(before: DragGesture(minimumDistance: 0))
                    .onChanged { v in if case .second(true, _) = v, !listen.listening { UIImpactFeedbackGenerator(style: .medium).impactOccurred(); Task { await listen.start() } } }
                    .onEnded { _ in Task { let said = await listen.stop(); if !said.isEmpty { await link.ask(said) } } })
                .accessibilityLabel("Shua. Tap to go to Shua, hold to talk.")
        }
        .padding(.trailing, 16).padding(.bottom, 84)
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: words)
        .animation(.spring(response: 0.3), value: listen.listening)
        .opacity(link.pairing == nil ? 0 : 1)
    }

    /// What it's saying right now (or just said), or what you're saying to it.
    private var words: String? {
        if listen.listening { return listen.heard.isEmpty ? "I'm listening…" : listen.heard }
        guard let line = link.chat.last(where: { $0.role == .shua }), line.pending || Date.now.timeIntervalSince(line.at) < 45 else { return nil }
        return line.pending && line.text.isEmpty ? "Thinking…" : SparkLink.speakable(line.text)
    }

    private func bubble(_ text: String) -> some View {
        Text(text).font(.system(.subheadline, design: .rounded).weight(.medium)).lineLimit(3)
            .padding(.horizontal, 14).padding(.vertical, 10)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .frame(maxWidth: 240, alignment: .trailing)
    }

    private var mood: SparkMood {
        if voice.speaking { return .speaking }
        if listen.listening || link.asking { return .thinking }
        return link.mood
    }
}
