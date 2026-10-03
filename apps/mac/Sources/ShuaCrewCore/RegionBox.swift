import Foundation

public enum RegionBox {
    /// Normalize a drag in either direction and clamp it to the selected display.
    public static func rect(from a: CGPoint, to b: CGPoint, bounds: CGRect) -> CGRect? {
        let r = CGRect(x: min(a.x, b.x), y: min(a.y, b.y), width: abs(a.x - b.x), height: abs(a.y - b.y)).intersection(bounds)
        return r.isNull || r.width < 6 || r.height < 6 ? nil : r
    }
    public static func pixels(_ rect: CGRect, view: CGSize, image: CGSize) -> CGRect {
        CGRect(x: rect.minX / view.width * image.width, y: (view.height - rect.maxY) / view.height * image.height,
               width: rect.width / view.width * image.width, height: rect.height / view.height * image.height).integral.intersection(CGRect(origin: .zero, size: image))
    }
}
