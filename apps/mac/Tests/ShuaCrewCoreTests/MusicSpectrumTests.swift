import Foundation
import CoreGraphics
import ShuaCrewCore
import Testing

private func tone(_ hz: Float, amplitude: Float = 0.5, count: Int = 2048, rate: Float = 48_000) -> [Float] {
    (0..<count).map { amplitude * sin(2 * .pi * hz * Float($0) / rate) }
}
private func levels(_ spectrum: MusicSpectrum, _ samples: [Float], dt: Float = 1 / 60) -> [Float] {
    var out = [Float]()
    samples.withUnsafeBufferPointer { spectrum.bands($0, dt: dt, into: &out) }
    return out
}

@Test func eachToneLightsItsOwnBand() {
    for (band, hz) in [(0, Float(80)), (1, 250), (2, 700), (3, 2_500), (4, 7_000)] {
        let spectrum = MusicSpectrum()
        let out = levels(spectrum, tone(hz))
        #expect(out.count == 5)
        #expect(out[band] > 0.9, "band \(band) for \(hz) Hz: \(out)")
        for other in 0..<5 where abs(other - band) > 1 { #expect(out[other] < 0.35, "band \(other) leaked for \(hz) Hz: \(out)") }
    }
}

@Test func silenceIsFlatNotNoise() {
    let spectrum = MusicSpectrum()
    _ = levels(spectrum, tone(80))
    let quiet = levels(spectrum, [Float](repeating: 0, count: 2048))
    #expect(quiet == [0, 0, 0, 0, 0])
    let hiss = levels(spectrum, (0..<2048).map { _ in Float.random(in: -0.0001...0.0001) })
    #expect(hiss == [0, 0, 0, 0, 0])
}

@Test func quietAndLoudSongsBothFillTheBars() {
    // Automatic gain per band: after a moment, a track 30 dB quieter moves the bars just as far.
    let loud = MusicSpectrum(), quiet = MusicSpectrum()
    var a: [Float] = [], b: [Float] = []
    for _ in 0..<30 { a = levels(loud, tone(250, amplitude: 0.5)); b = levels(quiet, tone(250, amplitude: 0.016)) }
    #expect(abs(a[1] - b[1]) < 0.05)
    #expect(b[1] > 0.9)
}

@Test func aDropReadsAsADrop() {
    let spectrum = MusicSpectrum()
    for _ in 0..<30 { _ = levels(spectrum, tone(80, amplitude: 0.5)) }
    let softer = levels(spectrum, tone(80, amplitude: 0.05)) // −20 dB right after: clearly lower, not re-normalised yet
    #expect(softer[0] < 0.5)
    #expect(softer[0] > 0.05)
}

@Test func ringReadsBehindForOutputLatency() {
    let ring = SampleRing(capacity: 4096)
    let ramp = (0..<3000).map(Float.init)
    ramp.withUnsafeBufferPointer { ring.write($0.baseAddress!, count: $0.count) }
    var out = [Float]()
    #expect(ring.read(count: 4, delay: 0, into: &out)); #expect(out == [2996, 2997, 2998, 2999])
    #expect(ring.read(count: 4, delay: 1000, into: &out)); #expect(out == [1996, 1997, 1998, 1999])
    #expect(!ring.read(count: 1024, delay: 2500, into: &out)) // not that much history yet
}

@Test func islandOutlineKeepsOneShapeForEverySize() {
    // Core Animation springs one outline into another point for point: every size must have the same elements.
    let canvas = CGSize(width: 760, height: 560)
    func elements(_ p: CGPath) -> [CGPathElementType] { var e: [CGPathElementType] = []; p.applyWithBlock { e.append($0.pointee.type) }; return e }
    let rest = NotchIsland.outline(width: 336, height: 38, radius: 12, in: canvas)
    let open = NotchIsland.outline(width: 480, height: 210, radius: 28, in: canvas)
    let tiny = NotchIsland.outline(width: 4, height: 4, radius: 40, in: canvas)
    #expect(elements(rest) == elements(open))
    #expect(elements(rest) == elements(tiny))
    // Flush with the top of the screen, centred, shoulders included.
    let box = open.boundingBoxOfPath
    #expect(abs(box.maxY - canvas.height) < 0.01)
    #expect(abs(box.midX - canvas.width / 2) < 0.01)
    #expect(abs(box.width - (480 + 2 * NotchIsland.shoulder)) < 0.01)
    #expect(abs(box.height - 210) < 0.01)
}
