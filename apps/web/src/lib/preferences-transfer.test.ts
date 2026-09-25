import { expect, it } from "vitest";
import { exportPreferences, importPreferences } from "./preferences-transfer";
import { DEFAULT_APPEARANCE } from "./appearance";

const memory = (seed: Record<string, string> = {}) => { const m = new Map(Object.entries(seed)); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }; };

it("round-trips known groups and nothing else", () => {
  const from = memory({ "shuacrew.appearance": JSON.stringify({ accent: "blue", density: "compact" }), "shuacrew.recentRepos": "[\"/secret/path\"]", "shuacrew.diffSplit": "1" });
  const file = exportPreferences(from);
  expect(Object.keys(file.groups).sort()).toEqual(["appearance", "diffSplit"]);
  expect(JSON.stringify(file)).not.toContain("/secret/path");
  const to = memory();
  expect(importPreferences(JSON.parse(JSON.stringify(file)), to).sort()).toEqual(["appearance", "diffSplit"]);
  expect(JSON.parse(to.m.get("shuacrew.appearance")!)).toMatchObject({ accent: "blue", density: "compact" });
});

it("validates every value and rejects files that aren't ours", () => {
  const to = memory();
  importPreferences({ app: "shuacrew", kind: "preferences", version: 1, groups: { appearance: { accent: "<script>", density: "compact" }, workspace: { dailyTokenBudget: -5, runtime: "../../etc" }, evil: { x: 1 }, terminalFont: "999" } }, to);
  expect(JSON.parse(to.m.get("shuacrew.appearance")!)).toMatchObject({ accent: DEFAULT_APPEARANCE.accent, density: "compact" }); // an invalid accent falls back to the default
  expect(JSON.parse(to.m.get("shuacrew.workspace")!)).toMatchObject({ dailyTokenBudget: null, runtime: "" });
  expect(to.m.has("evil")).toBe(false);
  expect(to.m.has("shuacrew.terminalFont")).toBe(false);
  expect(() => importPreferences({ groups: {} }, to)).toThrow(/not a ShuaCrew settings file/);
});
