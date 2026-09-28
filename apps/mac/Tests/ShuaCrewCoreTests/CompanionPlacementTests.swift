import Foundation
import CoreGraphics
import ShuaCrewCore
import Testing
@Test func dockCentersBelowNotchAndExpandsDownward() {
    let screen = CGRect(x: 0, y: 0, width: 1512, height: 982)
    let visible = CGRect(x: 0, y: 38, width: 1512, height: 907)
    let compact = CompanionPlacement.dock(size: CGSize(width: 240, height: 48), screen: screen, visible: visible, topInset: 37)
    let expanded = CompanionPlacement.dock(size: CGSize(width: 940, height: 720), screen: screen, visible: visible, topInset: 37)
    #expect(compact.midX == 756)
    #expect(compact.maxY == 945)
    #expect(expanded.maxY == compact.maxY)
    #expect(visible.contains(expanded))
}
@Test func dockingRespectsExternalDisplayOriginAndSmallScreen() {
    let screen = CGRect(x: -1024, y: 100, width: 1024, height: 600)
    let visible = CGRect(x: -1024, y: 140, width: 1024, height: 536)
    let result = CompanionPlacement.dock(size: CGSize(width: 1400, height: 900), screen: screen, visible: visible, topInset: 0)
    #expect(result == visible)
    #expect(CompanionPlacement.clamp(CGRect(x: 8000, y: -400, width: 940, height: 720), to: visible) == CGRect(x: -940, y: 140, width: 940, height: 536))
}

@Test func followRidesBelowRightOfThePointer() {
    let visible = CGRect(x: 0, y: 0, width: 1512, height: 945)
    let f = CompanionPlacement.follow(cursor: CGPoint(x: 600, y: 500), size: CGSize(width: 104, height: 108), visible: visible)
    #expect(f.minX == 622)
    #expect(f.maxY == 484)
    #expect(!f.contains(CGPoint(x: 600, y: 500)))
}
@Test func followFlipsAtEdgesAndStaysOnScreen() {
    let visible = CGRect(x: 0, y: 38, width: 1512, height: 907)
    let size = CGSize(width: 104, height: 108)
    let corner = CompanionPlacement.follow(cursor: CGPoint(x: 1500, y: 60), size: size, visible: visible)
    #expect(corner.maxX <= 1500 - 22)          // flipped to the left of the pointer
    #expect(corner.minY >= 60 + 16)            // flipped above it
    #expect(visible.contains(corner))
    let other = CGRect(x: -1024, y: 100, width: 1024, height: 600)
    #expect(other.contains(CompanionPlacement.follow(cursor: CGPoint(x: -10, y: 690), size: size, visible: other)))
}
@Test func easingClosesTheGapWithoutOvershooting() {
    var p = CGPoint(x: 0, y: 0)
    for _ in 0..<30 { p = CompanionPlacement.ease(from: p, to: CGPoint(x: 100, y: -50)) }
    #expect(abs(p.x - 100) < 0.1 && abs(p.y + 50) < 0.1)
    #expect(CompanionPlacement.ease(from: .zero, to: CGPoint(x: 100, y: 0)).x < 100)
}
@Test func notchIslandFindsTheHousingAndAFlushCanvas() {
    let screen = CGRect(x: 0, y: 0, width: 1728, height: 1117)
    let housing = NotchIsland.housing(screen: screen, leftAux: CGRect(x: 0, y: 1079, width: 754, height: 38), rightAux: CGRect(x: 974, y: 1079, width: 754, height: 38), safeAreaTop: 38)
    #expect(housing == CGRect(x: 754, y: 1079, width: 220, height: 38))
    let canvas = NotchIsland.canvas(housing: housing!, screen: screen)
    #expect(canvas.maxY == screen.maxY)                    // flush with the top edge
    #expect(abs(canvas.midX - housing!.midX) < 0.001)      // centred on the camera
    #expect(canvas.width >= housing!.width + 2 * NotchIsland.maxFlare)
    #expect(NotchIsland.hoverTarget(housing: housing!).contains(CGPoint(x: 754 - 20, y: 1100)))   // just off the cutout's edge still opens it
    #expect(!NotchIsland.hoverTarget(housing: housing!).contains(CGPoint(x: 400, y: 1100)))      // the File menu does not
}
@Test func notchIslandIsNilWithoutANotch() {
    #expect(NotchIsland.housing(screen: CGRect(x: 0, y: 0, width: 1920, height: 1080), leftAux: nil, rightAux: nil, safeAreaTop: 0) == nil)
    let v = NotchIsland.virtualHousing(screen: CGRect(x: 0, y: 0, width: 1920, height: 1080), menuBar: 25)
    #expect(v.midX == 960 && v.maxY == 1080)
}
@Test func notchChatHangsFromTheHousing() {
    let screen = CGRect(x: 0, y: 0, width: 1728, height: 1117), housing = CGRect(x: 754, y: 1079, width: 220, height: 38)
    let chat = NotchIsland.chat(size: CGSize(width: 440, height: 640), housing: housing, screen: screen)
    #expect(chat.maxY == screen.maxY)                        // flush with the top: grows out of the notch, no gap
    #expect(abs(chat.midX - housing.midX) < 0.001)
    let tall = NotchIsland.chat(size: CGSize(width: 440, height: 5000), housing: housing, screen: screen)
    #expect(tall.minY >= screen.minY)                        // never taller than the screen
    let edge = NotchIsland.chat(size: CGSize(width: 440, height: 640), housing: CGRect(x: 1700, y: 1079, width: 20, height: 38), screen: screen)
    #expect(edge.maxX <= screen.maxX)                        // kept on screen
}
@Test func highlightsAreCentredOnWhatTheyDescribe() {
    // A 0.1 × 0.1 thing centred mid-screen on a 1000 × 800 point display: its box is centred there too (AppKit's y is flipped).
    let box = Highlight.box(x: 0.5, y: 0.5, w: 0.1, h: 0.1, in: CGSize(width: 1000, height: 800))
    let near = { (a: CGFloat, b: CGFloat) in abs(a - b) < 0.001 }
    #expect(near(box.minX, 450) && near(box.minY, 360) && near(box.width, 100) && near(box.height, 80))
    #expect(near(box.midX, 500) && near(box.midY, 400))
    // Near the top-left of the screen = high y in AppKit; padding grows it evenly on every side.
    let top = Highlight.box(x: 0.1, y: 0.05, w: 0.02, h: 0.025, in: CGSize(width: 1000, height: 800), pad: 4)
    #expect(abs(top.midX - 100) < 0.001 && abs(top.midY - 760) < 0.001)
    #expect(top.width == 28 && top.height == 28)
}
@Test func sparkOnlyReadsWhatItShould() {
    let home = "/Users/me"
    #expect(MacPaths.allowed("~/Documents/plan.pdf", home: home) == "/Users/me/Documents/plan.pdf")
    #expect(MacPaths.allowed("/Users/me/Developer/projects/app/README.md", home: home) != nil)
    // Sealed work folders, secrets, and escapes are refused.
    #expect(MacPaths.allowed("~/Nectar-Work/notes.txt", home: home) == nil)
    #expect(MacPaths.allowed("~/Developer/work/infra/main.tf", home: home) == nil)
    #expect(MacPaths.allowed("~/Developer/projects/../work/x", home: home) == nil)
    #expect(MacPaths.allowed("~/.ssh/id_ed25519", home: home) == nil)
    #expect(MacPaths.allowed("~/Developer/projects/app/.env", home: home) == nil)
    #expect(MacPaths.allowed("~/Library/Keychains/login.keychain-db", home: home) == nil)
    #expect(MacPaths.allowed("/etc/passwd", home: home) == nil)
    #expect(MacPaths.allowed("/Users/me2/secret.txt", home: home) == nil)
}
