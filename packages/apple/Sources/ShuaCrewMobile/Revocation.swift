import Foundation

public struct MobileRevocation: Codable, Sendable {
    public let deviceId: String
    public let at, sequence: Int64
    public init(deviceId: String, at: Int64, sequence: Int64) { self.deviceId = deviceId; self.at = at; self.sequence = sequence }
}
public struct MobileRevocationNotice: Codable, Sendable {
    public let version: Int
    public let kind, installationId, deviceId: String
    public let revokedAt, issuedAt, expiresAt: Int64
}
extension MobileCodec {
    public static func revocation(_ data: Data) throws -> MobileRevocationNotice {
        guard let body = try strictJSON(data) as? [String: Any] else { throw MobileProtocolError.malformed }
        try keys(body, ["version", "kind", "installationId", "deviceId", "revokedAt", "issuedAt", "expiresAt"])
        try identity(body)
        let revoked = try integer(body, "revokedAt"), issued = try integer(body, "issuedAt"), expires = try integer(body, "expiresAt")
        guard body["kind"] as? String == "revoked", revoked <= issued, expires > issued, expires - issued <= 86400000 else { throw MobileProtocolError.malformed }
        return try JSONDecoder().decode(MobileRevocationNotice.self, from: data)
    }
}
