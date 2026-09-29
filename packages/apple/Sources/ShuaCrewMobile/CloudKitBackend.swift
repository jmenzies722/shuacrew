import Foundation
import CloudKit

public struct CloudRecordPage: Sendable {
    public let records: [CKRecord]
    public let deleted: [CKRecord.ID]
    public let token: Data
    public let moreComing: Bool
    public init(records: [CKRecord], deleted: [CKRecord.ID], token: Data, moreComing: Bool) {
        self.records = records; self.deleted = deleted; self.token = token; self.moreComing = moreComing
    }
}
public protocol MobileCloudDatabase: Sendable {
    var scope: CKDatabase.Scope { get }
    func changes(zone: CKRecordZone.ID, token: Data?) async throws -> CloudRecordPage
    func insert(_ record: CKRecord) async throws
    func delete(_ ids: [CKRecord.ID]) async throws
}

/// Requires an explicitly enabled, entitled native owner to supply its private database.
/// Does not create a container, zone, subscription or schema.
public struct SystemMobileCloudDatabase: MobileCloudDatabase {
    private let database: CKDatabase
    public var scope: CKDatabase.Scope { database.databaseScope }
    public init(database: CKDatabase) { self.database = database }
    public func changes(zone: CKRecordZone.ID, token: Data?) async throws -> CloudRecordPage {
        let cursor: CKServerChangeToken?
        if let token {
            guard token.count <= 1048576 else { throw MobileProtocolError.tooLarge }
            guard let decoded = try NSKeyedUnarchiver.unarchivedObject(ofClass: CKServerChangeToken.self, from: token) else { throw MobileProtocolError.malformed }
            cursor = decoded
        } else { cursor = nil }
        let page = try await database.recordZoneChanges(inZoneWith: zone, since: cursor, resultsLimit: 100)
        let records = try page.modificationResultsByID.values.map { try $0.get().record }
        return CloudRecordPage(records: records, deleted: page.deletions.map(\.recordID),
            token: try NSKeyedArchiver.archivedData(withRootObject: page.changeToken, requiringSecureCoding: true), moreComing: page.moreComing)
    }
    public func insert(_ record: CKRecord) async throws {
        let result = try await database.modifyRecords(saving: [record], deleting: [], savePolicy: .ifServerRecordUnchanged, atomically: true)
        guard let saved = result.saveResults[record.recordID] else { throw MobileProtocolError.malformed }
        _ = try saved.get()
    }
    public func delete(_ ids: [CKRecord.ID]) async throws {
        guard !ids.isEmpty else { return }
        let result = try await database.modifyRecords(saving: [], deleting: ids, atomically: false)
        for id in ids {
            guard let deleted = result.deleteResults[id] else { throw MobileProtocolError.malformed }
            do { try deleted.get() }
            catch let error as CKError where error.code == .unknownItem { continue }
        }
    }
}

public struct CloudKitMailboxBackend: CloudMailboxBackend {
    private let database: any MobileCloudDatabase
    private let zone = CKRecordZone.ID(zoneName: "ShuaCrewMobile", ownerName: CKCurrentUserDefaultName)
    public init(database: any MobileCloudDatabase) throws {
        guard database.scope == .private else { throw MobileProtocolError.malformed }
        self.database = database
    }
    public func changes(since token: Data?) async throws -> MailboxPage {
        let page = try await database.changes(zone: zone, token: token)
        guard page.records.count + page.deleted.count <= 100 else { throw MobileProtocolError.tooLarge }
        // Format errors are definitive per-record rejection, not transport failures.
        // Keep the valid records and cursor; never log untrusted payloads or identifiers.
        let records = page.records.compactMap { try? CloudMailboxCodec.decode($0, zone: zone) }
        let deleted = page.deleted.compactMap { id -> UUID? in
            guard id.zoneID == zone, let value = UUID(uuidString: id.recordName), value.uuidString.lowercased() == id.recordName else { return nil }
            return value
        }
        return MailboxPage(records: records, deleted: deleted, token: page.token, moreComing: page.moreComing,
            rejectedRecords: page.records.count + page.deleted.count - records.count - deleted.count)
    }
    public func save(_ value: MailboxRecord) async throws {
        let record = try CloudMailboxCodec.encode(value, zone: zone)
        do { try await database.insert(record) }
        catch let error as CKError where error.code == .serverRecordChanged {
            guard let existing = error.serverRecord else { throw error }
            let saved = try CloudMailboxCodec.decode(existing, zone: zone)
            guard saved.id == value.id, saved.expiresAt == value.expiresAt, saved.payload == value.payload else { throw error }
            // Lost response after save: identical retry succeeds without overwriting server content.
        }
    }
    public func delete(_ ids: [UUID]) async throws {
        guard ids.count <= 100 else { throw MobileProtocolError.tooLarge }
        try await database.delete(ids.map { CKRecord.ID(recordName: $0.uuidString.lowercased(), zoneID: zone) })
    }
}
