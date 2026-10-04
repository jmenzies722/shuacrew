import { expect, it, vi } from "vitest";
import { NativePlayback } from "./native-playback";

it("silences immediately and requires a completed new user turn before resuming", () => {
  const change = vi.fn(), playback = new NativePlayback(change);
  playback.event({ type: "turn.created", turn: { id: "old", role: "assistant" } });
  playback.stop();
  expect(change).toHaveBeenLastCalledWith(true);
  playback.event({ type: "turn.done", turn: { id: "old", role: "assistant" } });
  playback.event({ type: "turn.created", turn: { id: "late", role: "assistant" } });
  expect(playback.muted).toBe(true);
  playback.event({ type: "turn.created", turn: { id: "new-user", role: "user" } });
  playback.event({ type: "turn.created", turn: { id: "backchannel", role: "assistant" } });
  expect(playback.muted).toBe(true);
  playback.event({ type: "turn.done", turn: { id: "new-user", role: "user" } });
  playback.event({ type: "turn.created", turn: { id: "answer", role: "assistant" } });
  expect(playback.muted).toBe(false);
  expect(change).toHaveBeenLastCalledWith(false);
});

it("does not treat an existing or repeated user turn as a new request", () => {
  const playback = new NativePlayback(() => {});
  playback.event({ type: "turn.created", turn: { id: "existing", role: "user" } });
  playback.stop();
  playback.event({ type: "turn.created", turn: { id: "existing", role: "user" } });
  playback.event({ type: "turn.done", turn: { id: "existing", role: "user" } });
  playback.event({ type: "turn.created", turn: { id: "late-answer", role: "assistant" } });
  expect(playback.muted).toBe(true);
});
