import { expect, it } from "vitest";
import { liveTranscript } from "./live-transcript";
it("shows an authoritative result once instead of repeating its voice paraphrase and correction", () => {
  const lines = liveTranscript([{ kind: "line", role: "user", text: "Type a test", final: true }, { kind: "step", text: "Checking" }, { kind: "result", text: "No action ran.", corrected: "Done" }, { kind: "line", role: "assistant", text: "Sorry, no action ran.", final: true }]);
  expect(lines).toHaveLength(2); expect(lines[1]).toMatchObject({ text: "No action ran.", corrected: true });
});
it("keeps separate user turns and partial transcription in conversation order", () => {
  const lines = liveTranscript([{ kind: "line", role: "user", text: "Hi", final: true }, { kind: "line", role: "assistant", text: "Hello", final: true }, { kind: "line", role: "user", text: "Open Text", final: false }]);
  expect(lines.map(l => l.text)).toEqual(["Hi", "Hello", "Open Text"]); expect(lines[2]?.partial).toBe(true);
});
