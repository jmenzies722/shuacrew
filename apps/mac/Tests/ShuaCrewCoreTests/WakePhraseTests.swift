import ShuaCrewCore
import Testing

@Test func wakesOnAGreetingAndTheCompanionsName() {
  #expect(WakePhrase.matches("Hey Spark", names: ["spark"]))
  #expect(WakePhrase.matches("okay spark what's next", names: ["spark"]))
  #expect(WakePhrase.matches("hey shoe a", names: ["spark", "shua"]))
  #expect(WakePhrase.matches("Hey, Shua!", names: ["spark", "shua"]))
}

@Test func staysAsleepForEverythingElse() {
  #expect(!WakePhrase.matches("they sparkle", names: ["spark"]))
  #expect(!WakePhrase.matches("spark plug", names: ["spark"]))
  #expect(!WakePhrase.matches("hey there", names: ["spark", "shua"]))
  #expect(!WakePhrase.matches("hey", names: ["spark"]))
}
