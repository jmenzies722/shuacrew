import Foundation
import CloudKit
import Testing
@testable import ShuaCrewMobile

@Test func mailboxRecordKeepsContentInEncryptedFieldsOnly() throws {
    let zone = CKRecordZone.ID(zoneName: "ShuaCrewMobile", ownerName: CKCurrentUserDefaultName)
    let id = UUID()
    let payload = Data("private signed envelope content".utf8)
    let value = MailboxRecord(id: id, expiresAt: Date(timeIntervalSince1970: 2000), payload: payload)
    let record = try CloudMailboxCodec.encode(value, zone: zone)
    #expect(record["payload"] == nil)
    #expect(record.encryptedValues["payload"] as? Data == payload)
    // CloudKit's allKeys includes encrypted field names, not just readable values.
    #expect(Set(record.allKeys()) == ["version", "expiresAt", "payload"])
    let restored = try CloudMailboxCodec.decode(record, zone: zone)
    #expect(restored.id == id)
    #expect(restored.payload == payload)
    #expect(restored.expiresAt == Date(timeIntervalSince1970: 2000))
}

@Test func mailboxRejectsPlaintextPayloadWrongZoneAndOversize() throws {
    let zone = CKRecordZone.ID(zoneName: "ShuaCrewMobile", ownerName: CKCurrentUserDefaultName)
    let value = MailboxRecord(id: UUID(), expiresAt: Date(timeIntervalSince1970: 2000), payload: Data("signed".utf8))
    let record = try CloudMailboxCodec.encode(value, zone: zone)
    #expect(throws: (any Error).self) { try CloudMailboxCodec.decode(record, zone: CKRecordZone.ID(zoneName: "other")) }
    record.encryptedValues["payload"] = nil
    record["payload"] = Data("unencrypted".utf8)
    #expect(throws: (any Error).self) { try CloudMailboxCodec.decode(record, zone: zone) }
    #expect(throws: (any Error).self) {
        try CloudMailboxCodec.encode(MailboxRecord(id: UUID(), expiresAt: Date(), payload: Data(repeating: 0, count: 900001)), zone: zone)
    }
    #expect(throws: (any Error).self) {
        try CloudMailboxCodec.encode(MailboxRecord(id: UUID(), expiresAt: Date(timeIntervalSince1970: .infinity), payload: Data([1])), zone: zone)
    }
}
