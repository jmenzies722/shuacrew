import CoreGraphics
import Testing
@testable import ShuaCrewCore

@Suite struct DisplayLayoutTests {
    let laptop = CGRect(x: 0, y: 0, width: 1512, height: 982)

    @Test func describesWhereEachDisplaySits() {
        #expect(DisplayLayout.relation(of: CGRect(x: 1512, y: -200, width: 2560, height: 1440), to: laptop) == "to the right")
        #expect(DisplayLayout.relation(of: CGRect(x: -1920, y: 0, width: 1920, height: 1080), to: laptop) == "to the left")
        #expect(DisplayLayout.relation(of: CGRect(x: -300, y: 982, width: 2560, height: 1440), to: laptop) == "above")
        #expect(DisplayLayout.relation(of: CGRect(x: 1512, y: 982, width: 1920, height: 1080), to: laptop) == "above and to the right")
        #expect(DisplayLayout.relation(of: CGRect(x: 100, y: 0, width: 1512, height: 982), to: laptop) == "to the right") // mirrored-ish overlap
    }

    @Test func thePointersDisplayComesFirstThenLeftToRight() {
        let frames = [laptop, CGRect(x: 1512, y: 0, width: 2560, height: 1440), CGRect(x: -1920, y: 0, width: 1920, height: 1080)]
        #expect(DisplayLayout.order(frames: frames, pointer: CGPoint(x: 2000, y: 500)) == [1, 2, 0])
        #expect(DisplayLayout.order(frames: frames, pointer: CGPoint(x: 10, y: 10)) == [0, 2, 1])
        #expect(DisplayLayout.order(frames: frames, pointer: CGPoint(x: 99999, y: 0), fallback: 2) == [2, 0, 1]) // pointer off every screen
        #expect(DisplayLayout.order(frames: [laptop], pointer: .zero) == [0])
        #expect(DisplayLayout.order(frames: [], pointer: .zero).isEmpty)
    }

    @Test func sideDisplaysAreSentSmall() {
        #expect(DisplayLayout.sideSize(width: 5120, height: 2880) == (1280, 720))
        #expect(DisplayLayout.sideSize(width: 1080, height: 1920) == (720, 1280)) // portrait
        #expect(DisplayLayout.sideSize(width: 1024, height: 768) == (1024, 768))   // already small
    }
}
