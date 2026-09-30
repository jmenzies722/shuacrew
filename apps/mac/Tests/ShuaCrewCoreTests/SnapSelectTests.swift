import CoreGraphics
import Testing
@testable import ShuaCrewCore

@Suite struct SnapSelectTests {
    let screen = CGRect(x: 0, y: 0, width: 1500, height: 1000)
    let page = SnapSelect.Item(rect: CGRect(x: 0, y: 0, width: 1500, height: 1000), name: "whole page")
    let para = SnapSelect.Item(rect: CGRect(x: 100, y: 300, width: 600, height: 80), name: "The paragraph")
    let link = SnapSelect.Item(rect: CGRect(x: 150, y: 320, width: 60, height: 18), name: "a link in it")
    let button = SnapSelect.Item(rect: CGRect(x: 900, y: 100, width: 80, height: 28), name: "Save")

    @Test func pointingPicksTheSmallestRealThingUnderIt() {
        #expect(SnapSelect.at(CGPoint(x: 160, y: 325), among: [page, para, link], screen: screen) == link)
        #expect(SnapSelect.at(CGPoint(x: 500, y: 340), among: [page, para, link], screen: screen) == para)
        #expect(SnapSelect.at(CGPoint(x: 1400, y: 900), among: [page, para], screen: screen) == nil) // only the page: not a pick
    }

    @Test func aRoughCircleSnapsToWhatItMostlyEncloses() {
        // A loose loop round the paragraph, spilling a little past it and not quite covering its right edge.
        let loop = CGRect(x: 80, y: 270, width: 590, height: 140)
        #expect(SnapSelect.within(loop, among: [page, para, link, button], screen: screen) == [para]) // not the link inside, not the page
    }

    @Test func circlingSeveralThingsBoxesEachAndLeavesOutWhatsBarelyTouched() {
        let loop = CGRect(x: 60, y: 60, width: 960, height: 360)
        let picked = SnapSelect.within(loop, among: [para, link, button, SnapSelect.Item(rect: CGRect(x: 1000, y: 380, width: 200, height: 60), name: "mostly outside")], screen: screen)
        #expect(picked == [para, button])
    }
}
