import ShuaCrewCore
import Testing

private let me: Int32 = 100, chrome: Int32 = 200, terminal: Int32 = 300
private func win(_ pid: Int32, _ number: Int, layer: Int = 0, w: Double = 1600, h: Double = 900, owner: String = "App") -> ScreenTarget.Window {
    ScreenTarget.Window(pid: pid, number: number, layer: layer, width: w, height: h, alpha: 1, owner: owner)
}

@Test func anotherAppInFrontIsTheTarget() {
    #expect(ScreenTarget.pick(frontPid: chrome, selfPid: me, selfAppWindows: [], windows: [], lastWorkPid: terminal) == .app(pid: chrome, reason: "in front"))
}

@Test func shuacrewInFrontSinceLaunchStillFindsTheAppYouCanSee() {
    // The bug: ShuaCrew active since launch, no "last app" → "No target app is selected" with Chrome right there.
    let stack = [win(me, 1, layer: 25, w: 760, h: 562), win(me, 2, layer: 25, w: 2056, h: 1329), win(0, 3, layer: 20, owner: "Dock"), win(chrome, 4)]
    #expect(ScreenTarget.pick(frontPid: me, selfPid: me, selfAppWindows: [9], windows: stack, lastWorkPid: nil) == .app(pid: chrome, reason: "on top of your screen"))
}

@Test func shuacrewsOwnWindowOnTopIsShuaCrewNotTheAppBehindIt() {
    // Seen on this Mac: ShuaCrew's main window over Chrome. The screenshot showed ShuaCrew; the controls were Chrome's.
    let stack = [win(me, 1, layer: 25, w: 760, h: 562), win(me, 7, w: 280, h: 168), win(me, 9, w: 1939, h: 1014), win(chrome, 4, w: 1652, h: 947)]
    #expect(ScreenTarget.pick(frontPid: me, selfPid: me, selfAppWindows: [9], windows: stack, lastWorkPid: chrome) == .shuacrew)
}

@Test func shuasOwnPanelsAndTinyOrInvisibleWindowsAreSkipped() {
    let stack = [win(me, 7, w: 280, h: 168), ScreenTarget.Window(pid: terminal, number: 5, layer: 0, width: 900, height: 600, alpha: 0, owner: "Terminal"),
                 win(terminal, 6, w: 40, h: 20), win(chrome, 4)]
    #expect(ScreenTarget.pick(frontPid: me, selfPid: me, selfAppWindows: [9], windows: stack, lastWorkPid: nil) == .app(pid: chrome, reason: "on top of your screen"))
}

@Test func onlyTheDesktopFallsBackToTheLastAppThenToNothing() {
    let desk = [win(0, 3, layer: 20, owner: "Dock"), win(0, 8, layer: -2147483624, owner: "Wallpaper")]
    #expect(ScreenTarget.pick(frontPid: me, selfPid: me, selfAppWindows: [], windows: desk, lastWorkPid: terminal) == .app(pid: terminal, reason: "last used"))
    #expect(ScreenTarget.pick(frontPid: me, selfPid: me, selfAppWindows: [], windows: desk, lastWorkPid: nil) == .none)
}
