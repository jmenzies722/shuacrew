import Foundation

public enum CalculatorReadback {
    public static func normalize(_ text: String, locale: Locale = Locale(identifier: "en_US")) -> String? {
        let formatter = NumberFormatter()
        formatter.locale = locale
        let grouping = formatter.groupingSeparator ?? ","
        let decimal = formatter.decimalSeparator ?? "."
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "−", with: "-")
        let escapedGrouping = NSRegularExpression.escapedPattern(for: grouping)
        let escapedDecimal = NSRegularExpression.escapedPattern(for: decimal)
        let pattern = "^-?(?:[0-9]+|[0-9]{1,3}(?:\(escapedGrouping)[0-9]{3})+)(?:\(escapedDecimal)[0-9]+)?$"
        guard value.range(of: pattern, options: .regularExpression) != nil else { return nil }
        return value.replacingOccurrences(of: grouping, with: "").replacingOccurrences(of: decimal, with: ".")
    }
}
