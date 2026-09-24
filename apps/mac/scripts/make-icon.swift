// Draws ShuaCrew's app icon: a graphite squircle lit from the top left, carrying the amber mark —
// an orbit, a core, three agents. Run: swift scripts/make-icon.swift <out.png>
import AppKit

let size: CGFloat = 1024
let image = NSImage(size: NSSize(width: size, height: size))
image.lockFocus()
let context = NSGraphicsContext.current!.cgContext
let amber = NSColor(srgbRed: 1, green: 0.69, blue: 0.125, alpha: 1)

// macOS icon grid: the tile sits inside a 100pt margin with a continuous-corner squircle.
let tile = CGRect(x: 100, y: 100, width: 824, height: 824)
let shape = NSBezierPath(roundedRect: tile, xRadius: 185, yRadius: 185)
context.saveGState()
context.setShadow(offset: CGSize(width: 0, height: -14), blur: 28, color: NSColor.black.withAlphaComponent(0.5).cgColor)
NSColor(srgbRed: 0.07, green: 0.08, blue: 0.10, alpha: 1).setFill()
shape.fill()
context.restoreGState()

shape.addClip()
NSGradient(colors: [
    NSColor(srgbRed: 0.19, green: 0.21, blue: 0.25, alpha: 1),
    NSColor(srgbRed: 0.09, green: 0.10, blue: 0.13, alpha: 1),
    NSColor(srgbRed: 0.04, green: 0.05, blue: 0.06, alpha: 1),
], atLocations: [0, 0.55, 1], colorSpace: .sRGB)!.draw(in: tile, angle: -60)
// A warm glow behind the mark, as if the core gives off light.
NSGradient(colors: [amber.withAlphaComponent(0.28), amber.withAlphaComponent(0)])!
    .draw(fromCenter: NSPoint(x: 512, y: 512), radius: 0, toCenter: NSPoint(x: 512, y: 512), radius: 360, options: [])

let centre = NSPoint(x: 512, y: 512)
func ring(_ r: CGFloat, _ width: CGFloat, _ color: NSColor) {
    let path = NSBezierPath(ovalIn: CGRect(x: centre.x - r, y: centre.y - r, width: r * 2, height: r * 2))
    path.lineWidth = width
    color.setStroke()
    path.stroke()
}
ring(250, 34, amber.withAlphaComponent(0.35))
ring(128, 44, amber)
for angle in [90.0, 210.0, 330.0] {
    let a = angle * .pi / 180
    let p = NSPoint(x: centre.x + 250 * cos(a), y: centre.y + 250 * sin(a))
    let r: CGFloat = 52
    context.saveGState()
    context.setShadow(offset: .zero, blur: 30, color: amber.withAlphaComponent(0.7).cgColor)
    amber.setFill()
    NSBezierPath(ovalIn: CGRect(x: p.x - r, y: p.y - r, width: r * 2, height: r * 2)).fill()
    context.restoreGState()
}
// A thin lit edge along the top, dark rim below: the tile's thickness.
NSColor.white.withAlphaComponent(0.10).setStroke()
shape.lineWidth = 6
shape.stroke()
image.unlockFocus()

let data = NSBitmapImageRep(data: image.tiffRepresentation!)!.representation(using: .png, properties: [:])!
try! data.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
