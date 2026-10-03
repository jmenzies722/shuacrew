import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceSpark } from "./WorkspaceSpark";

it("keeps the purple suggestion box out of Rooms", () => {
  expect(renderToStaticMarkup(<WorkspaceSpark section="/rooms" />)).toBe("");
});

it("preserves suggestions in other workspaces", () => {
  expect(renderToStaticMarkup(<WorkspaceSpark section="/floor" />)).toContain("Find the next handoff");
});
