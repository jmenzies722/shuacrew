// Draws ShuaCrew's app icon: a violet-black squircle (the Pristine palette) with a glass rim,
// carrying the mark in the Iris accent — a lit violet core, a faint orbit, three agents.
// The same mark is the sidebar logo and the web icon. Run: swift scripts/make-icon.swift <out.png>
import AppKit

let size: CGFloat = 1024
let image = NSImage(size: NSSize(width: size, height: size))
image.lockFocus()
let context = NSGraphicsContext.current!.cgContext
let white = NSColor.white
/// Iris, the app's accent (#8e48ff), and its lighter tints.
let iris = NSColor(srgbRed: 0x8e/255, green: 0x48/255, blue: 0xff/255, alpha: 1)
let lilac = NSColor(srgbRed: 0xc3/255, green: 0xa2/255, blue: 0xff/255, alpha: 1)

// macOS icon grid: the tile sits inside a 100pt margin with a continuous-corner squircle.
let tile = CGRect(x: 100, y: 100, width: 824, height: 824)
let shape = NSBezierPath(roundedRect: tile, xRadius: 185, yRadius: 185)

// 1. The rim: the whole tile filled with a light-to-dark gradient, dropped on a soft shadow.
context.saveGState()
context.setShadow(offset: CGSize(width: 0, height: -16), blur: 34, color: NSColor.black.withAlphaComponent(0.55).cgColor)
NSColor.black.setFill()
shape.fill()
context.restoreGState()
NSGradient(colors: [lilac.withAlphaComponent(0.38), iris.withAlphaComponent(0.08), iris.withAlphaComponent(0.16)], atLocations: [0, 0.6, 1], colorSpace: .sRGB)!.draw(in: shape, angle: -90)

// 2. The face, inset by the rim's width: Pristine's violet-tinted blacks, lifted toward the top.
let faceRect = tile.insetBy(dx: 5, dy: 5)
let face = NSBezierPath(roundedRect: faceRect, xRadius: 180, yRadius: 180)
face.addClip()
NSGradient(colors: [
    NSColor(srgbRed: 0x2a/255, green: 0x24/255, blue: 0x33/255, alpha: 1),
    NSColor(srgbRed: 0x19/255, green: 0x16/255, blue: 0x1d/255, alpha: 1),
    NSColor(srgbRed: 0x0c/255, green: 0x0a/255, blue: 0x0f/255, alpha: 1),
], atLocations: [0, 0.45, 1], colorSpace: .sRGB)!.draw(in: faceRect, angle: -90)
// A soft violet light behind the mark, so the core has something to glow in.
NSGradient(colors: [iris.withAlphaComponent(0.30), iris.withAlphaComponent(0)])!
    .draw(fromCenter: NSPoint(x: 512, y: 540), radius: 0, toCenter: NSPoint(x: 512, y: 540), radius: 390, options: [])
// Glass: a broad, faint sheen across the top.
context.saveGState()
NSBezierPath(ovalIn: CGRect(x: -120, y: 600, width: 1264, height: 640)).addClip()
NSGradient(colors: [white.withAlphaComponent(0.075), white.withAlphaComponent(0)])!.draw(in: CGRect(x: 0, y: 600, width: 1024, height: 424), angle: -90)
context.restoreGState()

let centre = NSPoint(x: 512, y: 512)
/// The core: lilac at the top deepening into Iris and a darker violet below.
let violet = NSGradient(colors: [
    lilac,
    iris,
    NSColor(srgbRed: 0x5b/255, green: 0x24/255, blue: 0xc9/255, alpha: 1),
], atLocations: [0, 0.55, 1], colorSpace: .sRGB)!
/// The agents: near-white with a lilac cast, so they read as the crew around the core.
let pearl = NSGradient(colors: [
    NSColor(srgbRed: 1, green: 1, blue: 1, alpha: 1),
    NSColor(srgbRed: 0xe6/255, green: 0xdb/255, blue: 0xff/255, alpha: 1),
    lilac,
], atLocations: [0, 0.55, 1], colorSpace: .sRGB)!

func lit(_ path: NSBezierPath, in rect: CGRect, fill: NSGradient, glow: CGFloat) {
    context.saveGState()
    context.setShadow(offset: .zero, blur: 44, color: iris.withAlphaComponent(glow).cgColor)
    iris.setFill()
    path.fill()
    context.restoreGState()
    context.saveGState()
    path.addClip()
    fill.draw(in: rect, angle: -90)
    context.restoreGState()
}

// 3. The orbit: a whisper of a line the agents travel on.
let orbit = NSBezierPath(ovalIn: CGRect(x: centre.x - 252, y: centre.y - 252, width: 504, height: 504))
orbit.lineWidth = 10
lilac.withAlphaComponent(0.26).setStroke()
orbit.stroke()

// 4. The core: a solid violet ring.
let coreRect = CGRect(x: centre.x - 150, y: centre.y - 150, width: 300, height: 300)
let core = NSBezierPath(ovalIn: coreRect)
core.append(NSBezierPath(ovalIn: CGRect(x: centre.x - 96, y: centre.y - 96, width: 192, height: 192)).reversed)
lit(core, in: coreRect, fill: violet, glow: 0.85)

// 5. Three agents on the orbit.
for angle in [90.0, 210.0, 330.0] {
    let a = angle * .pi / 180
    let p = NSPoint(x: centre.x + 252 * cos(a), y: centre.y + 252 * sin(a))
    let rect = CGRect(x: p.x - 50, y: p.y - 50, width: 100, height: 100)
    lit(NSBezierPath(ovalIn: rect), in: rect, fill: pearl, glow: 0.7)
}
image.unlockFocus()

let data = NSBitmapImageRep(data: image.tiffRepresentation!)!.representation(using: .png, properties: [:])!
try! data.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
