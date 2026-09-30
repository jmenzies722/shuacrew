import Foundation

/// A date Spark wrote, however it wrote it: "2026-10-01T11:10:00" (seconds, no zone — the one that used to fail, so the
/// event was never added and a reminder lost its time), "…T11:10", "…T11:10:00-04:00", "…Z", "2026-10-01 11:10", or
/// just "2026-10-01" (`dateOnly`). No zone means this Mac's time zone.
public enum LocalDate {
    public static func parse(_ s: String, timeZone: TimeZone = .current) -> (date: Date, dateOnly: Bool)? {
        let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
        for options: ISO8601DateFormatter.Options in [[.withInternetDateTime, .withFractionalSeconds], [.withInternetDateTime]] {
            let f = ISO8601DateFormatter(); f.formatOptions = options
            if let d = f.date(from: t) { return (d, false) }
        }
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = timeZone
        for format in ["yyyy-MM-dd'T'HH:mm:ss.SSS", "yyyy-MM-dd'T'HH:mm:ss", "yyyy-MM-dd'T'HH:mm", "yyyy-MM-dd HH:mm:ss", "yyyy-MM-dd HH:mm"] {
            f.dateFormat = format
            if let d = f.date(from: t) { return (d, false) }
        }
        f.dateFormat = "yyyy-MM-dd"
        if t.count == 10, let d = f.date(from: t) { return (d, true) }
        return nil
    }
}
