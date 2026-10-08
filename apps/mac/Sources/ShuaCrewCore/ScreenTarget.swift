import Foundation

/// Which app Shua's eyes and hands are on: the one whose window you can actually see on top.
///
/// Talking to Shua (tapping the notch, typing into it) makes ShuaCrew the active app, so "the front app" alone would
/// always be ShuaCrew. It used to fall back to "the last other app you switched to" — which doesn't exist when
/// ShuaCrew has been in front since it launched ("No target app is selected", with Chrome right there), and is wrong
/// when ShuaCrew's own window covers it (Shua saw ShuaCrew in the screenshot but was handed Chrome's controls).
/// The window stack is the truth: the topmost real window decides, Shua's own panels and system chrome aside.
public enum ScreenTarget: Equatable, Sendable {
    /// Another app: its controls are read through accessibility, and the hands aim at it.
    case app(pid: Int32, reason: String)
    /// ShuaCrew's own window is what's on top: Shua uses its page controls (go / ui), not screen clicks.
    case shuacrew
    /// Nothing to aim at (only the desktop): Shua can still look, it just has no app's controls.
    case none

    public struct Window: Equatable, Sendable {
        public let pid: Int32, number: Int, layer: Int, width: Double, height: Double, alpha: Double, owner: String
        public init(pid: Int32, number: Int, layer: Int, width: Double, height: Double, alpha: Double, owner: String) {
            self.pid = pid; self.number = number; self.layer = layer; self.width = width; self.height = height; self.alpha = alpha; self.owner = owner
        }
    }

    /// Owners of windows that are part of macOS itself, never something you work in.
    public static let systemOwners: Set<String> = ["Window Server", "Dock", "Control Center", "Notification Center", "SystemUIServer",
        "MenuBarAgent", "WindowManager", "Spotlight", "loginwindow", "Wallpaper", "TextInputMenuAgent", "universalAccessAuthWarn", "CursorUIViewService"]

    /// - Parameters:
    ///   - frontPid: the active app.
    ///   - selfPid: ShuaCrew.
    ///   - selfAppWindows: ShuaCrew's real windows (its main window, Settings) — not the notch, the cursor buddy or overlays.
    ///   - windows: on-screen windows, front to back (as CGWindowListCopyWindowInfo lists them).
    ///   - lastWorkPid: the last other app you switched to, if it's still running.
    public static func pick(frontPid: Int32?, selfPid: Int32, selfAppWindows: Set<Int>, windows: [Window], lastWorkPid: Int32?) -> ScreenTarget {
        if let front = frontPid, front != selfPid { return .app(pid: front, reason: "in front") }
        for w in windows where w.layer == 0 && w.alpha > 0.05 && w.width >= 120 && w.height >= 80 && !systemOwners.contains(w.owner) {
            if w.pid == selfPid {
                if selfAppWindows.contains(w.number) { return .shuacrew }
                continue // the notch, the cursor buddy, a preview: Shua's own, never the target
            }
            return .app(pid: w.pid, reason: "on top of your screen")
        }
        if let last = lastWorkPid, last != selfPid { return .app(pid: last, reason: "last used") }
        return .none
    }
}
