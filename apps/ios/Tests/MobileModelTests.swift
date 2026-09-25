import Testing
@testable import ShuaCrew

@MainActor @Test func initialPhoneStateDoesNotPretendConnected() {
    let model = MobileModel()
    #expect(model.snapshot == nil)
    #expect(model.commands.isEmpty)
    #expect(!model.connected)
    #expect(model.stale)
    #expect(model.costLabel == "Not reported")
    #expect(!model.foreground)
}

@MainActor @Test func notificationHintsAndForegroundCannotEnableAnUnpairedPhone() async {
    let model = MobileModel()
    await model.setForeground(false)
    await model.setForeground(true)
    await model.openDecisionHint(id: "unknown-offer", installation: "other-mac")
    #expect(model.requestedDecision == nil)
    #expect(model.snapshot == nil)
    #expect(!model.connected)
    #expect(await model.refreshForNotification() == false)
}
