import { expect, it } from "vitest";
import { STUCK_START, errorLine, muteStuck, stuckSignal, type StuckState } from "./stuck";

const run = (glances: Array<[number, string, string]>, state: StuckState = STUCK_START) => {
  const offers = [];
  for (const [at, app, text] of glances) { const r = stuckSignal(state, { at, app, text }); state = r.state; if (r.offer) offers.push({ at, ...r.offer }); }
  return { state, offers };
};
const s = 1000;

it("fingerprints an error line, blurring numbers and paths", () => {
  expect(errorLine("ok\nError: cannot find module /Users/a/x.ts line 42")?.print).toBe(errorLine("Error: cannot find module /Users/b/y.ts line 7")?.print);
  expect(errorLine("All tests passed")).toBeNull();
});

it("offers once when an error stays on screen, then cools down", () => {
  const e = "npm ERR! build failed with exit code 1";
  const { offers } = run([[0, "Terminal", e], [15 * s, "Terminal", e], [30 * s, "Terminal", e], [45 * s, "Terminal", e], [60 * s, "Terminal", e]]);
  expect(offers).toHaveLength(1);
  expect(offers[0]).toMatchObject({ at: 30 * s, kind: "error", app: "Terminal" });
});

it("stays quiet about an error that just flashes by, or while you read normal pages", () => {
  expect(run([[0, "Terminal", "Error: nope"], [15 * s, "Terminal", "all good"], [30 * s, "Safari", "Weather today 72°"]]).offers).toHaveLength(0);
});

it("notices the same error coming back after you tried something", () => {
  const e = "TypeError: undefined is not a function";
  const { offers } = run([[0, "Code", e], [15 * s, "Code", "editing…"], [30 * s, "Code", e], [45 * s, "Code", "saving"], [60 * s, "Code", e]]);
  expect(offers.map((o) => o.kind)).toEqual(["error"]);
});

it("notices searching for help again and again", () => {
  const { offers } = run([[0, "Safari", "how to fix cors error - Google"], [15 * s, "Safari", "cors not working stack overflow"], [30 * s, "Safari", "why won't fetch send cookies help"]]);
  expect(offers).toMatchObject([{ kind: "search" }]);
});

it("'Not now' mutes that thing for half an hour", () => {
  const e = "fatal: not a git repository";
  const first = run([[0, "Terminal", e], [15 * s, "Terminal", e], [30 * s, "Terminal", e]]);
  const muted = muteStuck(first.state, first.offers[0]!.key, 30 * s);
  const later = run([[6 * 60 * s, "Terminal", e], [6 * 60 * s + 15 * s, "Terminal", e], [6 * 60 * s + 30 * s, "Terminal", e]], muted);
  expect(later.offers).toHaveLength(0);
});
