import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { GatewaySettings, failoverCandidates, inQuietHours, standingInstructions } from "./settings.js";

const file = () => path.join(mkdtempSync(path.join(os.tmpdir(), "shua-settings-")), "settings.json");

it("defaults, validates, merges sections and writes a private file", () => {
  const f = file(), s = new GatewaySettings(f);
  expect(s.get().git.branchPrefix).toBe("shua/");
  s.update({ git: { squash: true } });
  expect(s.get().git).toMatchObject({ squash: true, branchPrefix: "shua/", author: "shuacrew" });
  expect(statSync(f).mode & 0o777).toBe(0o600);
  expect(() => s.update({ git: { branchPrefix: "../evil" } })).toThrow();
  expect(() => s.update({ protectedPaths: ["relative/path"] })).toThrow();
  expect(new GatewaySettings(f).get().git.squash).toBe(true);
});
it("falls back to defaults on a corrupt file", () => {
  const f = file(); writeFileSync(f, "{not json");
  expect(new GatewaySettings(f).get().failoverOrder).toEqual([]);
  writeFileSync(f, JSON.stringify({ git: { branchPrefix: 42 } }));
  expect(new GatewaySettings(f).get().git.branchPrefix).toBe("shua/");
  expect(readFileSync(f, "utf8")).toContain("42"); // never overwritten just by reading
});
it("quiet hours handle windows across midnight", () => {
  const q = { enabled: true, start: 22 * 60, end: 7 * 60 }, at = (h: number) => new Date(2026, 8, 25, h, 0);
  expect(inQuietHours(q, at(23))).toBe(true); expect(inQuietHours(q, at(3))).toBe(true);
  expect(inQuietHours(q, at(7))).toBe(false); expect(inQuietHours(q, at(12))).toBe(false);
  expect(inQuietHours({ ...q, enabled: false }, at(23))).toBe(false);
  expect(inQuietHours({ enabled: true, start: 9 * 60, end: 17 * 60 }, at(12))).toBe(true);
});
it("builds standing instructions with the most specific project last", () => {
  const s = new GatewaySettings(file());
  s.update({ instructions: { global: "Be brief.", projects: { "/p": "Use pnpm.", "/p/app": "Swift only.", "/other": "no" } } });
  const text = standingInstructions(s.get(), "/p/app/src")!;
  expect(text).toContain("Be brief."); expect(text).toContain("Swift only."); expect(text).not.toContain("Use pnpm."); expect(text).not.toContain("no\n");
  expect(standingInstructions(new GatewaySettings(file()).get(), "/x")).toBeUndefined();
});
it("orders failover by your list, then the rest", () => {
  expect(failoverCandidates(["codex", "ghost", "claude"], ["claude", "codex", "acp:kiro"], "claude")).toEqual(["codex", "acp:kiro"]);
  expect(failoverCandidates([], ["claude", "codex"], "claude")).toEqual(["codex"]);
});
