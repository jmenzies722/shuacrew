import { expect, it } from "vitest";
import { healthChecks, type HealthFacts } from "./health.js";

const now = 1_000_000;
const good: HealthFacts = {
  runtimes: [{ id: "claude", label: "Claude", installed: true, signedIn: true, limitedUntil: 0 }, { id: "codex", label: "Codex", installed: true, signedIn: true, limitedUntil: 0 }],
  speech: { state: "ready", firstAudioMs: 320 }, transcription: { ffmpeg: true, whisper: true, model: true }, chrome: { connected: true }, diskFreeGb: 48, memoryMb: 300, now,
};
const by = (f: HealthFacts, id: string) => healthChecks(f).find((c) => c.id === id)!;

it("all green when everything works", () => {
  expect(healthChecks(good).every((c) => c.status === "ok")).toBe(true);
  expect(by(good, "voice").detail).toBe("Audio generated in 0.3 s. Playback not verified.");
});
it("one brain out is amber (Spark uses the other); both out is red", () => {
  const one = { ...good, runtimes: [{ ...good.runtimes[0]!, limitedUntil: now + 30 * 60_000 }, good.runtimes[1]!] };
  expect(by(one, "runtime-claude")).toMatchObject({ status: "warn" });
  expect(by(one, "runtime-claude").detail).toContain("30 more minutes");
  const both = { ...good, runtimes: good.runtimes.map((r) => ({ ...r, signedIn: false })) };
  expect(by(both, "runtime-claude").status).toBe("fail");
  expect(by(both, "runtime-codex").fix?.label).toBe("Sign in");
});
it("flags a voice that doesn't play or starts slowly, and missing transcription tools", () => {
  expect(by({ ...good, speech: { state: "ready", firstAudioMs: null, error: "timed out" } }, "voice").status).toBe("fail");
  expect(by({ ...good, speech: { state: "ready", firstAudioMs: 2600 } }, "voice").status).toBe("warn");
  const cold = by({ ...good, speech: { state: "ready", firstAudioMs: 300, coldMs: 6700 } }, "voice");
  expect(cold.status).toBe("ok"); expect(cold.detail).toContain("took 6.7 s while the voice loaded");
  const hear = by({ ...good, transcription: { ffmpeg: true, whisper: false, model: false } }, "hearing");
  expect(hear).toMatchObject({ status: "fail" }); expect(hear.detail).toContain("whisper-cpp, a speech model");
});
it("Chrome not connected is only amber; low disk is amber then red", () => {
  expect(by({ ...good, chrome: { connected: false } }, "chrome").status).toBe("warn");
  expect(by({ ...good, diskFreeGb: 10 }, "disk").status).toBe("warn");
  expect(by({ ...good, diskFreeGb: 2 }, "disk").status).toBe("fail");
});
it('does not mark unknown authentication or an empty runtime registry ready',()=>{
 expect(by({...good,runtimes:[]},'runtime').status).toBe('fail');
 expect(by({...good,runtimes:[{...good.runtimes[1]!,signedIn:null}]},'runtime-codex').status).toBe('warn');
});
it('describes synthesis and local transcription scope without claiming device playback',()=>{
 expect(by(good,'voice').detail).toContain('Audio generated');
 expect(by(good,'voice').detail).toContain('Playback not verified');
 expect(by({...good,transcription:{ffmpeg:false,whisper:false,model:false}},'hearing').detail).toContain('Local transcription');
});
