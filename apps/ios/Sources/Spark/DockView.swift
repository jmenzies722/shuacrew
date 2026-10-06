import SwiftUI

/// Desk mode: your iPhone on its stand as Shua's second home. Big face, the time, what's moving — the screen stays
/// awake while it's up, and a tap anywhere outside the face puts it away.
struct DockView: View {
    @Environment(SparkLink.self) private var link
    @Environment(\.dismiss) private var dismiss
    let tilt: SparkTilt

    var body: some View {
        GeometryReader { geo in
            let wide = geo.size.width > geo.size.height
            ZStack {
                Glow(mood: link.mood).ignoresSafeArea()
                let layout = wide ? AnyLayout(HStackLayout(spacing: 40)) : AnyLayout(VStackLayout(spacing: 24))
                layout {
                    SparkFace(mood: link.mood, tilt: tilt.gaze)
                        .frame(maxWidth: wide ? geo.size.height * 0.75 : geo.size.width * 0.7)
                    VStack(alignment: wide ? .leading : .center, spacing: 10) {
                        TimelineView(.periodic(from: .now, by: 1)) { ctx in
                            Text(ctx.date, format: .dateTime.hour().minute())
                                .font(.system(size: wide ? 84 : 64, weight: .semibold, design: .rounded))
                                .monospacedDigit().contentTransition(.numericText())
                        }
                        Text(link.caption.title).font(.title2.weight(.medium)).lineLimit(2)
                        if let sub = link.caption.sub { Text(sub).font(.headline).foregroundStyle(.secondary).lineLimit(2) }
                        HStack(spacing: 18) {
                            if !link.approvals.isEmpty { Label("\(link.approvals.count) waiting", systemImage: "hand.raised.fill").foregroundStyle(.orange) }
                            if !link.activeRuns.isEmpty { Label("\(link.activeRuns.count) working", systemImage: "bolt.fill").foregroundStyle(.green) }
                        }
                        .font(.headline)
                    }
                    .multilineTextAlignment(wide ? .leading : .center)
                }
                .padding(32)
            }
            .contentShape(Rectangle())
            .onTapGesture(count: 2) { dismiss() }
        }
        .preferredColorScheme(.dark)
        .statusBarHidden()
        .persistentSystemOverlays(.hidden)
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true; tilt.start() }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
    }
}
