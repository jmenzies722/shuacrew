import Foundation
import Observation
import LocalAuthentication
import Security
import UIKit

/// What the Mac's pairing QR carries (POST /api/phone/pair on the gateway).
struct SparkPairing: Codable, Equatable, Sendable {
    var v: Int
    var host: String
    var port: Int
    var key: String
    var name: String
}

struct CrewRun: Identifiable, Hashable, Sendable {
    let id: String
    let title: String
    let status: String
    let ticker: String
    let updatedAt: Double
    var active: Bool { ["queued", "planning", "running", "awaiting_approval", "reviewing"].contains(status) }
    var finished: Bool { ["done", "merged"].contains(status) }
}

struct CrewApproval: Identifiable, Hashable, Sendable {
    let id: String
    let run: String?
    let tool: String
    let risk: String
    let reason: String
    let summary: String
    let at: Double
}

/// The live line to the Mac: a paired key, the gateway's own snapshot, and its event stream over Tailscale.
/// The snapshot is the truth; events only say "something changed, look again" (plus a pulse for Spark),
/// so the phone never re-implements the gateway's projections.
@MainActor @Observable final class SparkLink {
    enum State: Equatable { case unpaired, connecting, live, offline(String) }

    private(set) var pairing: SparkPairing?
    private(set) var state: State = .unpaired
    private(set) var runs: [CrewRun] = []
    private(set) var approvals: [CrewApproval] = []
    private(set) var todayRuns = 0
    /// When the crew last did something visible (a tool call, a turn): Spark looks busy while this is recent.
    private(set) var lastActivity: Date?
    /// A run that just finished well: Spark celebrates it.
    private(set) var celebrating: CrewRun?
    var error: String?

    private var socket: URLSessionWebSocketTask?
    private var loop: Task<Void, Never>?
    private var refreshTask: Task<Void, Never>?
    private var backoff: Double = 1
    private let session = URLSession(configuration: .ephemeral)
    private static let activityKinds: Set<String> = ["tool.called", "turn.started", "agent.thinking", "subagent.started", "file.changed", "check.ran"]
    private static let changeKinds: Set<String> = ["run.created", "run.status", "approval.requested", "approval.decided", "turn.completed", "run.archived"]

    init() {
        pairing = Keychain.load()
        // Development: `simctl launch` with SIMCTL_CHILD_SPARK_PAIRING='{json}' pairs the simulator without a camera.
        if let dev = ProcessInfo.processInfo.environment["SPARK_PAIRING"], let p = try? JSONDecoder().decode(SparkPairing.self, from: Data(dev.utf8)) { pairing = p }
        state = pairing == nil ? .unpaired : .connecting
    }

    var activeRuns: [CrewRun] { runs.filter(\.active).sorted { $0.updatedAt > $1.updatedAt } }

    // MARK: Pairing

    func pair(with text: String) async {
        do {
            let p = try JSONDecoder().decode(SparkPairing.self, from: Data(text.trimmingCharacters(in: .whitespacesAndNewlines).utf8))
            guard p.v == 1, p.key.count >= 32, p.port > 0 else { throw URLError(.badURL) }
            pairing = p
            _ = try await request("GET", "/phone/hello")
            try Keychain.save(p)
            error = nil
            start()
        } catch {
            pairing = Keychain.load()
            self.error = "That code didn't work. Make sure Tailscale is on for both devices, then scan a fresh code on the Mac."
        }
    }

    func unpair() {
        stop()
        Keychain.clear()
        pairing = nil; runs = []; approvals = []
        state = .unpaired
    }

    // MARK: Connection

    func start() {
        guard pairing != nil, loop == nil else { return }
        loop = Task { [weak self] in await self?.run() }
    }

    func stop() {
        loop?.cancel(); loop = nil
        socket?.cancel(with: .goingAway, reason: nil); socket = nil
    }

    private func run() async {
        while !Task.isCancelled, let pairing {
            state = .connecting
            do {
                let head = try await refresh()
                var request = URLRequest(url: URL(string: "ws://\(pairing.host):\(pairing.port)/phone/ws")!)
                request.setValue(pairing.key, forHTTPHeaderField: "x-shuacrew-key")
                let ws = session.webSocketTask(with: request)
                socket = ws
                ws.resume()
                try await ws.send(.string(#"{"type":"subscribe","after":\#(head)}"#))
                state = .live
                backoff = 1
                let pinger = Task { [weak ws] in
                    while !Task.isCancelled {
                        try? await Task.sleep(for: .seconds(20))
                        try? await ws?.send(.string(#"{"type":"ping"}"#))
                    }
                }
                defer { pinger.cancel() }
                while !Task.isCancelled {
                    let message = try await ws.receive()
                    if case .string(let text) = message { receive(text) }
                }
            } catch {
                guard !Task.isCancelled else { return }
                state = .offline((error as? URLError)?.code == .userAuthenticationRequired ? "This iPhone isn't paired anymore" : "Can't reach \(pairing.name)")
            }
            socket = nil
            try? await Task.sleep(for: .seconds(backoff))
            backoff = min(backoff * 2, 30)
        }
    }

    private func receive(_ text: String) {
        guard let message = try? JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any],
              message["type"] as? String == "events", message["replay"] as? Bool != true,
              let events = message["events"] as? [[String: Any]] else { return }
        let kinds = events.compactMap { $0["kind"] as? String }
        if kinds.contains(where: Self.activityKinds.contains) { lastActivity = .now }
        if kinds.contains(where: Self.changeKinds.contains) { scheduleRefresh() }
    }

    /// Bursts of events (a run finishing writes several) become one fetch.
    private func scheduleRefresh() {
        refreshTask?.cancel()
        refreshTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
            _ = try? await self?.refresh()
        }
    }

    @discardableResult private func refresh() async throws -> Int {
        let data = try await request("GET", "/phone/api/snapshot")
        guard let snapshot = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw URLError(.cannotParseResponse) }
        let before = Dictionary(uniqueKeysWithValues: runs.map { ($0.id, $0.status) })
        let next = ((snapshot["runs"] as? [String: [String: Any]]) ?? [:]).values.compactMap(Self.run(from:))
        let waiting = ((snapshot["approvals"] as? [String: [String: Any]]) ?? [:]).values.compactMap(Self.approval(from:)).sorted { $0.at < $1.at }
        if waiting.count > approvals.count { UINotificationFeedbackGenerator().notificationOccurred(.warning) }
        if let done = next.first(where: { $0.finished && before[$0.id] != nil && before[$0.id] != $0.status }) {
            celebrating = done
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            Task { [weak self] in
                try? await Task.sleep(for: .seconds(4))
                if self?.celebrating == done { self?.celebrating = nil }
            }
        }
        runs = next
        approvals = waiting
        todayRuns = ((snapshot["today"] as? [String: Any])?["runs"] as? Int) ?? 0
        return (snapshot["head"] as? Int) ?? 0
    }

    // MARK: Actions

    /// Allowing needs Face ID: a phone can be picked up by someone else. Denying is always safe.
    func decide(_ approval: CrewApproval, allow: Bool) async {
        do {
            if allow {
                let context = LAContext()
                context.localizedCancelTitle = "Keep waiting"
                guard try await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Allow \(approval.tool) on your Mac") else { return }
            }
            _ = try await request("POST", "/phone/api/approvals/\(approval.id)", body: ["allow": allow, "by": "you (iPhone)"])
            approvals.removeAll { $0.id == approval.id }
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            scheduleRefresh()
        } catch { self.error = "That decision didn't reach the Mac. It's still waiting there." }
    }

    func start(ask: String) async -> Bool {
        let ask = ask.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !ask.isEmpty else { return false }
        do {
            _ = try await request("POST", "/phone/api/runs", body: ["ask": ask, "title": String(ask.prefix(80))])
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            lastActivity = .now
            scheduleRefresh()
            return true
        } catch { self.error = "The crew didn't get that. Check the connection and try again."; return false }
    }

    func cancel(_ run: CrewRun) async {
        _ = try? await request("POST", "/phone/api/runs/\(run.id)/cancel", body: [:])
        scheduleRefresh()
    }

    // MARK: Plumbing

    private func request(_ method: String, _ path: String, body: [String: Any]? = nil) async throws -> Data {
        guard let pairing, let url = URL(string: "http://\(pairing.host):\(pairing.port)\(path)") else { throw URLError(.badURL) }
        var request = URLRequest(url: url, timeoutInterval: 8)
        request.httpMethod = method
        request.setValue(pairing.key, forHTTPHeaderField: "x-shuacrew-key")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "content-type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await session.data(for: request)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        if code == 401 { throw URLError(.userAuthenticationRequired) }
        guard (200..<300).contains(code) else { throw URLError(.badServerResponse) }
        return data
    }

    private static func run(from j: [String: Any]) -> CrewRun? {
        guard let id = j["id"] as? String, let status = j["status"] as? String, j["archived"] as? Bool != true else { return nil }
        return CrewRun(id: id, title: (j["title"] as? String) ?? "Untitled", status: status, ticker: (j["ticker"] as? String) ?? "", updatedAt: (j["updatedAt"] as? Double) ?? 0)
    }

    private static func approval(from j: [String: Any]) -> CrewApproval? {
        guard let id = j["id"] as? String, let tool = j["tool"] as? String else { return nil }
        let input = j["input"] as? [String: Any]
        // What a person needs to judge it: the command, the file, or the URL, never the whole payload.
        let summary = (input?["command"] ?? input?["file_path"] ?? input?["path"] ?? input?["url"]) as? String
            ?? (input.flatMap { try? JSONSerialization.data(withJSONObject: $0) }.map { String(decoding: $0, as: UTF8.self) } ?? "")
        return CrewApproval(id: id, run: j["run"] as? String, tool: tool, risk: (j["risk"] as? String) ?? "", reason: (j["reason"] as? String) ?? "",
                            summary: String(summary.prefix(300)), at: (j["at"] as? Double) ?? 0)
    }
}

/// The pairing key lives in the Keychain, this device only: it never syncs to iCloud or lands in a backup.
private enum Keychain {
    static let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "dev.shuacrew.spark-link", kSecAttrAccount as String: "pairing"]
    static func save(_ pairing: SparkPairing) throws {
        clear()
        var item = query
        item[kSecValueData as String] = try JSONEncoder().encode(pairing)
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else { throw URLError(.cannotCreateFile) }
    }
    static func load() -> SparkPairing? {
        var q = query
        q[kSecReturnData as String] = true
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return try? JSONDecoder().decode(SparkPairing.self, from: data)
    }
    static func clear() { SecItemDelete(query as CFDictionary) }
}
