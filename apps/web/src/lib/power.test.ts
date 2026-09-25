import { expect, it } from "vitest";
import { DEFAULT_POWER, parsePower } from "./power";

it("keeps valid snippets and presets, drops reserved names, duplicates and junk", () => {
  const p = parsePower({
    snippets: [{ name: "review", text: "a" }, { name: "review", text: "dup" }, { name: "skill", text: "reserved" }, { name: "Bad Name", text: "x" }, { name: "ok", text: "" }],
    presets: [{ id: "ship", label: "Ship", effort: "turbo", runtime: "../x" }, { id: "ship", label: "dup" }, { id: "", label: "no id" }],
    wins: "fireworks", flow: "yes",
  });
  expect(p.snippets).toEqual([{ name: "review", text: "a" }]);
  expect(p.presets).toEqual([{ id: "ship", label: "Ship", runtime: "", model: "", effort: "", autopilot: false, task: false, prefix: "" }]);
  expect(p.wins).toBe("off"); expect(p.flow).toBe(false);
});
it("starts new users with the built-in snippets and presets", () => {
  expect(parsePower(null)).toEqual(DEFAULT_POWER);
});
