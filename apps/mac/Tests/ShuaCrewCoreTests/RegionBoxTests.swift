import Foundation
import Testing
@testable import ShuaCrewCore
struct RegionBoxTests {
    @Test func reversedDragClampsToDisplay() {
        #expect(RegionBox.rect(from: CGPoint(x: 120, y: 80), to: CGPoint(x: 20, y: 10), bounds: CGRect(x: 0, y: 0, width: 100, height: 100)) == CGRect(x: 20, y: 10, width: 80, height: 70))
        #expect(RegionBox.rect(from: .zero, to: CGPoint(x: 2,y: 2), bounds: CGRect(x: 0,y: 0,width: 100,height: 100)) == nil)
    }
    @Test func retinaCropFlipsNativeYAxis() {
        #expect(RegionBox.pixels(CGRect(x: 10,y: 20,width: 30,height: 40), view: CGSize(width: 100,height: 100), image: CGSize(width: 200,height: 200)) == CGRect(x: 20,y: 80,width: 60,height: 80))
    }
}
