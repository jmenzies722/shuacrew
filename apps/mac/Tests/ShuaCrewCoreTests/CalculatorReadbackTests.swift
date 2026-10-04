import Foundation
import Testing
@testable import ShuaCrewCore

@Suite struct CalculatorReadbackTests {
    @Test func rejectsUnstructuredOrMalformedResults() {
        #expect(CalculatorReadback.normalize("6,016") == "6016")
        #expect(CalculatorReadback.normalize("6.016", locale: Locale(identifier: "de_DE")) == "6016")
        #expect(CalculatorReadback.normalize("6,01,6") == nil)
        #expect(CalculatorReadback.normalize("Answer: 6016") == nil)
        #expect(CalculatorReadback.normalize("128 × 47") == nil)
        #expect(CalculatorReadback.normalize("NaN") == nil)
    }
}
