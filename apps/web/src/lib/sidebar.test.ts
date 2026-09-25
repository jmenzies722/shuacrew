/// <reference types="node" />
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
it("does not expand the entire rail on hover or focus", () => {
  const shell = readFileSync(new URL("../shell/Shell.tsx", import.meta.url), "utf8");
  expect(shell).not.toContain("onMouseEnter={() => hover(true)}");
  expect(shell).not.toContain("open || labeled");
  expect(shell).toContain('role="tooltip"');
});
