import Testing
@testable import ShuaCrewMobile

@MainActor @Test func foregroundWakeDoesNotWaitForBackoffOrReenableStoppedSync() async throws {
    let poller = ForegroundPoller()
    let (events, continuation) = AsyncStream<Int>.makeStream()
    var calls = 0
    poller.configure {
        calls += 1; continuation.yield(calls)
        return 3600
    }
    var iterator = events.makeAsyncIterator()
    poller.setActive(true)
    #expect(await iterator.next() == 1)
    poller.wake()
    #expect(await iterator.next() == 2)
    poller.setActive(false)
    poller.wake()
    for _ in 0..<10 { await Task.yield() }
    #expect(calls == 2)
    poller.setActive(true)
    #expect(await iterator.next() == 3)
    poller.stop()
    poller.setActive(true)
    for _ in 0..<10 { await Task.yield() }
    #expect(calls == 3)
    continuation.finish()
}
