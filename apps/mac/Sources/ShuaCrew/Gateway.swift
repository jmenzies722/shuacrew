import Foundation
import ShuaCrewCore

/// The loopback gateway this app is a window onto. It owns every run; the app only shows them.
final class Gateway: @unchecked Sendable {
    let base: URL

    init() {
        let env = ProcessInfo.processInfo.environment
        if let url = env["SHUACREW_URL"].flatMap(URL.init(string:)) {
            base = url
        } else {
            base = URL(string: "http://127.0.0.1:\(env["SHUACREW_PORT"] ?? "7420")")!
        }
    }

    private let session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 3
        return URLSession(configuration: config)
    }()

    func healthy() async -> Bool {
        guard let (_, response) = try? await session.data(from: base.appending(path: "api/health")) else { return false }
        return (response as? HTTPURLResponse)?.statusCode == 200
    }

    func status() async throws -> CrewStatus {
        let (data, _) = try await session.data(from: base.appending(path: "api/status"))
        return try JSONDecoder().decode(CrewStatus.self, from: data)
    }

    /// Allow or deny from a notification or the menu bar. The gateway's CSRF check wants the
    /// header; a native request carries no Origin, so it counts as same-origin.
    func decide(_ approval: String, allow: Bool) async throws {
        var request = URLRequest(url: base.appending(path: "api/approvals/\(approval)"))
        request.httpMethod = "POST"
        request.setValue("1", forHTTPHeaderField: "X-ShuaCrew")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["allow": allow, "by": "mac"])
        let (_, response) = try await session.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw GatewayError.refused("The gateway didn't accept that decision.") }
    }

    func cancel(_ run: String) async throws {
        var request = URLRequest(url: base.appending(path: "api/runs/\(run)/cancel"))
        request.httpMethod = "POST"
        request.setValue("1", forHTTPHeaderField: "X-ShuaCrew")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = Data("{}".utf8)
        let (_, response) = try await session.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw GatewayError.refused("Couldn't stop that session.") }
    }
}

extension Gateway {
    /// Approve a playbook phase waiting at its gate, from a notification or the menu bar.
    func approvePhase(_ play: String, index: Int) async throws {
        var request = URLRequest(url: base.appending(path: "api/plays/\(play)/approve"))
        request.httpMethod = "POST"
        request.setValue("1", forHTTPHeaderField: "X-ShuaCrew")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["index": index])
        let (_, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw GatewayError.refused("The gateway didn't accept that approval.") }
    }
}

enum GatewayError: LocalizedError {
    case refused(String), unreachable(String)
    var errorDescription: String? {
        switch self {
        case .refused(let why), .unreachable(let why): return why
        }
    }
}

/// Starts the gateway when nothing is listening. It keeps running after the app quits: schedules,
/// heartbeats and runs in flight belong to the gateway, not to the window that started it.
enum Launcher {
    static var home: URL {
        URL(fileURLWithPath: ProcessInfo.processInfo.environment["SHUACREW_HOME"] ?? NSHomeDirectory() + "/.shuacrew")
    }
    static var log: URL { home.appending(path: "gateway.log") }

    static func repo() -> URL? {
        let candidates = [ProcessInfo.processInfo.environment["SHUACREW_REPO"], NSHomeDirectory() + "/Developer/projects/shuacrew"]
        return candidates.compactMap { $0 }.map { URL(fileURLWithPath: $0) }
            .first { FileManager.default.fileExists(atPath: $0.appending(path: "apps/gateway/src/main.ts").path) }
    }

    static let serviceLabel = "com.shuacrew.gateway"
    static var servicePlist: URL { URL(fileURLWithPath: NSHomeDirectory() + "/Library/LaunchAgents/\(serviceLabel).plist") }

    static func ensureRunning(_ gateway: Gateway) async throws {
        if await gateway.healthy() { return }
        // The always-on service owns the gateway: wake it rather than start a second one that
        // would fight it for the port.
        if FileManager.default.fileExists(atPath: servicePlist.path) {
            let kick = Process()
            kick.executableURL = URL(fileURLWithPath: "/bin/launchctl")
            kick.arguments = ["kickstart", "gui/\(getuid())/\(serviceLabel)"]
            try? kick.run()
            kick.waitUntilExit()
            for _ in 0..<80 {
                try await Task.sleep(for: .milliseconds(250))
                if await gateway.healthy() { return }
            }
            throw GatewayError.unreachable("The always-on gateway didn't answer within 20 seconds. Run `pnpm service status`, or see \(log.path).")
        }
        guard let repo = repo() else {
            throw GatewayError.unreachable("Can't find the ShuaCrew repo. Set SHUACREW_REPO, or keep it at ~/Developer/projects/shuacrew.")
        }
        try? FileManager.default.createDirectory(at: home, withIntermediateDirectories: true)
        if !FileManager.default.fileExists(atPath: log.path) { FileManager.default.createFile(atPath: log.path, contents: nil) }
        let handle = try FileHandle(forWritingTo: log)
        handle.seekToEndOfFile()

        // A login shell, so the gateway gets the PATH you have in Terminal — an app started from
        // Finder has almost none, and the gateway must find node, claude and codex.
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/zsh")
        process.arguments = ["-lc", "exec npx tsx src/main.ts"]
        process.currentDirectoryURL = repo.appending(path: "apps/gateway")
        var env = ProcessInfo.processInfo.environment
        env["SHUACREW_PORT"] = String(gateway.base.port ?? 7420)
        env["_ZO_DOCTOR"] = "0"
        process.environment = env
        process.standardOutput = handle
        process.standardError = handle
        try process.run()
        for _ in 0..<80 {
            try await Task.sleep(for: .milliseconds(250))
            if await gateway.healthy() { return }
            if !process.isRunning { throw GatewayError.unreachable("The gateway stopped as it started. Its log is at \(log.path).") }
        }
        throw GatewayError.unreachable("The gateway didn't answer within 20 seconds. Its log is at \(log.path).")
    }
}
