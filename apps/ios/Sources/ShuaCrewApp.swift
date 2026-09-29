import SwiftUI

@main struct ShuaCrewApp: App {
    @UIApplicationDelegateAdaptor(MobileAppDelegate.self) private var delegate
    var body: some Scene { WindowGroup { PhoneRoot(model: delegate.model) } }
}

private struct PhoneRoot: View {
    @ObservedObject var model: MobileModel
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
            TabView {
                Tab("Today", systemImage: "sun.max") { NavigationStack { TodayView() } }
                Tab("Crew", systemImage: "person.3.sequence") { NavigationStack { CrewView() } }
                Tab("Settings", systemImage: "slider.horizontal.3") { NavigationStack { SettingsView() } }
            }
            .tint(.teal)
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
