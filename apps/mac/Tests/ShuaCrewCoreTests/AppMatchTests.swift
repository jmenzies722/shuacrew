import Testing
@testable import ShuaCrewCore

@Suite struct AppMatchTests {
    let running: [(name: String, bundle: String)] = [("Maps", "com.apple.Maps"), ("Music", "com.apple.Music"), ("TextEdit", "com.apple.TextEdit"),
                                                      ("Visual Studio Code", "com.microsoft.VSCode"), ("Google Chrome", "com.google.Chrome"), ("Finder", "com.apple.finder")]

    @Test func findsTheAppYouMean() {
        #expect(AppMatch.pick("Maps", running: running) == 0)
        #expect(AppMatch.pick("the maps app", running: running) == 0)
        #expect(AppMatch.pick("TextEdit application", running: running) == 2)
        #expect(AppMatch.pick("vs code", running: running) == 3)
        #expect(AppMatch.pick("chrome", running: running) == 4)
        #expect(AppMatch.pick("text", running: running) == 2)        // prefix
        #expect(AppMatch.pick("Safari", running: running) == nil)     // not running: say so, don't pretend
        #expect(AppMatch.pick("  ", running: running) == nil)
    }

    @Test func neverQuitsTheDesktopOrItself() {
        #expect(AppMatch.isProtected("com.apple.finder"))
        #expect(AppMatch.isProtected("dev.shuacrew.mac"))
        #expect(!AppMatch.isProtected("com.apple.Maps"))
    }
}
