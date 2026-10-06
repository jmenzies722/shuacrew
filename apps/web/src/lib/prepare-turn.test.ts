import { expect, it, vi } from "vitest";

vi.mock("./api", () => ({ api: vi.fn(() => Promise.resolve({ prepared: true })) }));

it("asks once per session per minute, however much you type", async () => {
  const { prepareTurn } = await import("./prepare-turn");
  const { api } = await import("./api");
  expect(prepareTurn("r1", 1_000)).toBe(true);
  expect(prepareTurn("r1", 20_000)).toBe(false);
  expect(prepareTurn("r2", 20_000)).toBe(true);
  expect(prepareTurn("r1", 62_000)).toBe(true);
  expect(vi.mocked(api).mock.calls.map((c) => c[0])).toEqual(["/api/runs/r1/prepare", "/api/runs/r2/prepare", "/api/runs/r1/prepare"]);
});
