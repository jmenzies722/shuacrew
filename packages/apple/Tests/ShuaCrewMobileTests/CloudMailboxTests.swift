import Foundation
import Testing
import CloudKit
@testable import ShuaCrewMobile

private actor SuspendedMailboxBackend: CloudMailboxBackend {
    var request: CheckedContinuation<MailboxPage, any Error>?
    var started: CheckedContinuation<Void, Never>?
    func changes(since: Data?) async throws -> MailboxPage {
        try await withCheckedThrowingContinuation { request = $0; started?.resume(); started = nil }
    }
    func waitForRequest() async {
        if request != nil { return }
        await withCheckedContinuation { started = $0 }
    }
    func finish() {
        request?.resume(returning: MailboxPage(records: [], deleted: [], token: Data([99]), moreComing: false)); request = nil
    }
    func save(_ record: MailboxRecord) async throws {}
    func delete(_ ids: [UUID]) async throws {}
}

@Test func disabledMailboxCannotBeRepopulatedByAnOldInFlightResponse() async throws {
    let backend = SuspendedMailboxBackend()
    let active = CloudMailbox(backend: backend)
    await active.setEnabled(true)
    let response = Task { try await active.fetchChanges() }
    await backend.waitForRequest()
    await active.setEnabled(false)
    await active.setEnabled(true)
    await backend.finish()
    await #expect(throws: CancellationError.self) { try await response.value }
}

private actor ExpiredCursorBackend: CloudMailboxBackend {
    var inputs: [Data?] = []
    func changes(since: Data?) async throws -> MailboxPage {
        inputs.append(since)
        if since != nil { throw CKError(.changeTokenExpired) }
        return MailboxPage(records: [], deleted: [], token: Data([1]), moreComing: false)
    }
    func save(_ record: MailboxRecord) async throws {}
    func delete(_ ids: [UUID]) async throws {}
}

@Test func expiredServerCursorRestartsFromBeginningOnce() async throws {
    let backend = ExpiredCursorBackend()
    let active = CloudMailbox(backend: backend)
    await active.setEnabled(true)
    try await active.acknowledge(active.fetchChanges())
    _ = try await active.fetchChanges()
    #expect(await backend.inputs == [nil, Data([1]), nil])
}

private actor MemoryMailboxBackend: CloudMailboxBackend {
    var records: [UUID: MailboxRecord] = [:]
    var failDelete = false
    func changes(since: Data?) async throws -> MailboxPage {
        MailboxPage(records: Array(records.values), deleted: [], token: Data([1]), moreComing: false)
    }
    func save(_ record: MailboxRecord) async throws {
        if let previous = records[record.id], previous.payload != record.payload || previous.expiresAt != record.expiresAt { throw MobileProtocolError.malformed }
        records[record.id] = record
    }
    func delete(_ ids: [UUID]) async throws {
        if failDelete { throw MobileProtocolError.malformed }
        for id in ids { records[id] = nil }
    }
    func rejectDeletes(_ value: Bool) { failDelete = value }
}

private actor PagedMailboxBackend: CloudMailboxBackend {
    let record = MailboxRecord(id: UUID(), expiresAt: Date(timeIntervalSince1970: 2000), payload: Data([7]))
    func changes(since: Data?) async throws -> MailboxPage {
        MailboxPage(records: since == nil ? [record] : [], deleted: [], token: Data([1]), moreComing: false)
    }
    func save(_ record: MailboxRecord) async throws {}
    func delete(_ ids: [UUID]) async throws {}
}

@Test func pageIsRedeliveredUntilConsumerDurablyHandlesIt() async throws {
    let mailbox = CloudMailbox(backend: PagedMailboxBackend())
    await mailbox.setEnabled(true)
    let first = try await mailbox.fetchChanges()
    #expect(first.records.count == 1)
    // A failed consumer must see the command again, not a cursor already past it.
    let retry = try await mailbox.fetchChanges()
    #expect(retry.records.first?.id == first.records.first?.id)
    try await mailbox.acknowledge(first)
    #expect(try await mailbox.fetchChanges().records.isEmpty)
    await mailbox.setEnabled(false)
    await mailbox.setEnabled(true)
    await #expect(throws: (any Error).self) { try await mailbox.acknowledge(first) }
    #expect(try await mailbox.fetchChanges().records.count == 1)
}

@Test func disabledMailboxDoesNotAcceptCommandsAndRetriesKeepImmutableRecords() async throws {
    let backend = MemoryMailboxBackend(), mailbox = CloudMailbox(backend: MemoryMailboxBackend())
    let value = MailboxRecord(id: UUID(), expiresAt: Date(timeIntervalSince1970: 2000), payload: Data([1]))
    await #expect(throws: (any Error).self) { try await mailbox.save(value) }
    let active = CloudMailbox(backend: backend)
    await active.setEnabled(true)
    try await active.save(value)
    try await active.save(value)
    let changes = try await active.fetchChanges()
    #expect(changes.records.count == 1)
    #expect(changes.records.first?.payload == Data([1]))
    await #expect(throws: (any Error).self) { try await active.save(MailboxRecord(id: value.id, expiresAt: value.expiresAt, payload: Data([2]))) }
    #expect(try await active.fetchChanges().records.first?.payload == Data([1]))
    await active.setEnabled(false)
    await #expect(throws: (any Error).self) { try await active.fetchChanges() }
}

@Test func failedCleanupRemainsRetryableAndOnlyDeletesExpiredRecords() async throws {
    let backend = MemoryMailboxBackend(), mailbox = CloudMailbox(backend: backend)
    await mailbox.setEnabled(true)
    try await mailbox.save(MailboxRecord(id: UUID(), expiresAt: Date(timeIntervalSince1970: 1000), payload: Data([1])))
    try await mailbox.save(MailboxRecord(id: UUID(), expiresAt: Date(timeIntervalSince1970: 2000), payload: Data([2])))
    await backend.rejectDeletes(true)
    await #expect(throws: (any Error).self) { try await mailbox.deleteExpired(now: Date(timeIntervalSince1970: 1500)) }
    let page = try await mailbox.fetchChanges()
    #expect(page.records.count == 2)
    try await mailbox.acknowledge(page)
    await backend.rejectDeletes(false)
    try await mailbox.deleteExpired(now: Date(timeIntervalSince1970: 1500))
    let changes = try await mailbox.fetchChanges()
    #expect(changes.records.count == 1)
    #expect(changes.records.first?.payload == Data([2]))
}
