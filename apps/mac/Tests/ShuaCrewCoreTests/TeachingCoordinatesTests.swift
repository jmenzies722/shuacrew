import XCTest
@testable import ShuaCrewCore
final class TeachingCoordinatesTests: XCTestCase {
 func testRetinaResizeAndNegativeDisplayOrigin() {
  let g = TeachingCaptureGeometry(display: CGRect(x: -1440, y: 200, width: 1440, height: 900), sourcePixels: CGSize(width: 2880, height: 1800), cropPixels: CGRect(x: 0, y: 0, width: 2880, height: 1800), imagePixels: CGSize(width: 1440, height: 900))
  XCTAssertEqual(g.displayPoint(imagePoint: CGPoint(x: 720, y: 450)), CGPoint(x: -720, y: 650))
 }
 func testCropAndDifferingOrigins() {
  let g = TeachingCaptureGeometry(display: CGRect(x: 1920, y: -300, width: 1000, height: 800), sourcePixels: CGSize(width: 2000, height: 1600), cropPixels: CGRect(x: 500, y: 400, width: 1000, height: 800), imagePixels: CGSize(width: 500, height: 400))
  XCTAssertEqual(g.displayPoint(imagePoint: .zero), CGPoint(x: 2170, y: 300))
  XCTAssertEqual(g.displayPoint(imagePoint: CGPoint(x: 500, y: 400)), CGPoint(x: 2670, y: -100))
  XCTAssertNil(g.displayPoint(imagePoint: CGPoint(x: -1, y: 0)))
 }
 func testInvalidGeometryRejected() {
  let g = TeachingCaptureGeometry(display: .zero, sourcePixels: .zero, cropPixels: .zero, imagePixels: .zero)
  XCTAssertNil(g.displayPoint(imagePoint: .zero))
 }
}
