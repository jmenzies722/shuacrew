import Foundation
import CoreGraphics

/// Screen-coordinate placement shared by the native companion and geometry tests.
public enum CompanionPlacement {
    public static func clamp(_ frame: CGRect, to visible: CGRect) -> CGRect {
        let width = min(frame.width, visible.width), height = min(frame.height, visible.height)
        return CGRect(x: min(max(frame.minX, visible.minX), visible.maxX - width),
                      y: min(max(frame.minY, visible.minY), visible.maxY - height), width: width, height: height)
    }
    /// Follow mode (Clicky-style): the companion rides just below and to the right of the pointer, flipping to the
    /// left or above near a screen edge so it never covers where you're pointing, and always stays on screen.
    public static func follow(cursor: CGPoint, size: CGSize, visible: CGRect, gap: CGSize = CGSize(width: 22, height: 16)) -> CGRect {
        var x = cursor.x + gap.width, y = cursor.y - gap.height - size.height
        if x + size.width > visible.maxX { x = cursor.x - gap.width - size.width }
        if y < visible.minY { y = cursor.y + gap.height }
        return clamp(CGRect(x: x, y: y, width: size.width, height: size.height), to: visible)
    }
    /// One eased step toward the target, so following feels like a buddy keeping up rather than a sticker.
    public static func ease(from current: CGPoint, to target: CGPoint, amount: CGFloat = 0.28) -> CGPoint {
        CGPoint(x: current.x + (target.x - current.x) * amount, y: current.y + (target.y - current.y) * amount)
    }
    public static func dock(size: CGSize, screen: CGRect, visible: CGRect, topInset: CGFloat) -> CGRect {
        let top = min(visible.maxY, screen.maxY - max(0, topInset))
        return clamp(CGRect(x: screen.midX - size.width / 2, y: top - size.height, width: size.width, height: size.height), to: visible)
    }
}
