import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { journalStats, ShuaJournal, toEntry } from "./shua-journal.js";

it("keeps only well-formed steps", () => {
  expect(toEntry({ kind: "click", how: "target", label: "Send", ok: true, message: "Clicked", ms: 412.4 }, 5)).toEqual({ at: 5, kind: "click", how: "target", label: "Send", ok: true, message: "Clicked", ms: 412 });
  expect(toEntry({ kind: "rm -rf", ok: true })).toBeNull();
  expect(toEntry({ kind: "press", label: "x" })).toBeNull();
  expect(toEntry({ kind: "press", how: "wild", ok: false, message: "m" }, 1)?.how).toBe("none");
});

it("measures accuracy by how the target was found, and groups failures", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "journal-")), j = new ShuaJournal(path.join(dir, "j.jsonl"));
  const add = (o: Record<string, unknown>, at: number) => j.add(toEntry(o, at)!);
  add({ kind: "click", how: "target", ok: true, message: "ok" }, 100);
  add({ kind: "click", how: "target", ok: true, message: "ok" }, 200);
  add({ kind: "click", how: "position", ok: false, message: "The click target is missing or ambiguous. No click was sent; look again." }, 300);
  add({ kind: "press", how: "name", ok: false, message: "The click target is missing or ambiguous. No click was sent; look again." }, 400);
  add({ kind: "type", how: "name", ok: true, message: "typed" }, 1);
  const s = journalStats(j.read(), 50);
  expect(s.total).toBe(4);
  expect(s.rate).toBe(0.5);
  expect(s.byHow.target).toEqual({ total: 2, ok: 2 });
  expect(s.byKind.click).toEqual({ total: 3, ok: 2 });
  expect(s.failures).toEqual([{ why: "The click target is missing or ambiguous", count: 2 }]);
  expect(s.recent[0]!.at).toBe(400);
  expect(journalStats([], 0).rate).toBeNull();
});

it("reports voice speed as p50 and p90 by nearest rank", async () => {
  const { voiceStats, rank } = await import("./shua-journal.js");
  expect(rank([], 0.5)).toBeNull();
  expect(rank([100, 200, 300, 400, 500, 600, 700, 800, 900, 1000], 0.9)).toBe(900);
  const s = voiceStats([{ at: 1, ms: 5000, mode: "live" }, { at: 10, ms: 800, mode: "live" }, { at: 11, ms: 1200, mode: "live" }, { at: 12, ms: 2400, mode: "push" }], 5);
  expect(s).toMatchObject({ count: 3, p50: 1200, p90: 2400, best: 800, last: 2400 });
  expect(s.byMode.live).toEqual({ count: 2, p50: 800 });
});

it("journals in-app presses by name", () => {
  expect(toEntry({ kind: "ui", how: "name", label: "Above", ok: true, message: "Pressed “Above” on Studio floor", app: "ShuaCrew", ms: 120 }, 1)).toMatchObject({ kind: "ui", how: "name", ok: true });
});
