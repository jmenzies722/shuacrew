// Draws ShuaCrew's app icon: the mark on an ink tile. The mark is an S drawn as one path of work, and a blue dot that
// has just left it (the dot is the live indicator everywhere else in the app). No face, no character, no gradient
// beyond the faint top light every macOS tile carries. The same geometry is the web mark
// (apps/web/src/components/Mark.tsx) and the web icon (apps/web/public/icon.svg): change one, change all three.
// Run: swift scripts/make-icon.swift <out.png>
import AppKit

let size: CGFloat = 1024
let image = NSImage(size: NSSize(width: size, height: size))
image.lockFocus()
let context = NSGraphicsContext.current!.cgContext

// macOS icon grid: the tile sits inside a 100pt margin with a continuous-corner squircle.
let tile = CGRect(x: 100, y: 100, width: 824, height: 824)
let shape = NSBezierPath(roundedRect: tile, xRadius: 185, yRadius: 185)

// 1. The tile on a soft shadow.
context.saveGState()
context.setShadow(offset: CGSize(width: 0, height: -14), blur: 30, color: NSColor.black.withAlphaComponent(0.4).cgColor)
NSColor(srgbRed: 0x19/255, green: 0x19/255, blue: 0x19/255, alpha: 1).setFill()
shape.fill()
context.restoreGState()

// 2. Ink, a touch lighter at the top, and a hairline rim so it holds its edge on a black wallpaper.
context.saveGState()
shape.addClip()
NSGradient(colors: [NSColor(srgbRed: 0x2a/255, green: 0x2a/255, blue: 0x29/255, alpha: 1), NSColor(srgbRed: 0x19/255, green: 0x19/255, blue: 0x19/255, alpha: 1), NSColor(srgbRed: 0x13/255, green: 0x13/255, blue: 0x13/255, alpha: 1)],
           atLocations: [0, 0.55, 1], colorSpace: .sRGB)!.draw(in: tile, angle: -90)
context.restoreGState()
NSColor.white.withAlphaComponent(0.10).setStroke()
let rim = NSBezierPath(roundedRect: tile.insetBy(dx: 2, dy: 2), xRadius: 183, yRadius: 183)
rim.lineWidth = 4
rim.stroke()

// 3. The mark, from the web mark's 64-unit grid (y down) onto the tile (y up).
let unit = tile.width / 64
func at(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: tile.minX + x * unit, y: tile.minY + (64 - y) * unit) }
let s = CGMutablePath()
s.move(to: at(33, 17))
s.addLine(to: at(26.5, 17))
s.addArc(center: at(26.5, 24.5), radius: 7.5 * unit, startAngle: .pi / 2, endAngle: 3 * .pi / 2, clockwise: false)
s.addLine(to: at(34.5, 32))
s.addArc(center: at(34.5, 39.5), radius: 7.5 * unit, startAngle: .pi / 2, endAngle: -.pi / 2, clockwise: true)
s.addLine(to: at(18.5, 47))
context.addPath(s)
context.setStrokeColor(NSColor.white.cgColor)
context.setLineWidth(8 * unit)
context.setLineCap(.round)
context.setLineJoin(.round)
context.strokePath()

// 4. The dot: the one colour, the app's blue.
let dot = at(45, 17), r = 4.5 * unit
context.setFillColor(NSColor(srgbRed: 0x23/255, green: 0x83/255, blue: 0xe2/255, alpha: 1).cgColor)
context.fillEllipse(in: CGRect(x: dot.x - r, y: dot.y - r, width: r * 2, height: r * 2))

image.unlockFocus()
guard let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) else { fatalError("could not render the icon") }
try! png.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
