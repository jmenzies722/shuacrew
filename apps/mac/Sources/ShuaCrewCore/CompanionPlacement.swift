import Foundation
import CoreGraphics

/// Screen-coordinate placement shared by the native companion and geometry tests.
public enum CompanionPlacement {
    public static func allowsGuideMovement(docked: Bool, open: Bool) -> Bool { !docked && !open }
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

/// Spark's notch island (after Knurl's notch): one black shape that grows out of the camera housing, drawn in a
/// fixed transparent canvas flush with the top of the screen. The window never resizes — only the shape does —
/// so nothing inside it is ever clipped mid-animation.
public enum NotchIsland {
    /// The widest the island grows past the housing, each side; the deepest it drops below it.
    public static let maxFlare: CGFloat = 240
    public static let maxDrop: CGFloat = 300

    /// The camera housing, from the menu-bar strips either side of it and the safe-area inset (the cutout's real
    /// height, which can differ from the menu bar's by a point). Nil on a display without a notch.
    public static func housing(screen: CGRect, leftAux: CGRect?, rightAux: CGRect?, safeAreaTop: CGFloat) -> CGRect? {
        guard let left = leftAux, let right = rightAux, right.minX > left.maxX + 24, safeAreaTop > 10 else { return nil }
        return CGRect(x: left.maxX, y: screen.maxY - safeAreaTop, width: right.minX - left.maxX, height: safeAreaTop)
    }
    /// A stand-in housing for a display without a notch: a slim pill's worth at the top centre.
    public static func virtualHousing(screen: CGRect, menuBar: CGFloat) -> CGRect {
        let h = max(24, menuBar)
        return CGRect(x: screen.midX - 100, y: screen.maxY - h, width: 200, height: h)
    }
    /// The fixed canvas: centred on the housing, flush with the top edge, big enough for the fullest island.
    public static func canvas(housing: CGRect, screen: CGRect) -> CGRect {
        let width = housing.width + 2 * maxFlare + 20, height = housing.height + maxDrop + 24
        return CGRect(x: housing.midX - width / 2, y: screen.maxY - height, width: width, height: height)
    }
    /// Where the pointer opens it: generous sideways (the cutout's edges are easy to overshoot), a little below.
    public static func hoverTarget(housing: CGRect) -> CGRect {
        CGRect(x: housing.minX - 28, y: housing.minY - 12, width: housing.width + 56, height: housing.height + 12)
    }
    /// The open chat, hung from the notch: flush with the top of the screen, centred on the housing, kept on screen.
    public static func chat(size: CGSize, housing: CGRect, screen: CGRect) -> CGRect {
        let x = min(max(housing.midX - size.width / 2, screen.minX + 8), screen.maxX - 8 - size.width)
        return CGRect(x: x, y: screen.maxY - min(size.height, screen.height - 8), width: size.width, height: min(size.height, screen.height - 8))
    }
    /// While open, the island itself (plus a small margin) keeps it open.
    public static func openTarget(housing: CGRect, flare: CGFloat, drop: CGFloat) -> CGRect {
        CGRect(x: housing.minX - flare, y: housing.minY - drop, width: housing.width + 2 * flare, height: housing.height + drop).insetBy(dx: -14, dy: -14)
    }
}

/// Where a highlight goes. Spark's pages describe a thing by its CENTRE and size, as fractions of the screen from the
/// top-left; AppKit draws from the bottom-left in points. One conversion, used by guides and sketches alike, so a
/// highlight can never be shifted by half its size again.
public enum Highlight {
    public static func box(x: Double, y: Double, w: Double, h: Double, in size: CGSize, pad: CGFloat = 0) -> CGRect {
        CGRect(x: (x - w / 2) * size.width - pad, y: size.height - (y + h / 2) * size.height - pad, width: w * size.width + pad * 2, height: h * size.height + pad * 2)
    }
}
