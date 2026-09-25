import Foundation
import CryptoKit

public enum MobileCommandStatus: String, Codable, Sendable { case sending, waitingForMac, applied, rejected, expired, uncertain }

/// Transport-independent, signature-checked companion state. Cloud save is never execution.
public struct MobileSyncState: Sendable {
    public private(set) var snapshot: MobileSnapshot?
    public private(set) var account: String?
    public private(set) var isRevoked = false
    private let installationId, deviceId: String
    private let macPublicKey, devicePublicKey: Data
    private var paired = true
    private struct Command: Codable, Sendable {
        let envelope: SignedEnvelope
        let digest: String
        let expiresAt: Int64
        var status: MobileCommandStatus
    }
    private var commands: [String: Command] = [:]
    private struct Checkpoint: Codable {
        let version: Int
        let account, installationId, deviceId: String
        let macPublicKey, devicePublicKey: Data
        let commands: [String: Command]
        let revoked: Bool?
    }
    /// Local encrypted state, not a CloudKit record. The caller owns a device-only key.
    /// Persist before sending; persist acknowledgment changes before showing them as durable.
    public func checkpoint(key: SymmetricKey) throws -> Data {
        guard let account, paired || isRevoked else { throw MobileProtocolError.malformed }
        let value = Checkpoint(version: 1, account: account, installationId: installationId, deviceId: deviceId,
                               macPublicKey: macPublicKey, devicePublicKey: devicePublicKey, commands: commands, revoked: isRevoked)
        let data = try JSONEncoder().encode(value)
        guard data.count <= 8 * 1024 * 1024 else { throw MobileProtocolError.tooLarge }
        return try AES.GCM.seal(data, using: key, authenticating: Data("ShuaCrew/checkpoint/v1".utf8)).combined!
    }
    /// Validate the entire checkpoint before replacing state; never revive a previous account.
    public mutating func restoreCheckpoint(_ data: Data, key: SymmetricKey, now: Int64) throws {
        guard paired, account != nil, data.count <= 8 * 1024 * 1024 + 28 else { throw MobileProtocolError.malformed }
        let clear = try AES.GCM.open(AES.GCM.SealedBox(combined: data), using: key, authenticating: Data("ShuaCrew/checkpoint/v1".utf8))
        let value = try JSONDecoder().decode(Checkpoint.self, from: clear)
        guard value.version == 1, value.account == account, value.installationId == installationId,
              value.deviceId == deviceId, value.macPublicKey == macPublicKey, value.devicePublicKey == devicePublicKey else { throw MobileProtocolError.malformed }
        for (id, command) in value.commands {
            guard try MobileSigning.verify(command.envelope, publicKey: devicePublicKey) else { throw MobileProtocolError.malformed }
            let decoded = try MobileCodec.command(Data(command.envelope.payload.utf8))
            let digest = SHA256.hash(data: Data(command.envelope.payload.utf8)).map { String(format: "%02x", $0) }.joined()
            guard decoded.commandId == id, decoded.installationId == installationId, decoded.deviceId == deviceId,
                  decoded.expiresAt == command.expiresAt, digest == command.digest else { throw MobileProtocolError.malformed }
        }
        guard value.commands.values.filter({ $0.status == .sending || $0.status == .waitingForMac }).count <= 20 else { throw MobileProtocolError.tooLarge }
        commands = value.commands
        isRevoked = value.revoked ?? false
        if isRevoked { paired = false; commands.removeAll() }
        snapshot = nil // Reconnect must obtain a fresh signed observation, not display a cached one as live.
        expire(now: now)
    }
    public init(account: String, installationId: String, deviceId: String, macPublicKey: Data, devicePublicKey: Data) {
        self.account = account; self.installationId = installationId; self.deviceId = deviceId
        self.macPublicKey = macPublicKey; self.devicePublicKey = devicePublicKey
    }
    public var pending: [SignedEnvelope] { commands.values.filter { $0.status == .sending || $0.status == .waitingForMac }.map(\.envelope) }
    /// Expiry forbids retry, but does not prove the Mac failed to apply an earlier delivery.
    public var acknowledgmentCandidates: [SignedEnvelope] {
        commands.values.filter { [.sending, .waitingForMac, .expired].contains($0.status) }.map(\.envelope)
    }
    public func status(_ commandId: String) -> MobileCommandStatus? { commands[commandId]?.status }
    public var statuses: [String: MobileCommandStatus] { commands.mapValues(\.status) }
    public func isStale(now: Int64) -> Bool {
        guard paired, let snapshot else { return true }
        let age = Double(now) - Double(snapshot.observedAt)
        return age >= 60000 || age < -30000
    }
    public mutating func changeAccount(to next: String?) {
        guard next != account else { return }
        account = next; snapshot = nil; commands.removeAll(); paired = false
        // The previous account's identity is not reusable. Explicit pairing creates a new state.
    }
    public mutating func acceptSnapshot(_ envelope: SignedEnvelope, account source: String) throws -> Bool {
        guard paired, account == source, try MobileSigning.verifySnapshot(envelope, publicKey: macPublicKey) else { return false }
        let value = try MobileCodec.snapshot(Data(envelope.payload.utf8))
        guard value.installationId == installationId, value.deviceId == deviceId else { return false }
        if let current = snapshot, value.sequence < current.sequence || value.observedAt <= current.observedAt { return false }
        snapshot = value; return true
    }
    public mutating func acceptRevocation(_ envelope: SignedEnvelope, account source: String, now: Int64) throws -> Bool {
        guard account == source, try MobileSigning.verify(envelope, publicKey: macPublicKey) else { return false }
        let notice = try MobileCodec.revocation(Data(envelope.payload.utf8))
        guard notice.installationId == installationId, notice.deviceId == deviceId,
              Double(notice.issuedAt) <= Double(now) + 30000, notice.expiresAt > now else { return false }
        paired = false; isRevoked = true; snapshot = nil; commands.removeAll()
        return true
    }
    public mutating func enqueue(_ envelope: SignedEnvelope, now: Int64) throws {
        guard paired, account != nil, try MobileSigning.verify(envelope, publicKey: devicePublicKey) else { throw MobileProtocolError.malformed }
        let value = try MobileCodec.command(Data(envelope.payload.utf8))
        guard value.installationId == installationId, value.deviceId == deviceId, value.issuedAt <= now, value.expiresAt > now else { throw MobileProtocolError.malformed }
        let digest = SHA256.hash(data: Data(envelope.payload.utf8)).map { String(format: "%02x", $0) }.joined()
        if let existing = commands[value.commandId] {
            guard existing.digest == digest else { throw MobileProtocolError.malformed }
            return // Retries keep the original signed bytes and never requeue terminal outcomes.
        }
        guard pending.count < 20 else { throw MobileProtocolError.tooLarge }
        commands[value.commandId] = Command(envelope: envelope, digest: digest, expiresAt: value.expiresAt, status: .sending)
    }
    public mutating func markDelivered(_ commandId: String) {
        if commands[commandId]?.status == .sending { commands[commandId]?.status = .waitingForMac }
    }
    public mutating func expire(now: Int64) {
        for (id, command) in commands where command.expiresAt <= now && (command.status == .sending || command.status == .waitingForMac) { commands[id]?.status = .expired }
        trimHistory()
    }
    private mutating func trimHistory() {
        // Pending work is never evicted. Mac audit remains the durable history; this is a
        // bounded local status cache, and the gateway independently deduplicates every retry.
        let terminal = commands.filter { $0.value.status != .sending && $0.value.status != .waitingForMac }
            .sorted { $0.value.expiresAt == $1.value.expiresAt ? $0.key < $1.key : $0.value.expiresAt > $1.value.expiresAt }
        for (id, _) in terminal.dropFirst(200) { commands[id] = nil }
    }
    public mutating func acceptAck(_ envelope: SignedEnvelope, account source: String) throws -> Bool {
        guard paired, account == source, try MobileSigning.verify(envelope, publicKey: macPublicKey) else { return false }
        let value = try MobileCodec.ack(Data(envelope.payload.utf8))
        guard value.installationId == installationId, value.deviceId == deviceId,
              let command = commands[value.commandId], command.digest == value.payloadDigest,
              let status = MobileCommandStatus(rawValue: value.state) else { return false }
        if [.applied, .rejected, .uncertain].contains(command.status) { return command.status == status }
        commands[value.commandId]?.status = status; trimHistory(); return true
    }
}
