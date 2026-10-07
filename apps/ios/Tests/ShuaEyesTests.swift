import AVFoundation
import Testing
@testable import ShuaCrew

/// A hand 0.15 across (wrist to middle knuckle), fingers straight or curled, the thumb in, out or up.
private func hand(_ up: Set<HandShape.Finger>, thumbUp: Bool = false, x: CGFloat = 0) -> HandShape {
    let wrist = CGPoint(x: 0.5 + x, y: 0.8)
    func p(_ dx: CGFloat, _ dy: CGFloat) -> CGPoint { CGPoint(x: wrist.x + dx, y: wrist.y + dy) }
    var tip: [HandShape.Finger: CGPoint] = [:], mid = tip, knuckle = tip
    for (f, dx) in [(HandShape.Finger.index, -0.04), (.middle, 0), (.ring, 0.04), (.little, 0.08)] as [(HandShape.Finger, CGFloat)] {
        knuckle[f] = p(dx, -0.15); mid[f] = p(dx, -0.23)
        tip[f] = up.contains(f) ? p(dx, -0.33) : p(dx, -0.13)
    }
    knuckle[.thumb] = p(-0.08, -0.05)
    if thumbUp { mid[.thumb] = p(-0.07, -0.25); tip[.thumb] = p(-0.07, -0.34) }
    else if up.contains(.thumb) { mid[.thumb] = p(-0.12, -0.1); tip[.thumb] = p(-0.18, -0.15) }
    else { mid[.thumb] = p(-0.06, -0.09); tip[.thumb] = p(-0.03, -0.13) }
    return HandShape(wrist: wrist, tip: tip, mid: mid, knuckle: knuckle)
}

private let open = hand([.thumb, .index, .middle, .ring, .little])

@Test func readsTheSignsAHandMakes() {
    #expect(open.sign == .open)
    #expect(hand([.index, .middle, .ring, .little]).sign == .open) // thumb tucked is still an open hand
    #expect(hand([]).sign == .fist)
    #expect(hand([.thumb]).sign == .fist) // thumb out sideways, not up
    #expect(hand([], thumbUp: true).sign == .thumbsUp)
    #expect(hand([.index]).sign == .point)
    #expect(hand([.index, .middle]).sign == .peace)
    #expect(hand([.index, .little]).sign == nil) // nothing Shua reacts to
}

/// Feeds a moment reader frames at 15 a second and collects what it says.
private func run(_ m: inout Moments, from t0: Double, to t1: Double, face: Bool = true, hand: (Double) -> HandShape?) -> [Moments.Kind] {
    var out: [Moments.Kind] = [], t = t0
    while t <= t1 { out += m.feed(time: t, face: face, hand: hand(t)); t += 1.0 / 15 }
    return out
}

@Test func aWaveIsAnOpenHandSwingingSideToSide() {
    var m = Moments()
    let seen = run(&m, from: 0, to: 1.4) { t in hand([.thumb, .index, .middle, .ring, .little], x: 0.06 * sin(2 * .pi * 1.5 * t)) }
    #expect(seen.contains(.wave))
    #expect(!seen.contains(.talk)) // waving never starts listening
}

@Test func aRaisedPalmTalksAndAFistOrADroppedHandSends() {
    var m = Moments()
    var seen = run(&m, from: 0, to: 1.1) { _ in open }
    #expect(seen == [.talk] && m.talking)
    seen = run(&m, from: 1.2, to: 2.6) { _ in nil } // hand down
    #expect(seen == [.send] && !m.talking)

    var f = Moments()
    _ = run(&f, from: 0, to: 1.1) { _ in open }
    seen = run(&f, from: 1.2, to: 1.6) { _ in hand([]) }
    #expect(seen == [.send])
}

@Test func thumbsUpAndPeaceAreHeldBrieflyAndNotRepeated() {
    var m = Moments()
    #expect(run(&m, from: 0, to: 1.0) { _ in hand([], thumbUp: true) } == [.thumbsUp])
    var p = Moments()
    #expect(run(&p, from: 0, to: 2.0) { _ in hand([.index, .middle]) } == [.snap])
}

@Test func welcomesYouBackAfterABreakAndSuggestsOneAfterALongStretch() {
    var m = Moments()
    #expect(run(&m, from: 0, to: 5, hand: { _ in nil }).isEmpty)
    #expect(run(&m, from: 6, to: 20, face: false, hand: { _ in nil }) == [.left])
    let back = m.feed(time: 300, face: true, hand: nil)
    guard case .back(let away)? = back.first else { Issue.record("no welcome back: \(back)"); return }
    #expect(away > 290 && away < 300)

    var s = Moments(); s.stretchAfter = 60
    var said: [Moments.Kind] = []
    for t in stride(from: 0.0, through: 120, by: 1) { said += s.feed(time: t, face: true, hand: nil) }
    #expect(said == [.stretch(minutes: 1)]) // once, not every frame after
}

private func frame(_ w: Int = 320, _ h: Int = 240) -> CVPixelBuffer {
    var pb: CVPixelBuffer?
    CVPixelBufferCreate(nil, w, h, kCVPixelFormatType_32BGRA, [kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary, &pb)
    return pb!
}

@Test func aTimelapseKeepsOneFramePerIntervalAndPlaysAt30() async throws {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("timelapse-test.mov")
    let r = EyesRecorder(url: url, kind: .timelapse(every: 1))
    let pixels = frame()
    for i in 0..<100 { r.append(pixels, at: CMTime(seconds: Double(i) * 0.25, preferredTimescale: 600)); try await Task.sleep(for: .milliseconds(4)) }
    let (out, frames) = try #require(await r.finish())
    #expect(frames >= 20 && frames <= 25) // 25 s of camera, one a second (one may wait for the encoder)
    let seconds = try await AVURLAsset(url: out).load(.duration).seconds
    #expect(abs(seconds - Double(frames) / 30) < 0.1)
}

@Test func aRecordingKeepsRealTime() async throws {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("video-test.mov")
    let r = EyesRecorder(url: url, kind: .video)
    let pixels = frame()
    for i in 0..<31 { r.append(pixels, at: CMTime(seconds: 100 + Double(i) / 30, preferredTimescale: 600)); try await Task.sleep(for: .milliseconds(4)) }
    let (out, frames) = try #require(await r.finish())
    #expect(frames > 25)
    let seconds = try await AVURLAsset(url: out).load(.duration).seconds
    #expect(seconds > 0.8 && seconds < 1.2) // starts at zero, not at the camera clock's 100 s
}
