import Foundation
import Testing
@testable import ShuaCrewCore

@Suite struct MacTaskContractTests {
    @Test func scopeIsClosedAndTimeBounded() throws {
        let scope = try JSONDecoder().decode(MacTaskScope.self, from: Data(#"{"taskId":"task","generation":1,"request":"Calculate","allowedBundleIds":["com.apple.calculator"],"allowedResourceRoots":[],"startedAt":1000,"deadline":121000,"maxSteps":12}"#.utf8))
        #expect(scope.permits(bundleId: "com.apple.calculator", now: 2000))
        #expect(!scope.permits(bundleId: "com.apple.Safari", now: 2000))
        #expect(!scope.permits(bundleId: "com.apple.calculator", now: 121000))
        #expect(!scope.permits(bundleId: "com.apple.calculator", now: .nan))
        let forbidden = MacTaskScope(taskId: "x", generation: 1, request: "x", allowedBundleIds: ["com.apple.calculator"], allowedResourceRoots: ["/tmp/synthetic-symlink"], startedAt: 1000, deadline: 121000, maxSteps: 12)
        #expect(!forbidden.permits(bundleId: "com.apple.calculator", now: 2000))
    }
}
