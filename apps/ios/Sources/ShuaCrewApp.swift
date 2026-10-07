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
    var body: some View {
            TabView {
                // Shua first: everything goes through Shua. Today keeps the iCloud-synced view (usage, request history).
                Tab("Shua", systemImage: "sparkle") { NavigationStack { SparkHomeView() } }
                // Paired: the live views from your Mac. Not yet: the iCloud-synced ones, as before.
                Tab("Today", systemImage: "sun.max") { NavigationStack { if link.pairing != nil { ShuaTodayView() } else { TodayView() } } }
                Tab("Crew", systemImage: "person.3.sequence") { NavigationStack { if link.pairing != nil { ShuaCrewView() } else { CrewView() } } }
                Tab("Settings", systemImage: "slider.horizontal.3") { NavigationStack { ShuaSettingsView() } }
            }
            .tint(link.look?.accentColor ?? .shuaPurple) // your accent from the Mac (ShuaCrew purple until it's shared)
            .environment(link)
            .preferredColorScheme(.dark) // Onyx: the phone is black like the Mac
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
