import Foundation

public struct MobileV2Action: Decodable, Sendable {
    public let kind: String
    public let roomId, text, recipient, replyTo, requestId, runId: String?
    public let paused, allow: Bool?
    public let offer: ApprovalOffer?
}
public struct MobileV2Command: Decodable, Sendable {
    public let version: Int
    public let installationId, deviceId, commandId: String
    public let issuedAt, expiresAt: Int64
    public let action: MobileV2Action
}
public struct MobileV2Member: Decodable, Sendable {
    public let id, name, role, color, glyph: String
}
public struct MobileV2Message: Decodable, Sendable {
    public let id, author, text: String
    public let at: Int64
    public let recipient, replyTo, runId: String?
}
public struct MobileV2QueueEntry: Decodable, Sendable {
    public let requestId, text, state: String
    public let recipient, replyTo, runId: String?
    public let issuedAt, expiresAt: Int64
}
public struct MobileV2Room: Decodable, Sendable {
    public let id, title, coordinatorId: String
    public let paused, truncated: Bool
    public let members: [MobileV2Member]
    public let messages: [MobileV2Message]
    public let queue: [MobileV2QueueEntry]
}
public struct MobileV2Work: Decodable, Sendable {
    public let id, roomId, requestId, memberId, title, status: String
    public let sourceRunId: String?
    public let dependencyIds: [String]
    public let updatedAt: Int64
}
public struct MobileV2Artifact: Decodable, Sendable {
    public let id, title: String
    public let available: Bool
}
public struct MobileV2Result: Decodable, Sendable {
    public let id, roomId, runId, requestId, memberId, summary, state, verification: String
    public let artifacts: [MobileV2Artifact]
}
public struct MobileV2Snapshot: Decodable, Sendable {
    public let version: Int
    public let installationId, deviceId: String
    public let sequence, observedAt: Int64
    public let rooms: [MobileV2Room]
    public let work: [MobileV2Work]
    public let results: [MobileV2Result]
    public let offers: [ApprovalOffer]
    public let usage: MobileUsage
    public let truncated: Bool
}

/// Strict version-specific decoder. Call only after verifying the v2 signing domain.
/// These models are deliberately Decodable: synthesized optional encoding would omit
/// required explicit nulls, so command construction must use the wire builder.
public enum MobileV2Codec {
    public static func signingBytes(_ payload: String) -> Data { Data("ShuaCrew/mobile/v2\n\(payload)".utf8) }
    private static func object(_ data: Data, limit: Int) throws -> [String: Any] {
        guard let body = try MobileCodec.strictJSON(data, limit: limit) as? [String: Any], try MobileCodec.integer(body, "version") == 2 else { throw MobileProtocolError.malformed }
        return body
    }
    private static func nullableID(_ body: [String: Any], _ field: String) throws {
        if body[field] is NSNull { return }; try MobileCodec.identifier(body, field)
    }
    private static func uuid(_ body: [String: Any], _ field: String) throws {
        guard let value = body[field] as? String,
              value.range(of: "^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", options: [.regularExpression, .caseInsensitive]) != nil else { throw MobileProtocolError.malformed }
    }
    private static func values(_ body: [String: Any], _ field: String, _ options: Set<String>) throws {
        guard let value = body[field] as? String, options.contains(value) else { throw MobileProtocolError.malformed }
    }
    private static func collection(_ body: [String: Any], _ field: String, max: Int) throws -> [[String: Any]] {
        guard let values = body[field] as? [[String: Any]], values.count <= max else { throw MobileProtocolError.malformed }; return values
    }
    public static func command(_ data: Data) throws -> MobileV2Command {
        let body = try object(data, limit: 16384)
        try MobileCodec.keys(body, ["version", "installationId", "deviceId", "commandId", "issuedAt", "expiresAt", "action"])
        guard var action = body["action"] as? [String: Any], let kind = action["kind"] as? String else { throw MobileProtocolError.malformed }
        var legacy = body; legacy["version"] = 1
        if kind == "room-message" {
            try MobileCodec.keys(action, ["kind", "roomId", "text", "recipient", "replyTo"])
            try nullableID(action, "recipient"); try nullableID(action, "replyTo")
            action.removeValue(forKey: "recipient"); action.removeValue(forKey: "replyTo")
        } else if kind == "queue-cancel" {
            try MobileCodec.keys(action, ["kind", "roomId", "requestId"])
            try MobileCodec.identifier(action, "roomId"); try uuid(action, "requestId")
            action = ["kind": "refresh"]
        }
        legacy["action"] = action
        // Reuse the existing exact audience, offer binding, lifetime and UTF-8 rules.
        _ = try MobileCodec.command(JSONSerialization.data(withJSONObject: legacy))
        return try JSONDecoder().decode(MobileV2Command.self, from: data)
    }
    public static func snapshot(_ data: Data) throws -> MobileV2Snapshot {
        let body = try object(data, limit: 524288)
        try MobileCodec.keys(body, ["version", "installationId", "deviceId", "sequence", "observedAt", "rooms", "work", "results", "offers", "usage", "truncated"])
        let rooms = try collection(body, "rooms", max: 50), work = try collection(body, "work", max: 100), results = try collection(body, "results", max: 100)
        var legacyRooms = [[String: Any]](), roomIDs = Set<String>()
        for room in rooms {
            try MobileCodec.keys(room, ["id", "title", "coordinatorId", "paused", "members", "messages", "queue", "truncated"])
            try MobileCodec.identifier(room, "id"); try MobileCodec.identifier(room, "coordinatorId")
            guard let roomID = room["id"] as? String, roomIDs.insert(roomID).inserted else { throw MobileProtocolError.malformed }
            for member in try collection(room, "members", max: 16) {
                try MobileCodec.keys(member, ["id", "name", "role", "color", "glyph"])
                try MobileCodec.identifier(member, "id"); try MobileCodec.text(member, "name", max: 128); try MobileCodec.text(member, "role", max: 256)
                guard let color = member["color"] as? String, color.range(of: "^#[a-fA-F0-9]{6}$", options: .regularExpression) != nil,
                      let glyph = member["glyph"] as? String, glyph.range(of: "^[A-Za-z0-9_-]{1,64}$", options: .regularExpression) != nil else { throw MobileProtocolError.malformed }
            }
            var legacyMessages = [[String: Any]]()
            for message in try collection(room, "messages", max: 50) {
                try MobileCodec.keys(message, ["id", "author", "text", "at", "recipient", "replyTo", "runId"])
                try MobileCodec.identifier(message, "author")
                for field in ["recipient", "replyTo", "runId"] { try nullableID(message, field) }
                legacyMessages.append(message.filter { ["id", "author", "text", "at"].contains($0.key) })
            }
            for queued in try collection(room, "queue", max: 20) {
                try MobileCodec.keys(queued, ["requestId", "text", "recipient", "replyTo", "issuedAt", "expiresAt", "state", "runId"])
                try uuid(queued, "requestId"); try MobileCodec.text(queued, "text", max: 8000)
                for field in ["recipient", "replyTo", "runId"] { try nullableID(queued, field) }
                _ = try MobileCodec.integer(queued, "issuedAt"); _ = try MobileCodec.integer(queued, "expiresAt")
                try values(queued, "state", ["pending", "started", "cancelled", "expired", "rejected"])
            }
            var legacyRoom = room.filter { ["id", "title", "paused", "truncated"].contains($0.key) }; legacyRoom["messages"] = legacyMessages; legacyRooms.append(legacyRoom)
        }
        var legacyRuns = [[String: Any]]()
        for item in work {
            try MobileCodec.keys(item, ["id", "roomId", "requestId", "memberId", "sourceRunId", "dependencyIds", "title", "status", "updatedAt"])
            try uuid(item, "requestId"); try MobileCodec.identifier(item, "memberId"); try nullableID(item, "sourceRunId"); _ = try MobileCodec.integer(item, "updatedAt")
            guard let roomID = item["roomId"] as? String, roomIDs.contains(roomID), let dependencies = item["dependencyIds"] as? [String], dependencies.count <= 8 else { throw MobileProtocolError.malformed }
            for id in dependencies { try MobileCodec.identifier(["id": id], "id") }
            var legacyRun = item.filter { ["id", "roomId", "title", "status"].contains($0.key) }; legacyRun["summary"] = ""; legacyRuns.append(legacyRun)
        }
        for result in results {
            try MobileCodec.keys(result, ["id", "roomId", "runId", "requestId", "memberId", "summary", "state", "verification", "artifacts"])
            for field in ["id", "roomId", "runId", "memberId"] { try MobileCodec.identifier(result, field) }
            guard let roomID = result["roomId"] as? String, roomIDs.contains(roomID) else { throw MobileProtocolError.malformed }
            try uuid(result, "requestId"); try MobileCodec.text(result, "summary", max: 2048)
            try values(result, "state", ["completed", "partial", "unavailable"]); try values(result, "verification", ["recorded", "not-recorded", "unavailable"])
            for artifact in try collection(result, "artifacts", max: 20) {
                try MobileCodec.keys(artifact, ["id", "title", "available"]); try MobileCodec.identifier(artifact, "id"); try MobileCodec.text(artifact, "title", max: 256); try MobileCodec.boolean(artifact, "available")
            }
        }
        var legacy = body.filter { !["work", "results"].contains($0.key) }; legacy["version"] = 1; legacy["rooms"] = legacyRooms; legacy["runs"] = legacyRuns
        _ = try MobileCodec.snapshot(JSONSerialization.data(withJSONObject: legacy))
        return try JSONDecoder().decode(MobileV2Snapshot.self, from: data)
    }
}
