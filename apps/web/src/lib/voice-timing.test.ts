import { expect, it } from "vitest";
import { voiceDurations, voiceTimingSummary } from "./voice-timing";
it("reports measured stages and leaves missing or unordered samples unknown", () => {
  expect(voiceDurations({ endpoint: 100, transcribed: 140 }).transcriptionMs).toBe(40);
  expect(voiceDurations({ endpoint: 140, transcribed: 100 }).transcriptionMs).toBeNull();
  expect(voiceDurations({ endpoint: 100 }).firstAudioMs).toBeNull();
  expect(voiceDurations({ endpoint: 100, transcribed: 140, firstText: 200, firstAudio: 260, playback: 280 })).toEqual({ transcriptionMs: 40, providerMs: 60, synthesisMs: 60, playbackMs: 20, firstAudioMs: 180 });
});
it("summarizes only observed first-audio samples", () => {
  expect(voiceTimingSummary([])).toEqual({ count: 0, medianMs: null, p95Ms: null });
  expect(voiceTimingSummary([{ firstAudioMs: 100 }, { firstAudioMs: null }, { firstAudioMs: 300 }, { firstAudioMs: 200 }])).toEqual({ count: 3, medianMs: 200, p95Ms: 300 });
});
