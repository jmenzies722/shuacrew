import Testing
@testable import ShuaCrewCore

@Suite struct MacObservationRegistryTests {
    @Test func rejectsChangedIdentityGeometryAndLateWork() {
        var registry = MacObservationRegistry(generation: 1)
        registry.record(id: "one", pid: 42, window: "main", geometry: "100", now: 1000)
        #expect(registry.valid(id: "one", generation: 1, pid: 42, window: "main", geometry: "100", now: 1500))
        #expect(!registry.valid(id: "one", generation: 1, pid: 43, window: "main", geometry: "100", now: 1500))
        #expect(!registry.valid(id: "one", generation: 1, pid: 42, window: "other", geometry: "100", now: 1500))
        #expect(!registry.valid(id: "one", generation: 1, pid: 42, window: "main", geometry: "200", now: 1500))
        #expect(!registry.valid(id: "one", generation: 1, pid: 42, window: "main", geometry: "100", now: 3001))
        registry.invalidate()
        #expect(!registry.valid(id: "one", generation: 1, pid: 42, window: "main", geometry: "100", now: 1500))
    }
    @Test func claimsAtMostTwelveDistinctMutationsWithoutReplayingUnknownOutcomes() {
        var registry = MacObservationRegistry(generation: 1)
        let first = registry.claim("one", limit: 12)
        let duplicate = registry.claim("one", limit: 12)
        #expect(first)
        #expect(!duplicate)
        for index in 2...12 { let claimed = registry.claim("\(index)", limit: 12); #expect(claimed) }
        let overflow = registry.claim("13", limit: 12)
        #expect(!overflow)
        registry.invalidate()
        let cancelled = registry.claim("14", limit: 12)
        #expect(!cancelled)
    }
}
