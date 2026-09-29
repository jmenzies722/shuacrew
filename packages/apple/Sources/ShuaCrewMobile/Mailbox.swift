import Foundation
import CloudKit
import CoreFoundation

/// Transport metadata deliberately contains no room, device, prompt or decision text.
public struct MailboxRecord: Codable, Sendable {
    public let id: UUID
    public let expiresAt: Date
    public let payload: Data
    public init(id: UUID, expiresAt: Date, payload: Data) {
        self.id = id; self.expiresAt = expiresAt; self.payload = payload
    }
}

/// Record conversion only: constructing this codec never opens a container or accesses iCloud.
/// Signature/audience/command-expiry checks remain mandatory after transport decoding.
public enum CloudMailboxCodec {
    // Reserve record overhead. Larger signed snapshots must be reduced, never silently truncated.
    public static let maximumPayloadBytes = 900000
    private static func validate(_ value: MailboxRecord) throws {
        guard !value.payload.isEmpty, value.payload.count <= maximumPayloadBytes else { throw MobileProtocolError.tooLarge }
        guard value.expiresAt.timeIntervalSince1970.isFinite, value.expiresAt.timeIntervalSince1970 >= 0 else { throw MobileProtocolError.malformed }
    }
    public static func encode(_ value: MailboxRecord, zone: CKRecordZone.ID) throws -> CKRecord {
        try validate(value)
        let record = CKRecord(recordType: "ShuaCrewEnvelope", recordID: CKRecord.ID(recordName: value.id.uuidString.lowercased(), zoneID: zone))
        record["version"] = NSNumber(value: 1)
        record["expiresAt"] = value.expiresAt as NSDate
        record.encryptedValues["payload"] = value.payload as NSData
        return record
    }
    public static func decode(_ record: CKRecord, zone: CKRecordZone.ID) throws -> MailboxRecord {
        guard record.recordType == "ShuaCrewEnvelope", record.recordID.zoneID == zone,
              let id = UUID(uuidString: record.recordID.recordName),
              record.recordID.recordName == id.uuidString.lowercased(),
              Set(record.allKeys()) == ["version", "expiresAt", "payload"], record["payload"] == nil,
              Set(record.encryptedValues.allKeys()) == ["payload"],
              let version = record["version"] as? NSNumber,
              CFGetTypeID(version) != CFBooleanGetTypeID(), version.doubleValue == 1,
              let expiry = record["expiresAt"] as? Date,
              let payload = record.encryptedValues["payload"] as? Data else { throw MobileProtocolError.malformed }
        let value = MailboxRecord(id: id, expiresAt: expiry, payload: payload)
        try validate(value)
        return value
    }
}
