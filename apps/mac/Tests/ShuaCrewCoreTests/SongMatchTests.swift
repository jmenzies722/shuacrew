import Foundation
import ShuaCrewCore
import Testing

// Real results from Apple's catalog search for these asks (September 2026).
private let sleepy = [
    SongMatch.Candidate(title: "it ain't nuthin", artist: "sleepy hollow"),
    SongMatch.Candidate(title: "Ain't Nun (feat. Dracodontjam)", artist: "Sleepy Hallow"),
    SongMatch.Candidate(title: "Cannonball Blues (Live)", artist: "Sleepy Hollow Hog Stompers & Jerry Garcia"),
]

@Test func picksTheSongMeantEvenMisheard() {
    #expect(SongMatch.best(for: "sleepy hollow aint nun", in: sleepy) == 1)
    #expect(SongMatch.best(for: "Ain't Nun by Sleepy Hallow", in: sleepy) == 1)
    let flex = [SongMatch.Candidate(title: "Rich Flex", artist: "Drake & 21 Savage"), SongMatch.Candidate(title: "Flex (Ooh, Ooh, Ooh)", artist: "Rich Homie Quan")]
    #expect(SongMatch.best(for: "drake rich flex", in: flex) == 0)
}

@Test func saysNoRatherThanGuessWildly() {
    #expect(SongMatch.best(for: "quantum physics lecture", in: sleepy) == nil)
    #expect(SongMatch.best(for: "play the", in: sleepy) == nil)
}

@Test func libraryTitleDropsFeatures() {
    #expect(SongMatch.coreTitle("Ain't Nun (feat. Dracodontjam)") == "Ain't Nun")
    #expect(SongMatch.coreTitle("Bohemian Rhapsody - Remastered 2011") == "Bohemian Rhapsody")
    #expect(SongMatch.sound("hollow") == SongMatch.sound("hallow"))
}

@Test func moodsMapToGenresInYourLibrary() {
    #expect(SongMatch.moodGenres("Chill").contains("R&B"))
    #expect(SongMatch.moodGenres("upbeat").contains("Hip-Hop"))
    #expect(SongMatch.moodGenres("jazz").isEmpty) // a genre, not a mood: searched as is
}
