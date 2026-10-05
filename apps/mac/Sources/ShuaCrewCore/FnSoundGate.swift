import Foundation

/// Fn owns the capture cues from initial key-down through release. Other outcomes
/// (errors and completed work) remain audible. No timer can suppress a later request.
public struct FnSoundGate: Sendable {
    public private(set) var active = false
    public init() {}
    public mutating func receive(_ signal: FnGesture.Signal) {
        switch signal {
        case .press, .holdStart: active = true
        case .cancel, .tap, .holdEnd: active = false
        case .none: break
        }
    }
    public func allowsWeb(_ kind: EarconSynth.Kind) -> Bool {
        !active || ![.listen, .sent, .off].contains(kind)
    }
}
