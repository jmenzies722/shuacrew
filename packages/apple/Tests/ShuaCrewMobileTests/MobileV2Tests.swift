import Foundation
import XCTest
@testable import ShuaCrewMobile

final class MobileV2Tests: XCTestCase {
    private func fixture(_ name: String) throws -> Data {
        var root = URL(fileURLWithPath: #filePath)
        for _ in 0..<5 { root.deleteLastPathComponent() }
        return try Data(contentsOf: root.appending(path: "fixtures/mobile-v2/\(name).json"))
    }
    func testSharedFixturesKeepV1Strict() throws {
        let command = try fixture("message"), snapshot = try fixture("snapshot")
        XCTAssertEqual(try MobileV2Codec.command(command).action.recipient, "eli")
        XCTAssertEqual(try MobileV2Codec.snapshot(snapshot).results.first?.verification, "not-recorded")
        XCTAssertThrowsError(try MobileCodec.command(command))
        XCTAssertThrowsError(try MobileCodec.snapshot(snapshot))
    }
    func testUnknownVersionAndForeignScopeFailClosed() throws {
        var command = try JSONSerialization.jsonObject(with: fixture("message")) as! [String: Any]
        command["version"] = 3
        XCTAssertThrowsError(try MobileV2Codec.command(JSONSerialization.data(withJSONObject: command)))
        var snapshot = try JSONSerialization.jsonObject(with: fixture("snapshot")) as! [String: Any]
        var work = snapshot["work"] as! [[String: Any]]
        work[0]["roomId"] = "foreign"; snapshot["work"] = work
        XCTAssertThrowsError(try MobileV2Codec.snapshot(JSONSerialization.data(withJSONObject: snapshot)))
    }
    func testMalformedUUIDAndMissingExplicitNullAreRejected() throws {
        var command = try JSONSerialization.jsonObject(with: fixture("message")) as! [String: Any]
        command["action"] = ["kind": "queue-cancel", "roomId": "room_fixture", "requestId": "00000000-0000-9000-8000-000000000001"]
        XCTAssertThrowsError(try MobileV2Codec.command(JSONSerialization.data(withJSONObject: command)))
        command["action"] = ["kind": "room-message", "roomId": "room_fixture", "text": "hello", "recipient": NSNull()]
        XCTAssertThrowsError(try MobileV2Codec.command(JSONSerialization.data(withJSONObject: command)))
    }
}
