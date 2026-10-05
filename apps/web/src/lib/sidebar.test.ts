/// <reference types="node" />
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
it("keeps the rail fixed and labelled: no hover expansion, every hub named", () => {
  const shell = readFileSync(new URL("../shell/Shell.tsx", import.meta.url), "utf8");
  const nav = readFileSync(new URL("../shell/HubNav.tsx", import.meta.url), "utf8");
  expect(shell).not.toContain("onMouseEnter={() => hover(true)}");
  expect(shell).not.toContain("open || labeled");
  expect(shell).toContain("<Sidebar />");
  expect(shell).toMatch(/wide \? <HubSidebar \/> : <CompactRail \/>/);
  expect(nav).toContain('className="hub-label"');            // the rail is labelled
  expect(nav).toMatch(/<span>\{tab\.label\}<\/span>/);      // every sidebar page is a named row
  expect(nav).not.toContain("side-tabs");                   // flat: no folding sub-sections
  expect(nav).not.toMatch(/onMouseEnter/);
});

it("pins live sessions in a Now group above the day groups", async () => {
  const { sidebarGroups } = await import("../shell/HubNav");
  const now = new Date(2026, 9, 5, 12).getTime();
  const run = (id: string, status: string, updatedAt: number) => ({ id, title: id, ask: "", ticker: "", status, pendingApprovals: [], updatedAt }) as never;
  const groups = sidebarGroups([run("old", "done", now - 1000), run("busy", "running", now - 5000), run("ask", "awaiting_approval", now - 2000)], now);
  expect(groups.map((g) => [g.title, g.runs.map((r) => r.id)])).toEqual([["Now", ["ask", "busy"]], ["Today", ["old"]]]);
});
