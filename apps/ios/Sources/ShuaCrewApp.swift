import SwiftUI

@main struct ShuaCrewApp: App {
    @UIApplicationDelegateAdaptor(MobileAppDelegate.self) private var delegate
    var body: some Scene { WindowGroup { PhoneRoot(model: delegate.model) } }
}

private struct PhoneRoot: View {
    @ObservedObject var model: MobileModel
    @Environment(\.scenePhase) private var scenePhase
    /// The live line to Shua on the Mac (pairing, runs, approvals). One per app, shared by every tab.
    @State private var link = SparkLink()
    @State private var tab: PhoneTab = .shua
    var body: some View {
            TabView(selection: $tab) {
                // Shua first: everything goes through Shua.
                Tab("Shua", systemImage: "sparkle", value: .shua) { NavigationStack { SparkHomeView() } }
                // Live from your Mac once paired (iCloud sync stays under Settings → Advanced).
                // Shua lives on every tab: tap the mini Shua to come home, hold it to talk.
                Tab("Today", systemImage: "sun.max", value: .today) { NavigationStack { ShuaTodayView() }.overlay(alignment: .bottomTrailing) { MiniShua() } }
                Tab("Crew", systemImage: "person.3.sequence", value: .crew) { NavigationStack { ShuaCrewView() }.overlay(alignment: .bottomTrailing) { MiniShua() } }
                Tab("Settings", systemImage: "slider.horizontal.3", value: .settings) { NavigationStack { ShuaSettingsView() }.overlay(alignment: .bottomTrailing) { MiniShua() } }
            }
            .tint(link.look?.accentColor ?? .shuaPurple) // your accent from the Mac (ShuaCrew purple until it's shared)
            .environment(link)
            .environment(\.goHome, { withAnimation(.smooth) { tab = .shua } })
            .preferredColorScheme(.dark) // Onyx: the phone is black like the Mac
            .fontDesign(ShuaType.shared.font.design) // your font everywhere, SF Pro unless you change it
            .environmentObject(model)
            .task { await model.setForeground(scenePhase == .active) }
            .onChange(of: scenePhase) { _, phase in Task { await model.setForeground(phase == .active) } }
            .sheet(item: Binding(get: { model.requestedDecision }, set: { model.requestedDecision = $0 })) { link in
                NavigationStack {
                    if let offer = model.snapshot?.offers.first(where: { $0.offerId == link.id }) {
                        ApprovalView(offer: offer).environmentObject(model)
                    } else {
                        ContentUnavailableView("Decision unavailable", systemImage: "clock", description: Text("It may have expired or been handled already. Open Today after sync finishes to check current decisions."))
                    }
                }
            }
    }
}
