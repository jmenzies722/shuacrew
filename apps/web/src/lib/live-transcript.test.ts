import { expect, it } from "vitest";
import { liveTranscript, liveNotchText } from "./live-transcript";
it("shows an authoritative result once instead of repeating its voice paraphrase and correction", () => {
  const lines = liveTranscript([{ kind: "line", role: "user", text: "Type a test", final: true }, { kind: "step", text: "Checking" }, { kind: "result", text: "No action ran.", corrected: "Done" }, { kind: "line", role: "assistant", text: "Sorry, no action ran.", final: true }]);
  expect(lines).toHaveLength(2); expect(lines[1]).toMatchObject({ text: "No action ran.", corrected: true });
});
it("keeps separate user turns and partial transcription in conversation order", () => {
  const lines = liveTranscript([{ kind: "line", role: "user", text: "Hi", final: true }, { kind: "line", role: "assistant", text: "Hello", final: true }, { kind: "line", role: "user", text: "Open Text", final: false }]);
  expect(lines.map(l => l.text)).toEqual(["Hi", "Hello", "Open Text"]); expect(lines[2]?.partial).toBe(true);
});

it("keeps work status out of the notch text while retaining the user's request", () => {
  expect(liveNotchText([{ kind: "line", role: "user", text: "Open Notes", final: true }, { kind: "step", text: "Working on it" }])).toBe("Open Notes");
  expect(liveNotchText([{ kind: "step", text: "Working on it" }])).toBe("");
});
it("shows all received text without waiting for audio playback", () => {
  const feed = [{ kind: "line" as const, role: "assistant" as const, text: "Full answer not yet spoken", final: false }];
  expect(liveNotchText(feed, "Full answer")).toBe("Full answer not yet spoken");
  expect(liveNotchText(feed)).toBe("Full answer not yet spoken");
});

it("keeps every conversation turn beyond the previous eight-line window", () => {
  const feed = Array.from({length:12}, (_,i) => ({kind:"line" as const,role:"user" as const,text:`Message ${i}`,final:true}));
  expect(liveTranscript(feed)).toHaveLength(12);
  expect(liveTranscript(feed)[0]?.text).toBe("Message 0");
});

it("retains separate assistant messages within one turn", () => {
  expect(liveTranscript([{kind:"line",role:"assistant",text:"First sentence.",final:true},{kind:"line",role:"assistant",text:"Second sentence.",final:true}]).map(line => line.text)).toEqual(["First sentence.","Second sentence."]);
});
