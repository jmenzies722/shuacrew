import Foundation

public struct MacObservationRegistry {
    private let generation: Int
    private var active = true
    private var observation: (id: String, pid: Int32, window: String, geometry: String, time: Double)?
    private var actions = Set<String>()
    public init(generation: Int) { self.generation = generation }
    public mutating func record(id: String, pid: Int32, window: String, geometry: String, now: Double) { observation = (id, pid, window, geometry, now) }
    public func valid(id: String, generation: Int, pid: Int32, window: String, geometry: String, now: Double) -> Bool {
        guard active, generation == self.generation, let observation else { return false }
        return id == observation.id && pid == observation.pid && window == observation.window && geometry == observation.geometry &&
            now.isFinite && now >= observation.time && now - observation.time <= 2000
    }
    public mutating func claim(_ id: String, limit: Int) -> Bool {
        guard active, !id.isEmpty, limit > 0, actions.count < min(12, limit), !actions.contains(id) else { return false }
        actions.insert(id)
        return true
    }
    public mutating func invalidate() { active = false; observation = nil }
}
