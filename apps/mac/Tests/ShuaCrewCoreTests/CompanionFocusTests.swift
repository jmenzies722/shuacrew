import Testing
@testable import ShuaCrewCore

@Suite struct CompanionFocusTests {
    @Test func passiveUpdatesNeverReleaseAnotherAppsKeyboard() {
        #expect(!CompanionFocus.shouldRelease(wasInteractive: false, isInteractive: false, ownsKeyboard: false))
        #expect(!CompanionFocus.shouldRelease(wasInteractive: true, isInteractive: false, ownsKeyboard: false))
    }

    @Test func typingAndHoverUpdatesKeepTheCurrentKeyboardOwner() {
        #expect(!CompanionFocus.shouldRelease(wasInteractive: true, isInteractive: true, ownsKeyboard: true))
        #expect(!CompanionFocus.shouldRelease(wasInteractive: false, isInteractive: false, ownsKeyboard: true))
    }

    @Test func closingTheInteractiveCompanionReleasesItsKeyboardOnce() {
        #expect(CompanionFocus.shouldRelease(wasInteractive: true, isInteractive: false, ownsKeyboard: true))
    }
}
