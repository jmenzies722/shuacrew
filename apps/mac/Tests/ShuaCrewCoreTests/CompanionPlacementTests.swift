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
