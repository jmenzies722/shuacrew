import Foundation
import ShuaCrewCore
import Testing

@Test func voiceChoicesPersistAndInvalidSpeedDoesNotOverwriteThem() throws {
    let suite = "ShuaCrew.tests.voice.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    var preferences = VoicePreferences()
    preferences.voiceID = "installed-voice"
    preferences.speed = 0.9
    try preferences.save(to: defaults)
    #expect(VoicePreferences.read(from: defaults).voiceID == "installed-voice")
    #expect(VoicePreferences.read(from: defaults).speed == 0.9)
    preferences.speed = 9
    #expect(throws: (any Error).self) { try preferences.save(to: defaults) }
    #expect(VoicePreferences.read(from: defaults).speed == 0.9)
}

@Test func voiceSelectionHonorsExplicitChoiceAndFallsBackToEnglishMale() {
    let voices = [
        LocalVoice(id: "female", name: "Female", language: "en-US", gender: "female", quality: 3),
        LocalVoice(id: "male", name: "Male", language: "en-GB", gender: "male", quality: 2),
        LocalVoice(id: "other", name: "Other", language: "de-DE", gender: "male", quality: 3),
    ]
    #expect(VoicePreferences().resolvedVoice(in: voices)?.id == "male")
    var preferences = VoicePreferences()
    preferences.voiceID = "female"
    #expect(preferences.resolvedVoice(in: voices)?.id == "female")
    preferences.voiceID = "removed"
    #expect(preferences.resolvedVoice(in: voices)?.id == "male")
    #expect(preferences.resolvedVoice(in: []) == nil)
}

@Test func automaticVoicePrefersDanielOverLegacyVoicesAtEqualQuality() {
    let voices = [
        LocalVoice(id: "legacy", name: "Fred", language: "en-US", gender: "male", quality: 1),
        LocalVoice(id: "modern", name: "Daniel", language: "en-GB", gender: "male", quality: 1),
    ]
    #expect(VoicePreferences().resolvedVoice(in: voices)?.id == "modern")
}
