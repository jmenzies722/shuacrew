public enum CompanionFocus {
    public static func shouldRelease(wasInteractive: Bool, isInteractive: Bool, ownsKeyboard: Bool) -> Bool {
        wasInteractive && !isInteractive && ownsKeyboard
    }
}
