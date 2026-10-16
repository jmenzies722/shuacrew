import Accelerate
import Foundation

/// The notch's music bars, measured: one FFT window of what's playing → five frequency bands (low → high), each scaled
/// by its own automatic gain so a quiet acoustic track and a loud club track both fill the bars, and silence is flat.
/// Pure and allocation-free per frame (buffers are made once), so it can run 120×/s.
public final class MusicSpectrum {
    /// Band edges in Hz: kick/bass · low-mids · mids · presence (vocals, snare) · air (hats, cymbals).
    public static let edges: [Float] = [40, 140, 400, 1_200, 4_000, 12_000]
    public static let bandCount = 5
    public let size: Int
    public let sampleRate: Float
    /// Dynamic range shown by a bar, in dB below that band's recent peak.
    public var range: Float = 30
    /// How fast a band's peak falls back after a loud passage (dB per second).
    public var peakFall: Float = 4
    /// How far below the loudest band each band may sit and still be scaled up to fill its bar (music's natural tilt:
    /// highs carry far less energy than bass). Any quieter is real quiet (or window leakage) and reads low.
    public static let tiltAllowance: [Float] = [0, 10, 16, 22, 28]
    /// Below this the music is treated as silence (paused, a gap between songs).
    public var silenceDB: Float = -72

    private let fft: vDSP.FFT<DSPSplitComplex>
    private var window: [Float], windowed: [Float], real: [Float], imag: [Float], outReal: [Float], outImag: [Float], power: [Float]
    /// Scales power so a full-scale sine reads 0 dB (vDSP's real FFT is 2× the DFT; the window costs its sum).
    private let norm: Float
    private var peaks: [Float]
    private var levels = [Float](repeating: -120, count: 5)
    private let bins: [Range<Int>]
    /// Total level of the last window, in dBFS (−inf → −120).
    public private(set) var levelDB: Float = -120

    public init(size: Int = 2048, sampleRate: Float = 48_000) {
        precondition(size >= 64 && size & (size - 1) == 0, "power of two")
        self.size = size; self.sampleRate = sampleRate
        fft = vDSP.FFT(log2n: vDSP_Length(log2(Float(size))), radix: .radix2, ofType: DSPSplitComplex.self)!
        window = vDSP.window(ofType: Float.self, usingSequence: .hanningDenormalized, count: size, isHalfWindow: false)
        windowed = [Float](repeating: 0, count: size)
        real = [Float](repeating: 0, count: size / 2); imag = real; outReal = real; outImag = real; power = real
        let windowSum = window.reduce(0, +)
        norm = 1 / (windowSum * windowSum)
        peaks = [Float](repeating: -60, count: Self.bandCount)
        // Contiguous bins: every FFT bin belongs to exactly one band.
        let hzPerBin = sampleRate / Float(size)
        let cuts = Self.edges.map { min(size / 2, max(1, Int(($0 / hzPerBin).rounded()))) }
        bins = (0..<Self.bandCount).map { i in cuts[i]..<max(cuts[i] + 1, cuts[i + 1]) }
    }

    /// Five levels 0…1 from the newest `size` mono samples. `dt` is the time since the last call (for the peak fall).
    public func bands(_ samples: UnsafeBufferPointer<Float>, dt: Float, into out: inout [Float]) {
        if out.count != Self.bandCount { out = [Float](repeating: 0, count: Self.bandCount) }
        guard samples.count >= size, let base = samples.baseAddress else { for i in 0..<out.count { out[i] = 0 }; return }
        let input = UnsafeBufferPointer(start: base + (samples.count - size), count: size)
        let ms = vDSP.meanSquare(input)
        levelDB = ms > 0 ? 10 * log10(ms) : -120
        if levelDB < silenceDB { for i in 0..<out.count { out[i] = 0 }; return }
        vDSP.multiply(input, window, result: &windowed)
        let half = size / 2
        real.withUnsafeMutableBufferPointer { re in
            imag.withUnsafeMutableBufferPointer { im in
                outReal.withUnsafeMutableBufferPointer { oRe in
                    outImag.withUnsafeMutableBufferPointer { oIm in
                        var split = DSPSplitComplex(realp: re.baseAddress!, imagp: im.baseAddress!)
                        var spectrum = DSPSplitComplex(realp: oRe.baseAddress!, imagp: oIm.baseAddress!)
                        windowed.withUnsafeBufferPointer { w in
                            w.baseAddress!.withMemoryRebound(to: DSPComplex.self, capacity: half) { vDSP_ctoz($0, 2, &split, 1, vDSP_Length(half)) }
                        }
                        fft.forward(input: split, output: &spectrum)
                        vDSP.squareMagnitudes(spectrum, result: &power)
                    }
                }
            }
        }
        var loudest: Float = -120
        for i in 0..<Self.bandCount {
            var sum: Float = 0
            for b in bins[i] { sum += power[b] }
            levels[i] = 10 * log10(sum * norm + 1e-12)
            // The band's own gain: its peak jumps up at once and falls slowly, never below a floor (no hiss pumping).
            peaks[i] = max(levels[i], max(peaks[i] - peakFall * dt, -50))
            loudest = max(loudest, peaks[i])
        }
        for i in 0..<Self.bandCount {
            // …but anchored to the loudest band, so a band with nothing in it isn't blown up to full.
            let reference = max(peaks[i], loudest - Self.tiltAllowance[i])
            let v = (levels[i] - (reference - range)) / range
            // A gentle curve: quiet detail still moves, hits reach the top.
            out[i] = pow(min(1, max(0, v)), 1.35)
        }
    }

    /// Back to a cold start (a new song, a different app).
    public func reset() { for i in 0..<peaks.count { peaks[i] = -60 }; levelDB = -120 }
}

/// Recent mono samples, written by the audio thread and read by the meter's clock, with a read-behind so the bars can
/// show what you *hear* (AirPods play ~0.2 s after the tap sees the audio). Single writer, single reader; the writer
/// never blocks (it drops a block rather than wait).
public final class SampleRing: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [Float]
    private var written = 0 // total samples ever written
    public let capacity: Int

    public init(capacity: Int) { self.capacity = capacity; storage = [Float](repeating: 0, count: capacity) }

    /// Audio thread: append; never waits for the reader.
    public func write(_ samples: UnsafePointer<Float>, count: Int) {
        guard count > 0, lock.try() else { return }
        defer { lock.unlock() }
        var index = written % capacity
        for i in 0..<min(count, capacity) { storage[index] = samples[i]; index += 1; if index == capacity { index = 0 } }
        written += min(count, capacity)
    }

    /// The `count` samples ending `delay` samples before the newest one; false when not enough has arrived yet.
    public func read(count: Int, delay: Int, into out: inout [Float]) -> Bool {
        lock.lock(); defer { lock.unlock() }
        let end = written - delay
        guard count + delay <= capacity, end - count >= 0 else { return false }
        if out.count != count { out = [Float](repeating: 0, count: count) }
        var index = (end - count) % capacity
        for i in 0..<count { out[i] = storage[index]; index += 1; if index == capacity { index = 0 } }
        return true
    }

    public var total: Int { lock.lock(); defer { lock.unlock() }; return written }
    public func clear() { lock.lock(); written = 0; lock.unlock() }
}
