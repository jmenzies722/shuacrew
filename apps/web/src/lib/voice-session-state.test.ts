import { expect, it } from "vitest";
import { initialVoiceState, reduceVoice } from "./voice-session-state";
it("stops playback before cancellation and retains uncertain text", () => {
  const state = { ...initialVoiceState(), capture: "listening" as const, turn: "waiting" as const, playback: "speaking" as const };
  const stopped = reduceVoice(state, { type: "userSpeech" });
  expect(stopped.playback).toBe("idle"); expect(stopped.turn).toBe("cancelling");
  expect(stopped.generation).toBe(1);
  const uncertain = reduceVoice(stopped, { type: "cancellationUnknown", transcript: "Change the plan" });
  expect(uncertain.turn).toBe("uncertain"); expect(uncertain.pendingTranscript).toBe("Change the plan");
  expect(reduceVoice(uncertain, { type: "start" }).turn).toBe("uncertain");
});
it("rejects stale audio after interruption, approval and end", () => {
  let state = reduceVoice(initialVoiceState(), { type: "start" });
  const old = state.generation;
  state = reduceVoice(state, { type: "approval" });
  expect(reduceVoice(state, { type: "audioChunk", generation: old }).playback).toBe("idle");
  state = reduceVoice(state, { type: "end" });
  expect(state.capture).toBe("off");
  expect(reduceVoice(state, { type: "audioChunk", generation: state.generation }).playback).toBe("idle");
});
