/// A key acknowledgment is not evidence that the microphone is capturing.
public enum FnFeedback {
    public enum Phase: Equatable, Sendable { case hidden, preparing }
    public static func phase(for signal: FnGesture.Signal) -> Phase {
        signal == .press ? .preparing : .hidden
    }
}
