import Foundation
import ShuaCrewCore
import Testing

@Test func exactTitleWinsOverLookalikes() {
    #expect(ItemMatch.pick("Birthday", titles: ["Birthday party planning", "Birthday", "Call mom"]) == .one(1))
    #expect(ItemMatch.pick("my dentist appointment", titles: ["Dentist appointment", "Dentist bill"]) == .one(0))
}

@Test func asksWhichOneRatherThanGuessing() {
    #expect(ItemMatch.pick("laundry", titles: ["Laundry", "Laundry"]) == .several([0, 1]))
    #expect(ItemMatch.pick("dentist", titles: ["Dentist appointment", "Dentist bill"]) == .several([0, 1]))
    #expect(ItemMatch.pick("gym", titles: ["Laundry", "Clean room"]) == .none)
    #expect(ItemMatch.pick("the", titles: ["The thing"]) == .none) // nothing real was asked for
}

@Test func aDayNarrowsIt() {
    let cal = Calendar(identifier: .gregorian)
    let mon = cal.date(from: DateComponents(year: 2026, month: 9, day: 28, hour: 10))!, tue = cal.date(from: DateComponents(year: 2026, month: 9, day: 29, hour: 10))!
    #expect(ItemMatch.pick("standup", titles: ["Standup", "Standup"], dates: [mon, tue], on: tue, calendar: cal) == .one(1))
}

@Test func deletesManyAfterOneYes() {
    let titles = ["Clean Room", "Clean Room", "GYM", "Organize GitHub", "Organize Resume", "Laundry"]
    let lists = ["Chores", "Chores", "Daily", "Desk Work", "Desk Work", "Chores"]
    // Named ones: both copies of a recurring chore, the one title containing a word, and what didn't match is reported.
    let m = ItemMatch.pickMany(["Clean Room", "gym", "github", "organize", "Taxes"], titles: titles)
    #expect(m.picked == [0, 1, 2, 3])
    #expect(m.unclear == ["organize"]) // two different titles: left alone
    #expect(m.missing == ["Taxes"])
    // Everything, or everything in one list.
    #expect(ItemMatch.pickMany([], titles: titles, all: true).picked == [0, 1, 2, 3, 4, 5])
    #expect(ItemMatch.pickMany([], titles: titles, lists: lists, all: true, list: "desk work").picked == [3, 4])
}
