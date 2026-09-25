import Foundation
import CloudKit

/// One bounded page, including deletions. The owner drains moreComing before normal polling.
public struct MailboxPage: Sendable {
    public let deliveryId = UUID()
    public let records: [MailboxRecord]
    public let deleted: [UUID]
    public let token: Data
    public let moreComing: Bool
    public let rejectedRecords: Int
    public init(records: [MailboxRecord], deleted: [UUID], token: Data, moreComing: Bool, rejectedRecords: Int = 0) {
        self.records = records; self.deleted = deleted; self.token = token; self.moreComing = moreComing
        self.rejectedRecords = rejectedRecords
    }
}
public protocol CloudMailboxBackend: Sendable {
    func trackAcknowledgments(_ envelopes: [SignedEnvelope]) async throws
    func changes(since: Data?) async throws -> MailboxPage
    /// Immutable IDs: repeated identical writes succeed; conflicting content must fail.
    func save(_ record: MailboxRecord) async throws
    /// Throw on partial failure. Retrying a deleted ID must be harmless.
    func delete(_ ids: [UUID]) async throws
}
public extension CloudMailboxBackend {
    func trackAcknowledgments(_ envelopes: [SignedEnvelope]) async throws {}
}
public enum MailboxError: Error { case disabled, busy }

/// Off by default; independent of CloudKit account/container creation.
/// Cloud transport success is never an acknowledgment of an agent action.
public actor CloudMailbox {
    private let backend: any CloudMailboxBackend
    private var enabled = false
    private var generation: UInt64 = 0
    private var busy = false
    private var token: Data?
    private var pendingPage: MailboxPage?
    private var expirations: [UUID: Date] = [:]
    public init(backend: any CloudMailboxBackend) { self.backend = backend }
    public func setEnabled(_ value: Bool) {
        guard value != enabled else { return }
        enabled = value; generation &+= 1
        token = nil; pendingPage = nil; expirations.removeAll()
        // An already-submitted server write may finish; its response cannot repopulate state.
    }
    private func begin() throws -> UInt64 {
        try Task.checkCancellation()
        guard enabled else { throw MailboxError.disabled }
        guard !busy else { throw MailboxError.busy }
        busy = true; return generation
    }
    private func check(_ operationGeneration: UInt64) throws {
        try Task.checkCancellation()
        guard enabled, generation == operationGeneration else { throw CancellationError() }
    }
    public func fetchChanges() async throws -> MailboxPage {
        let current = try begin(); defer { busy = false }
        if let pendingPage { return pendingPage }
        let page: MailboxPage
        do { page = try await backend.changes(since: token) }
        catch let error as CKError where error.code == .changeTokenExpired && token != nil {
            // Re-reading immutable records is safe; commands are deduplicated by the authority.
            // Never retry indefinitely if even a fresh cursor is rejected.
            try check(current)
            token = nil
            page = try await backend.changes(since: nil)
        }
        try check(current)
        guard page.rejectedRecords >= 0, page.rejectedRecords <= 100,
              page.records.count + page.deleted.count + page.rejectedRecords <= 100, page.token.count <= 1048576 else { throw MobileProtocolError.tooLarge }
        pendingPage = page
        return page
    }
    public func trackAcknowledgments(_ envelopes: [SignedEnvelope]) async throws {
        let current = try begin(); defer { busy = false }
        guard envelopes.count <= 220 else { throw MobileProtocolError.tooLarge }
        try await backend.trackAcknowledgments(envelopes)
        try check(current)
    }
    /// Call only after every record has been durably handled or definitively rejected.
    public func acknowledge(_ page: MailboxPage) throws {
        guard enabled, let pendingPage, pendingPage.deliveryId == page.deliveryId else { throw MobileProtocolError.malformed }
        token = pendingPage.token
        for record in page.records { expirations[record.id] = record.expiresAt }
        for id in page.deleted { expirations[id] = nil }
        self.pendingPage = nil
    }
    public func save(_ record: MailboxRecord) async throws {
        let current = try begin(); defer { busy = false }
        guard !record.payload.isEmpty, record.payload.count <= CloudMailboxCodec.maximumPayloadBytes,
              record.expiresAt.timeIntervalSince1970.isFinite else { throw MobileProtocolError.malformed }
        try await backend.save(record)
        try check(current)
        expirations[record.id] = record.expiresAt
    }
    public func deleteExpired(now: Date) async throws {
        let current = try begin(); defer { busy = false }
        let ids = Array(expirations.filter { $0.value <= now }.keys.prefix(100))
        guard !ids.isEmpty else { return }
        try await backend.delete(ids)
        try check(current)
        for id in ids { expirations[id] = nil }
    }
}
