import { expect, it } from "vitest";
import { judgeRace, type RaceStanding } from "./race.js";

const s = (run: string, runtime: string, over: Partial<RaceStanding> = {}): RaceStanding => ({ run, runtime, status: "reviewing", verification: "verified", command: "pnpm test", files: 2, ...over });

it("the session that proved its change wins, and the reason names both", () => {
  expect(judgeRace(s("a", "claude"), s("b", "codex", { verification: "unverified", command: undefined }))).toEqual({ winner: "a", reason: "Claude proved its change (pnpm test); Codex did not check its change." });
  expect(judgeRace(s("a", "claude", { verification: "failing" }), s("b", "codex"))).toEqual({ winner: "b", reason: "Codex proved its change (pnpm test); Claude's checks are failing (pnpm test)." });
});

it("ranks: verified, then unverified, then failing checks, then no change, then not finished", () => {
  const order = [s("v", "claude"), s("u", "claude", { verification: "unverified" }), s("f", "claude", { verification: "failing" }), s("n", "claude", { files: 0, verification: undefined }), s("x", "claude", { status: "failed" })];
  for (let i = 0; i < order.length; i++) for (let j = i + 1; j < order.length; j++) {
    expect(judgeRace(order[i]!, { ...order[j]!, runtime: "codex" }).winner, `${order[i]!.run} vs ${order[j]!.run}`).toBe(order[i]!.run);
    expect(judgeRace({ ...order[j]!, runtime: "codex" }, order[i]!).winner, `${order[j]!.run} vs ${order[i]!.run} (swapped)`).toBe(order[i]!.run);
  }
});

it("never picks between equals: two verified changes are your call", () => {
  expect(judgeRace(s("a", "claude"), s("b", "codex"))).toEqual({ winner: null, reason: "Both proved their change. Compare the two and keep the one you prefer." });
  expect(judgeRace(s("a", "claude", { status: "failed" }), s("b", "codex", { status: "cancelled" }))).toEqual({ winner: null, reason: "Neither finished." });
  const neither = judgeRace(s("a", "claude", { verification: "unverified" }), s("b", "codex", { verification: "unverified" }));
  expect(neither.winner).toBeNull();
  expect(neither.reason).toBe("No winner: Claude did not check its change, and neither did Codex.");
  expect(judgeRace(s("a", "claude", { files: 0, verification: undefined }), s("b", "codex", { files: 0, verification: undefined })).reason).toBe("No winner: Claude changed no code, and neither did Codex.");
  expect(judgeRace(s("a", "claude", { verification: "failing" }), s("b", "codex", { verification: "failing" })).reason).toBe("No winner: Claude's checks are failing (pnpm test), and so are Codex's.");
});
