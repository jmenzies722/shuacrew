#if os(iOS) || os(watchOS)
import Foundation
@preconcurrency import WatchConnectivity
#if os(iOS)
import UIKit
#endif

public enum WatchConnectivityError: Error { case unavailable, rejected, timeout, queueFull }

/// SDK callbacks can race timeout/cancellation. The lock gives the continuation one owner.
private final class WatchReply: @unchecked Sendable {
    private let lock = NSLock()
    private var continuation: CheckedContinuation<Data, any Error>?
    private var result: Result<Data, any Error>?
    func install(_ continuation: CheckedContinuation<Data, any Error>) {
        lock.lock()
        if let result { lock.unlock(); continuation.resume(with: result) }
        else { self.continuation = continuation; lock.unlock() }
    }
    func finish(_ result: Result<Data, any Error>) {
        lock.lock()
        guard self.result == nil else { lock.unlock(); return }
        self.result = result; let continuation = self.continuation; self.continuation = nil
        lock.unlock(); continuation?.resume(with: result)
    }
}
private final class WatchCallback: @unchecked Sendable {
    let invoke: (Data) -> Void
    init(_ invoke: @escaping (Data) -> Void) { self.invoke = invoke }
}

/// The only WatchConnectivity owner in each process. No cloud or signing credentials here.
@MainActor public final class WatchConnectivityChannel: NSObject, WatchRelayTransport, WCSessionDelegate {
    private let session: WCSession
    private let handler: @Sendable (Data) async throws -> Data
    private var stopped = false
    private var requests: [UUID: WatchReply] = [:]
    #if os(iOS)
    private var background: [UUID: PhoneRelayBackgroundTask] = [:]
    #endif
    public init(handler: @escaping @Sendable (Data) async throws -> Data = { _ in throw WatchConnectivityError.unavailable }) {
        self.session = .default; self.handler = handler
        super.init()
        if WCSession.isSupported() { session.delegate = self; session.activate() }
    }
    public func stop() {
        stopped = true
        for request in requests.values { request.finish(.failure(CancellationError())) }
        requests = [:]
        for transfer in session.outstandingUserInfoTransfers { transfer.cancel() }
        #if os(iOS)
        for task in background.values { task.cancel() }; background = [:]
        #endif
        session.delegate = nil
    }
    private func active() async throws {
        guard !stopped, WCSession.isSupported() else { throw WatchConnectivityError.unavailable }
        for _ in 0..<20 {
            try Task.checkCancellation()
            guard !stopped else { throw CancellationError() }
            if session.activationState == .activated { return }
            try await Task.sleep(for: .milliseconds(100))
        }
        throw WatchConnectivityError.unavailable
    }
    public func request(_ data: Data) async throws -> Data {
        guard data.count <= WatchRelayCodec.maximumBytes else { throw MobileProtocolError.tooLarge }
        try await active()
        guard session.isReachable else { throw WatchConnectivityError.unavailable }
        guard requests.count < 4 else { throw WatchConnectivityError.queueFull }
        let id = UUID(), reply = WatchReply(); requests[id] = reply
        defer { requests[id] = nil }
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                reply.install(continuation)
                session.sendMessageData(data, replyHandler: { bytes in
                    if bytes.count > WatchRelayCodec.maximumBytes { reply.finish(.failure(MobileProtocolError.tooLarge)) }
                    else { reply.finish(.success(bytes)) }
                }, errorHandler: { _ in reply.finish(.failure(WatchConnectivityError.unavailable)) })
                Task {
                    try? await Task.sleep(for: .seconds(20))
                    reply.finish(.failure(WatchConnectivityError.timeout))
                }
            }
        } onCancel: { reply.finish(.failure(CancellationError())) }
    }
    public func enqueue(_ data: Data) async throws {
        guard data.count <= WatchRelayCodec.maximumBytes else { throw MobileProtocolError.tooLarge }
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        guard WatchRelayCodec.canQueue(data, now: now) else { throw WatchConnectivityError.rejected }
        try await active()
        if session.isReachable {
            let response = try WatchRelayCodec.response(await request(data))
            guard response.accepted else { throw WatchConnectivityError.rejected }
            return
        }
        let transfers = session.outstandingUserInfoTransfers.filter { transfer in
            guard let packet = transfer.userInfo["packet"] as? Data else { return true }
            if !WatchRelayCodec.canQueue(packet, now: now) { transfer.cancel(); return false }
            return true
        }
        if transfers.contains(where: { ($0.userInfo["packet"] as? Data) == data }) { return }
        guard transfers.count < 20 else { throw WatchConnectivityError.queueFull }
        _ = session.transferUserInfo(["packet": data])
    }
    nonisolated public func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: (any Error)?) {}
    nonisolated public func session(_ session: WCSession, didReceiveMessageData messageData: Data, replyHandler: @escaping (Data) -> Void) {
        let callback = WatchCallback(replyHandler)
        Task { @MainActor [weak self] in
            guard let self, !self.stopped, messageData.count <= WatchRelayCodec.maximumBytes else { callback.invoke(Data(#"{"error":"unavailable"}"#.utf8)); return }
            do { callback.invoke(try await self.handler(messageData)) }
            catch { callback.invoke(Data(#"{"error":"not-accepted"}"#.utf8)) }
        }
    }
    nonisolated public func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        guard let data = userInfo["packet"] as? Data, data.count <= WatchRelayCodec.maximumBytes else { return }
        Task { @MainActor [weak self] in
            guard let self, !self.stopped else { return }
            #if os(iOS)
            guard self.background.count < 20 else { return }
            let id = UUID(), task = PhoneRelayBackgroundTask()
            self.background[id] = task
            task.start { [weak self] in
                guard let self else { return }
                _ = try? await self.handler(data)
                self.background[id] = nil
            }
            #else
            // Watch requests its verified observations while active. No background action ingress.
            #endif
        }
    }
    #if os(iOS)
    nonisolated public func sessionDidBecomeInactive(_ session: WCSession) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            for reply in self.requests.values { reply.finish(.failure(CancellationError())) }
            for task in self.background.values { task.cancel() }; self.background = [:]
        }
    }
    nonisolated public func sessionDidDeactivate(_ session: WCSession) {
        Task { @MainActor [weak self] in guard let self, !self.stopped else { return }; self.session.activate() }
    }
    #endif
}

#if os(iOS)
@MainActor private final class PhoneRelayBackgroundTask {
    private var identifier: UIBackgroundTaskIdentifier = .invalid
    private var task: Task<Void, Never>?
    func start(_ operation: @escaping @MainActor () async -> Void) {
        identifier = UIApplication.shared.beginBackgroundTask(withName: "ShuaCrew Watch relay") { [weak self] in
            Task { @MainActor in self?.cancel() }
        }
        task = Task { await operation(); finish() }
    }
    func cancel() { task?.cancel(); finish() }
    private func finish() {
        guard identifier != .invalid else { return }
        UIApplication.shared.endBackgroundTask(identifier); identifier = .invalid
    }
    isolated deinit { task?.cancel(); finish() }
}
#endif
#endif
