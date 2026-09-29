import Foundation
import CloudKit
import Testing
@testable import ShuaCrewMobile

private actor RecordDatabase: MobileCloudDatabase {
    nonisolated let scope: CKDatabase.Scope
    var records: [CKRecord.ID: CKRecord] = [:]
    var deleted: [CKRecord.ID] = []
    init(scope: CKDatabase.Scope = .private) { self.scope = scope }
    func changes(zone: CKRecordZone.ID, token: Data?) async throws -> CloudRecordPage {
        CloudRecordPage(records: Array(records.values), deleted: deleted, token: Data([1]), moreComing: false)
    }
    func insert(_ record: CKRecord) async throws {
        if let old = records[record.recordID] { throw CKError(.serverRecordChanged, userInfo: [CKRecordChangedErrorServerRecordKey: old]) }
        records[record.recordID] = record
    }
    func delete(_ ids: [CKRecord.ID]) async throws { for id in ids { records[id] = nil } }
    func reportDeleted(_ ids: [CKRecord.ID]) { deleted = ids }
}

@Test func malformedCloudRecordsDoNotPoisonValidPageOrCursor() async throws {
    let database = RecordDatabase(), zone = CKRecordZone.ID(zoneName: "ShuaCrewMobile", ownerName: CKCurrentUserDefaultName)
    let backend = try CloudKitMailboxBackend(database: database), id = UUID()
    try await backend.save(MailboxRecord(id: id, expiresAt: Date(timeIntervalSince1970: 2000), payload: Data([1])))
    let invalid = CKRecord(recordType: "Incompatible", recordID: CKRecord.ID(recordName: UUID().uuidString.lowercased(), zoneID: zone))
    try await database.insert(invalid)
    await database.reportDeleted([CKRecord.ID(recordName: "not-an-opaque-uuid", zoneID: zone)])
    let mailbox = CloudMailbox(backend: backend)
    await mailbox.setEnabled(true)
    let first = try await mailbox.fetchChanges()
    #expect(first.records.count == 1)
    #expect(first.records.first?.id == id)
    #expect(first.rejectedRecords == 2)
    try await mailbox.acknowledge(first)
    try await backend.save(MailboxRecord(id: UUID(), expiresAt: Date(timeIntervalSince1970: 2000), payload: Data([2])))
    let later = try await mailbox.fetchChanges()
    #expect(later.deliveryId != first.deliveryId)
    #expect(later.records.count == 2)
}

@Test func cloudBackendRefusesPublicOrSharedDatabases() throws {
    #expect(throws: (any Error).self) { try CloudKitMailboxBackend(database: RecordDatabase(scope: .public)) }
    #expect(throws: (any Error).self) { try CloudKitMailboxBackend(database: RecordDatabase(scope: .shared)) }
}

@Test func cloudBackendPreservesExactPayloadAndRejectsConflictingRecordID() async throws {
    let backend = try CloudKitMailboxBackend(database: RecordDatabase())
    let value = MailboxRecord(id: UUID(), expiresAt: Date(timeIntervalSince1970: 2000), payload: Data("exact signed bytes\n".utf8))
    try await backend.save(value)
    try await backend.save(value)
    let page = try await backend.changes(since: nil)
    #expect(page.records.count == 1)
    #expect(page.records.first?.payload == Data("exact signed bytes\n".utf8))
    await #expect(throws: (any Error).self) { try await backend.save(MailboxRecord(id: value.id, expiresAt: value.expiresAt, payload: Data([9]))) }
    #expect(try await backend.changes(since: nil).records.first?.payload == value.payload)
    try await backend.delete([value.id])
    try await backend.delete([value.id])
    #expect(try await backend.changes(since: nil).records.isEmpty)
}
