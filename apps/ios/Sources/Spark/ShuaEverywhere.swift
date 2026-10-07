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
    private var latest: ShuaLine? { link.chat.last(where: { $0.role == .shua }) }

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if let words { bubble(words).transition(.move(edge: .trailing).combined(with: .opacity)).onTapGesture { link.seenReply = latest?.id } }
            ShuaCharacter(mood: mood, lively: 0.6)
                .frame(width: 58, height: 58)
                .padding(6)
                .glassEffect(.regular.tint((link.look?.accentColor ?? .shuaPurple).opacity(listen.listening ? 0.5 : 0.12)).interactive(), in: Circle())
                .shadow(color: .black.opacity(0.5), radius: 14, y: 8)
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
        .task(id: "\(latest?.id.uuidString ?? "")\(latest?.pending == true)\(voice.speaking)") {
            // Shown while Shua thinks and speaks, then a few seconds to read, then tucked away.
            guard let line = latest, !line.pending, !voice.speaking else { return }
            try? await Task.sleep(for: .seconds(6))
            if !Task.isCancelled { link.seenReply = line.id }
        }
    }

    /// What it's saying right now (or just said), or what you're saying to it.
    private var words: String? {
        if listen.listening { return listen.heard.isEmpty ? "I'm listening…" : listen.heard }
        guard let line = latest, line.id != link.seenReply, line.pending || voice.speaking || Date.now.timeIntervalSince(line.at) < 45 else { return nil }
        return line.pending && line.text.isEmpty ? "Thinking…" : SparkLink.speakable(line.text)
    }

    private func bubble(_ text: String) -> some View {
        Text(text).font(.system(size: 14, weight: .medium)).lineLimit(2)
            .padding(.horizontal, 14).padding(.vertical, 9)
            .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .frame(maxWidth: 220, alignment: .trailing)
    }

    private var mood: SparkMood {
        if voice.speaking { return .speaking }
        if listen.listening || link.asking { return .thinking }
        return link.mood
    }
}
