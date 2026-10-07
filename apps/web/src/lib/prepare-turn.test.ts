import { expect, it, vi } from "vitest";

vi.mock("./api", () => ({ api: vi.fn(() => Promise.resolve({ prepared: true })), prepareRun: vi.fn(() => Promise.resolve("r_reserved")) }));

it("asks once per session per minute, however much you type", async () => {
  const { prepareTurn } = await import("./prepare-turn");
  const { api } = await import("./api");
  expect(prepareTurn("r1", 1_000)).toBe(true);
  expect(prepareTurn("r1", 20_000)).toBe(false);
  expect(prepareTurn("r2", 20_000)).toBe(true);
  expect(prepareTurn("r1", 62_000)).toBe(true);
  expect(vi.mocked(api).mock.calls.map((c) => c[0])).toEqual(["/api/runs/r1/prepare", "/api/runs/r2/prepare", "/api/runs/r1/prepare"]);
});

it("reserves a new session once the draft says enough, and hands the id over only if it still matches", async () => {
  const { newSessionReservation } = await import("./prepare-turn");
  const { prepareRun } = await import("./api");
  const r = newSessionReservation();
  expect(r.typed({ ask: "fix it" }, 0)).toBe(false); // too little to route on
  expect(r.typed({ ask: "Write the pricing page copy", runtime: "codex" }, 0)).toBe(true);
  expect(r.typed({ ask: "Write the pricing page copy for the audit", runtime: "codex" }, 5_000)).toBe(false); // same choice: kept
  expect(vi.mocked(prepareRun)).toHaveBeenCalledTimes(1);
  expect(await r.take({ runtime: "claude" })).toBeUndefined(); // you switched agents before sending
  r.typed({ ask: "Write the pricing page copy", runtime: "codex" }, 6_000);
  expect(await r.take({ runtime: "codex" })).toBe("r_reserved");
  expect(await r.take({ runtime: "codex" })).toBeUndefined(); // used once
});
