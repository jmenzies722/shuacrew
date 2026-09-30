import Testing
@testable import ShuaCrewCore

@Suite struct BluetoothMatchTests {
    // The devices actually paired with this Mac.
    let names = ["Yealink WH64", "Shua Airpods", "MX MCHNCL M", "Josh’s Apple\u{a0}Watch", "MX Master 4", "MX Anywhere 2S", "Shua [iPhone]", "Comet"]

    @Test func byName() {
        #expect(BluetoothMatch.pick("my AirPods", names: names) == .one(1))
        #expect(BluetoothMatch.pick("airpods", names: names) == .one(1))
        #expect(BluetoothMatch.pick("Yealink", names: names) == .one(0))
        #expect(BluetoothMatch.pick("MX Master", names: names) == .one(4))
        #expect(BluetoothMatch.pick("my iPhone", names: names) == .one(6))
    }

    @Test func byKindWhenTheNameDoesntSayIt() {
        // "headphones" isn't in any name: AirPods and the Yealink headset both look like headphones → ask which.
        #expect(BluetoothMatch.pick("my headphones", names: names) == .several([0, 1]))
        #expect(BluetoothMatch.pick("my mouse", names: names) == .several([2, 4, 5]))
        #expect(BluetoothMatch.pick("my earbuds", names: ["Shua Airpods", "MX Master 4"]) == .one(0))
    }

    @Test func nothingFitsMeansNone() {
        #expect(BluetoothMatch.pick("my speaker", names: names) == .none)
        #expect(BluetoothMatch.pick("toaster", names: names) == .none)
    }
}
