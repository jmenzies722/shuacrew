import { expect, it } from "vitest";
import { demonstrationIntent } from "./demonstration-intent";
it("recognizes direct teaching and stopping requests", () => {
  for (const text of ["Watch me", "please watch me and learn!", "Record my task", "learn from me"]) expect(demonstrationIntent(text)).toBe("start");
  for (const text of ["Stop watching", "stop recording", "I'm done teaching."]) expect(demonstrationIntent(text)).toBe("stop");
});
it("does not start capture for quoted, negated or ambiguous discussion", () => {
  for (const text of ['Do not watch me', 'What does watch me mean?', 'He said "watch me"', 'watch me tomorrow', 'stop watching videos']) expect(demonstrationIntent(text)).toBeNull();
});
it('recognizes explicit replay requests without matching quoted or negated text',async()=>{
 const {replayIntent}=await import('./demonstration-intent');expect(replayIntent('Replay workflow Morning note.')).toBe('Morning note');expect(replayIntent('Replay my last workflow')).toBe('last');expect(replayIntent('Do not replay my last workflow')).toBeNull();expect(replayIntent('What does replay mean?')).toBeNull();
});
