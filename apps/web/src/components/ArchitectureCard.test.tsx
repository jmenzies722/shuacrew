import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ArchitectureCard } from "./ArchitectureCard";
import { parseVisual } from "../lib/visual";

it("offers a readable overview, real connections and deliberate lesson controls", () => {
  const lesson = parseVisual(JSON.stringify({ type: "architecture", title: "Caching", summary: "Reuse a previous result.", nodes: [{ id: "app", label: "App" }, { id: "cache", label: "Cache" }], edges: [{ from: "app", to: "cache", label: "read" }], steps: [{ title: "Read", body: "Check the cache.", focus: ["cache"] }], example: "Reuse a product response." }));
  if (lesson?.type !== "architecture") throw new Error("Invalid fixture");
  const html = renderToStaticMarkup(<ArchitectureCard lesson={lesson} caption="The Cache answers." onReplay={() => {}} onPin={() => {}} onClose={() => {}} />);
  expect(html).toContain("Reuse a previous result.");
  expect(html).toContain("App → Cache: read");
  expect(html).toContain('aria-label="Replay this explanation"');
  expect(html).toContain('aria-label="Pin lesson to main window"');
  expect(html).toContain('aria-label="Next lesson step"');
  expect(html).toContain('data-focused="true"');
  expect(html).not.toContain("autofocus");
  expect(html).toContain("Connected architecture diagram");
  expect(html).toContain("Follow voice");
  expect(html).toContain("Proposed teaching example");
});
