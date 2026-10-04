import Foundation

/// Never combine image evidence and controls from different apps/windows or an old capture.
public enum CaptureConsistency {
    public static func valid(startPID: Int32, currentPID: Int32, startWindow: String, currentWindow: String, observedAt: TimeInterval, now: TimeInterval) -> Bool {
        startPID == currentPID && startWindow == currentWindow && observedAt.isFinite && now.isFinite && now >= observedAt && now - observedAt <= 8
    }
}
