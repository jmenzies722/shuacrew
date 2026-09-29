import Testing
@testable import ShuaCrewWatch

@Test @MainActor func watchStartsPrivateWithoutInventedActivity() {
    let model = WatchModel()
    #expect(model.snapshot == nil)
    #expect(model.commands.isEmpty)
    #expect(model.stale)
    #expect(model.status == "Watch sync is off")
    #expect(model.fingerprint == nil)
}
