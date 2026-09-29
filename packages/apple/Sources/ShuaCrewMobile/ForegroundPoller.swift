import Foundation

/// A foreground owner can wake immediately without waiting out an old retry delay.
/// stop removes the operation; later scene events cannot silently enable sync again.
@MainActor public final class ForegroundPoller {
    private var operation: (@MainActor @Sendable () async -> TimeInterval?)?
    private var task: Task<Void, Never>?
    private var active = false
    public init() {}
    isolated deinit { task?.cancel() }
    public func configure(_ operation: @escaping @MainActor @Sendable () async -> TimeInterval?) {
        task?.cancel(); task = nil
        self.operation = operation
    }
    public func setActive(_ active: Bool) {
        self.active = active
        if active { wake() } else { task?.cancel(); task = nil }
    }
    public func wake() {
        guard active, let operation else { return }
        task?.cancel()
        task = Task {
            while !Task.isCancelled {
                guard let delay = await operation(), !Task.isCancelled,
                      delay.isFinite, delay >= 0, delay <= 86400 else { return }
                do { try await Task.sleep(for: .seconds(max(0.1, delay))) } catch { return }
            }
        }
    }
    public func stop() {
        task?.cancel(); task = nil; operation = nil; active = false
    }
}
