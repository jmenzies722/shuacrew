import Foundation
import CoreFoundation

public struct MobileAck: Codable, Sendable {
    public let version: Int
    public let installationId, deviceId, commandId, payloadDigest, state, reason: String
    public let at: Int64
}
public struct MobileMessage: Codable, Sendable {
    public let id, author, text: String
    public let at: Int64
}
public struct MobileRoom: Codable, Sendable {
    public let id, title: String
    public let paused, truncated: Bool
    public let messages: [MobileMessage]
}
public struct MobileRun: Codable, Sendable {
    public let id, roomId, title, status, summary: String
}
public struct MobileUsage: Codable, Sendable {
    public let inputTokens, outputTokens, cacheTokens, records: Int64
    public let costUsd: Double?
}
public struct MobileSnapshot: Codable, Sendable {
    public let version: Int
    public let installationId, deviceId: String
    public let sequence, observedAt: Int64
    public let rooms: [MobileRoom]
    public let runs: [MobileRun]
    public let offers: [ApprovalOffer]
    public let usage: MobileUsage
    public let truncated: Bool
}

extension MobileCodec {
    public static func ack(_ data: Data) throws -> MobileAck {
        guard let body = try strictJSON(data) as? [String: Any] else { throw MobileProtocolError.malformed }
        try keys(body, ["version", "installationId", "deviceId", "commandId", "payloadDigest", "state", "reason", "at"])
        try identity(body); try identifier(body, "commandId"); try identifier(body, "reason")
        _ = try integer(body, "at")
        guard let digest = body["payloadDigest"] as? String, digest.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
              let state = body["state"] as? String, ["applied", "rejected", "expired", "uncertain"].contains(state) else { throw MobileProtocolError.malformed }
        return try JSONDecoder().decode(MobileAck.self, from: data)
    }

    public static func snapshot(_ data: Data) throws -> MobileSnapshot {
        guard let body = try strictJSON(data, limit: 524288) as? [String: Any] else { throw MobileProtocolError.malformed }
        try keys(body, ["version", "installationId", "deviceId", "sequence", "observedAt", "rooms", "runs", "offers", "usage", "truncated"])
        try identity(body); _ = try integer(body, "sequence"); _ = try integer(body, "observedAt"); try boolean(body, "truncated")
        guard let rooms = body["rooms"] as? [[String: Any]], rooms.count <= 50,
              let runs = body["runs"] as? [[String: Any]], runs.count <= 100,
              let offers = body["offers"] as? [[String: Any]], offers.count <= 50,
              let usage = body["usage"] as? [String: Any] else { throw MobileProtocolError.malformed }
        for room in rooms {
            try keys(room, ["id", "title", "paused", "messages", "truncated"])
            try identifier(room, "id"); try text(room, "title", max: 256); try boolean(room, "paused"); try boolean(room, "truncated")
            guard let messages = room["messages"] as? [[String: Any]], messages.count <= 50 else { throw MobileProtocolError.malformed }
            for message in messages {
                try keys(message, ["id", "author", "text", "at"]); try identifier(message, "id")
                try text(message, "author", max: 128); try text(message, "text", max: 8000); _ = try integer(message, "at")
            }
        }
        for run in runs {
            try keys(run, ["id", "roomId", "title", "status", "summary"])
            try identifier(run, "id"); try identifier(run, "roomId"); try text(run, "title", max: 256)
            guard let status = run["status"] as? String, ["queued", "planning", "running", "awaiting_approval", "paused", "done", "failed", "cancelled", "reviewing", "merged"].contains(status),
                  let summary = run["summary"] as? String, summary.utf8.count <= 2048 else { throw MobileProtocolError.malformed }
        }
        // Reuse strict approval validation, including offer audience and lifetime binding.
        for offer in offers {
            let wrapper: [String: Any] = ["version": 1, "installationId": body["installationId"]!, "deviceId": body["deviceId"]!, "commandId": "snapshot_validation", "issuedAt": offer["issuedAt"] ?? NSNull(), "expiresAt": offer["expiresAt"] ?? NSNull(), "action": ["kind": "approval", "offer": offer, "allow": false]]
            _ = try command(JSONSerialization.data(withJSONObject: wrapper))
        }
        try keys(usage, ["inputTokens", "outputTokens", "cacheTokens", "records", "costUsd"])
        for field in ["inputTokens", "outputTokens", "cacheTokens", "records"] { _ = try integer(usage, field) }
        if !(usage["costUsd"] is NSNull) {
            guard let cost = usage["costUsd"] as? NSNumber, CFGetTypeID(cost) != CFBooleanGetTypeID(), cost.doubleValue.isFinite, cost.doubleValue >= 0 else { throw MobileProtocolError.malformed }
        }
        return try JSONDecoder().decode(MobileSnapshot.self, from: data)
    }
}
