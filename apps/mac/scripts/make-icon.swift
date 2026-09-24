// Draws ShuaCrew's app icon: a true-black squircle with a glass rim, carrying a monochrome
// silver mark — a core, a faint orbit, three agents. No colour: it reads as one object, like
// the hardware it sits beside. Run: swift scripts/make-icon.swift <out.png>
import AppKit

let size: CGFloat = 1024
let image = NSImage(size: NSSize(width: size, height: size))
image.lockFocus()
let context = NSGraphicsContext.current!.cgContext
let white = NSColor.white

// macOS icon grid: the tile sits inside a 100pt margin with a continuous-corner squircle.
let tile = CGRect(x: 100, y: 100, width: 824, height: 824)
let shape = NSBezierPath(roundedRect: tile, xRadius: 185, yRadius: 185)

// 1. The rim: the whole tile filled with a light-to-dark gradient, dropped on a soft shadow.
context.saveGState()
context.setShadow(offset: CGSize(width: 0, height: -16), blur: 34, color: NSColor.black.withAlphaComponent(0.55).cgColor)
NSColor.black.setFill()
shape.fill()
context.restoreGState()
NSGradient(colors: [white.withAlphaComponent(0.30), white.withAlphaComponent(0.06), white.withAlphaComponent(0.10)], atLocations: [0, 0.6, 1], colorSpace: .sRGB)!.draw(in: shape, angle: -90)

// 2. The face, inset by the rim's width: black, barely lifted toward the top.
let faceRect = tile.insetBy(dx: 5, dy: 5)
let face = NSBezierPath(roundedRect: faceRect, xRadius: 180, yRadius: 180)
face.addClip()
NSGradient(colors: [
    NSColor(srgbRed: 0.14, green: 0.14, blue: 0.155, alpha: 1),
    NSColor(srgbRed: 0.05, green: 0.05, blue: 0.055, alpha: 1),
    NSColor.black,
], atLocations: [0, 0.45, 1], colorSpace: .sRGB)!.draw(in: faceRect, angle: -90)
// A soft cool light behind the mark, so the silver has something to sit in.
NSGradient(colors: [white.withAlphaComponent(0.11), white.withAlphaComponent(0)])!
    .draw(fromCenter: NSPoint(x: 512, y: 540), radius: 0, toCenter: NSPoint(x: 512, y: 540), radius: 390, options: [])
// Glass: a broad, faint sheen across the top.
context.saveGState()
NSBezierPath(ovalIn: CGRect(x: -120, y: 600, width: 1264, height: 640)).addClip()
NSGradient(colors: [white.withAlphaComponent(0.075), white.withAlphaComponent(0)])!.draw(in: CGRect(x: 0, y: 600, width: 1024, height: 424), angle: -90)
context.restoreGState()

let centre = NSPoint(x: 512, y: 512)
/// Brushed silver: bright at the top, cooler grey below.
let silver = NSGradient(colors: [
    NSColor(srgbRed: 1, green: 1, blue: 1, alpha: 1),
    NSColor(srgbRed: 0.82, green: 0.83, blue: 0.86, alpha: 1),
    NSColor(srgbRed: 0.56, green: 0.57, blue: 0.61, alpha: 1),
], atLocations: [0, 0.55, 1], colorSpace: .sRGB)!

func lit(_ path: NSBezierPath, in rect: CGRect, glow: CGFloat) {
    context.saveGState()
    context.setShadow(offset: .zero, blur: 38, color: white.withAlphaComponent(glow).cgColor)
    white.setFill()
    path.fill()
    context.restoreGState()
    context.saveGState()
    path.addClip()
    silver.draw(in: rect, angle: -90)
    context.restoreGState()
}

// 3. The orbit: a whisper of a line the agents travel on.
let orbit = NSBezierPath(ovalIn: CGRect(x: centre.x - 252, y: centre.y - 252, width: 504, height: 504))
orbit.lineWidth = 10
white.withAlphaComponent(0.2).setStroke()
orbit.stroke()

// 4. The core: a solid silver ring.
let coreRect = CGRect(x: centre.x - 150, y: centre.y - 150, width: 300, height: 300)
let core = NSBezierPath(ovalIn: coreRect)
core.append(NSBezierPath(ovalIn: CGRect(x: centre.x - 96, y: centre.y - 96, width: 192, height: 192)).reversed)
lit(core, in: coreRect, glow: 0.26)

// 5. Three agents on the orbit.
for angle in [90.0, 210.0, 330.0] {
    let a = angle * .pi / 180
    let p = NSPoint(x: centre.x + 252 * cos(a), y: centre.y + 252 * sin(a))
    let rect = CGRect(x: p.x - 50, y: p.y - 50, width: 100, height: 100)
    lit(NSBezierPath(ovalIn: rect), in: rect, glow: 0.42)
}
image.unlockFocus()

let data = NSBitmapImageRep(data: image.tiffRepresentation!)!.representation(using: .png, properties: [:])!
try! data.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
