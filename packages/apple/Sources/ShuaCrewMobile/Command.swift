import Foundation
import CoreFoundation

public struct ApprovalOffer: Codable, Sendable {
    public let version: Int
    public let installationId, deviceId, offerId, runId, approvalId, tool, inputDigest, summary, nonce: String
    public let issuedAt, expiresAt: Int64
    public let requiresPhone: Bool
}
public struct MobileAction: Codable, Sendable {
    public let kind: String
    public let offer: ApprovalOffer?
    public let allow: Bool?
    public let roomId, text: String?
    public let paused: Bool?
    public let runId: String?
}
public struct MobileCommand: Codable, Sendable {
    public let version: Int
    public let commandId, installationId, deviceId: String
    public let issuedAt, expiresAt: Int64
    public let action: MobileAction
}
extension MobileCodec {
    public static func command(_ data: Data) throws -> MobileCommand {
        guard let body = try strictJSON(data) as? [String: Any] else { throw MobileProtocolError.malformed }
        try keys(body, ["version", "commandId", "installationId", "deviceId", "issuedAt", "expiresAt", "action"])
        try identity(body); try identifier(body, "commandId"); try lifetime(body, max: 86400000)
        guard let action = body["action"] as? [String: Any], let kind = action["kind"] as? String else { throw MobileProtocolError.malformed }
        switch kind {
        case "refresh": try keys(action, ["kind"])
        case "run-stop": try keys(action, ["kind", "runId"]); try identifier(action, "runId")
        case "room-pause": try keys(action, ["kind", "roomId", "paused"]); try identifier(action, "roomId"); try boolean(action, "paused")
        case "room-message": try keys(action, ["kind", "roomId", "text"]); try identifier(action, "roomId"); try text(action, "text", max: 8000)
        case "approval":
            try keys(action, ["kind", "offer", "allow"]); try boolean(action, "allow")
            guard let offer = action["offer"] as? [String: Any] else { throw MobileProtocolError.malformed }
            try keys(offer, ["version", "installationId", "deviceId", "offerId", "runId", "approvalId", "tool", "inputDigest", "summary", "nonce", "issuedAt", "expiresAt", "requiresPhone"])
            try identity(offer); try lifetime(offer, max: 300000)
            for field in ["offerId", "runId", "approvalId", "nonce"] { try identifier(offer, field) }
            try text(offer, "tool", max: 128); try text(offer, "summary", max: 2048); try boolean(offer, "requiresPhone")
            guard let digest = offer["inputDigest"] as? String, digest.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
                  offer["deviceId"] as? String == body["deviceId"] as? String,
                  offer["installationId"] as? String == body["installationId"] as? String,
                  try integer(body, "issuedAt") >= integer(offer, "issuedAt"),
                  try integer(body, "expiresAt") <= integer(offer, "expiresAt") else { throw MobileProtocolError.malformed }
        default: throw MobileProtocolError.malformed
        }
        return try JSONDecoder().decode(MobileCommand.self, from: data)
    }
    static func keys(_ body: [String: Any], _ expected: Set<String>) throws {
        guard Set(body.keys) == expected else { throw MobileProtocolError.malformed }
    }
    static func identity(_ body: [String: Any]) throws {
        guard try integer(body, "version") == 1 else { throw MobileProtocolError.malformed }
        try identifier(body, "installationId"); try identifier(body, "deviceId")
    }
    static func identifier(_ body: [String: Any], _ name: String) throws {
        guard let value = body[name] as? String, value.range(of: "^[A-Za-z0-9_-]{1,128}$", options: .regularExpression) != nil else { throw MobileProtocolError.malformed }
    }
    static func integer(_ body: [String: Any], _ name: String) throws -> Int64 {
        guard let number = body[name] as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(), number.doubleValue.isFinite, number.doubleValue >= 0, number.doubleValue <= 9007199254740991, number.doubleValue.rounded() == number.doubleValue else { throw MobileProtocolError.malformed }
        return number.int64Value
    }
    private static func lifetime(_ body: [String: Any], max: Int64) throws {
        let start = try integer(body, "issuedAt"), end = try integer(body, "expiresAt")
        guard end > start, end - start <= max else { throw MobileProtocolError.malformed }
    }
    static func text(_ body: [String: Any], _ name: String, max: Int) throws {
        guard let value = body[name] as? String, !value.isEmpty, value.utf8.count <= max else { throw MobileProtocolError.malformed }
    }
    static func boolean(_ body: [String: Any], _ name: String) throws {
        guard let value = body[name] as? NSNumber, CFGetTypeID(value) == CFBooleanGetTypeID() else { throw MobileProtocolError.malformed }
    }
}
