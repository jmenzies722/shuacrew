import { expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { AppleSpeech, appleVoiceId, appleVoices } from "./apple-speech.js";
import { SpeechService, validateSpeechRequest } from "./speech.js";

const binary = fileURLToPath(new URL("./fixtures/apple-worker.mjs", import.meta.url));

it("names Apple voices inside the gateway's id pattern, Premium first", () => {
  expect(appleVoiceId("com.apple.voice.premium.en-US.Zoe", "premium")).toBe("apple-zoe-premium");
  const voices = appleVoices([
    { identifier: "com.apple.voice.enhanced.en-GB.Daniel", name: "Daniel (Enhanced)", language: "en-GB", quality: "enhanced", gender: "male" },
    { identifier: "com.apple.voice.premium.en-US.Zoe", name: "Zoe (Premium)", language: "en-US", quality: "premium", gender: "female" },
  ]);
  expect(voices.map(v => [v.id, v.name])).toEqual([["apple-zoe-premium", "Zoe (Apple Premium)"], ["apple-daniel-enhanced", "Daniel (Apple Enhanced)"]]);
  expect(() => appleVoices([{ identifier: "../../bad;rm", name: "x", language: "en", quality: "premium", gender: "" }])).toThrow();
});

it("accepts Apple voice ids that aren't in the manifest", () => {
  expect(validateSpeechRequest({ id: "a", generation: 1, voiceId: "apple-zoe-premium", text: "Hi", speed: 1 }).voiceId).toBe("apple-zoe-premium");
});

it("lists Apple voices in status and speaks them with Apple's identifier", async () => {
  const apple = new AppleSpeech({ home: "/tmp", binary });
  const speech = new SpeechService({ home: "/tmp", command: "must-not-run", apple });
  try {
    await apple.refresh();
    expect(speech.status().voices.map(v => v.id)).toContain("apple-zoe-premium");
    const chunks = [];
    for await (const chunk of speech.synthesize({ id: "s1", generation: 1, voiceId: "apple-zoe-premium", text: "Hello there.", speed: 1 }, new AbortController().signal)) chunks.push(chunk);
    expect(chunks.map(c => c.type)).toEqual(["audio", "done"]);
    const audio = chunks[0]!.type === "audio" ? Buffer.from(chunks[0]!.data, "base64") : Buffer.alloc(0);
    expect(audio.subarray(44).toString()).toBe("com.apple.voice.premium.en-US.Zoe");
    await expect(async () => { for await (const _ of speech.synthesize({ id: "s2", generation: 1, voiceId: "apple-nobody-premium", text: "Hi", speed: 1 }, new AbortController().signal)) void _; }).rejects.toThrow(/isn't installed/);
  } finally { speech.close(); }
});
