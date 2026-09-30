import Foundation
import ShuaCrewCore
import Testing

private let ny = TimeZone(identifier: "America/New_York")!
private func local(_ s: String) -> String? {
    guard let r = LocalDate.parse(s, timeZone: ny) else { return nil }
    let f = DateFormatter(); f.timeZone = ny; f.dateFormat = "yyyy-MM-dd HH:mm"; return f.string(from: r.date) + (r.dateOnly ? " (day)" : "")
}

@Test func readsTheDateSparkActuallySent() {
    #expect(local("2026-10-01T11:10:00") == "2026-10-01 11:10") // the SpaceX launch that never reached the calendar
    #expect(local("2026-10-01T11:10") == "2026-10-01 11:10")
    #expect(local("2026-10-01T11:10:00.000") == "2026-10-01 11:10")
    #expect(local("2026-10-01 11:10") == "2026-10-01 11:10")
    #expect(local("2026-10-01T15:10:00Z") == "2026-10-01 11:10")
    #expect(local("2026-10-01T11:10:00-04:00") == "2026-10-01 11:10")
    #expect(local("2026-10-01") == "2026-10-01 00:00 (day)")
    #expect(local("tomorrow") == nil)
}
