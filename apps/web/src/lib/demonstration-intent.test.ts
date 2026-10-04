import { expect, it } from "vitest";
import { demonstrationIntent } from "./demonstration-intent";
it("recognizes direct teaching and stopping requests", () => {
  for (const text of ["Watch me", "please watch me and learn!", "Record my task", "learn from me"]) expect(demonstrationIntent(text)).toBe("start");
  for (const text of ["Stop watching", "stop recording", "I'm done teaching."]) expect(demonstrationIntent(text)).toBe("stop");
});
it("does not start capture for quoted, negated or ambiguous discussion", () => {
  for (const text of ['Do not watch me', 'What does watch me mean?', 'He said "watch me"', 'watch me tomorrow', 'stop watching videos']) expect(demonstrationIntent(text)).toBeNull();
});
