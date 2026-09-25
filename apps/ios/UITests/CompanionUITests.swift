import XCTest

final class CompanionUITests: XCTestCase {
    @MainActor func testLargeTextDarkAppearanceKeepsNavigationAvailable() {
        let app = XCUIApplication()
        app.launchArguments = ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL", "-AppleInterfaceStyle", "Dark"]
        app.launch()
        XCTAssertTrue(app.tabBars.buttons["Crew"].waitForExistence(timeout: 10))
        app.tabBars.buttons["Crew"].tap()
        XCTAssertTrue(app.staticTexts["Your crew stays private"].exists)
        app.tabBars.buttons["Settings"].tap()
        XCTAssertTrue(app.staticTexts["Setup required"].exists)
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "Unpaired production UI — large text dark appearance"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
    @MainActor func testUnpairedAppShowsNoInventedActivity() {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.staticTexts["Your crew, within reach."].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Pair with your Mac"].exists)
        app.tabBars.buttons["Settings"].tap()
        XCTAssertTrue(app.staticTexts["Setup required"].exists)
        XCTAssertTrue(app.staticTexts["Cloud sync is off"].exists)
        let alerts = app.buttons["Enable decision alerts"]
        for _ in 0..<5 where !alerts.exists { app.swipeUp() }
        XCTAssertTrue(alerts.exists)
        XCTAssertFalse(alerts.isEnabled)
        XCTAssertEqual(app.alerts.count, 0)
    }
}
