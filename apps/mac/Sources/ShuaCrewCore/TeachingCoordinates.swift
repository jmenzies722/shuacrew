import Foundation
/// Capture pixels and persistent canvas coordinates are deliberately separate types.
public struct TeachingCaptureGeometry {
    public let display: CGRect
    public let sourcePixels: CGSize
    public let cropPixels: CGRect
    public let imagePixels: CGSize
    public init(display: CGRect, sourcePixels: CGSize, cropPixels: CGRect, imagePixels: CGSize) {
        self.display = display; self.sourcePixels = sourcePixels; self.cropPixels = cropPixels; self.imagePixels = imagePixels
    }
    /// Input is in the resized image's top-left pixels; output is global Cocoa display points.
    public func displayPoint(imagePoint: CGPoint) -> CGPoint? {
        let values = [display.minX, display.minY, display.width, display.height, sourcePixels.width, sourcePixels.height, cropPixels.minX, cropPixels.minY, cropPixels.width, cropPixels.height, imagePixels.width, imagePixels.height, imagePoint.x, imagePoint.y]
        guard values.allSatisfy({ $0.isFinite }), display.width > 0, display.height > 0, sourcePixels.width > 0, sourcePixels.height > 0, imagePixels.width > 0, imagePixels.height > 0, cropPixels.width > 0, cropPixels.height > 0,
              cropPixels.minX >= 0, cropPixels.minY >= 0, cropPixels.maxX <= sourcePixels.width, cropPixels.maxY <= sourcePixels.height,
              imagePoint.x >= 0, imagePoint.y >= 0, imagePoint.x <= imagePixels.width, imagePoint.y <= imagePixels.height else { return nil }
        let px = cropPixels.minX + imagePoint.x / imagePixels.width * cropPixels.width
        let py = cropPixels.minY + imagePoint.y / imagePixels.height * cropPixels.height
        return CGPoint(x: display.minX + px / sourcePixels.width * display.width, y: display.maxY - py / sourcePixels.height * display.height)
    }
}
