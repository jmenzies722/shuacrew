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
