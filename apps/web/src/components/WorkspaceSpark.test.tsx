import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceSpark } from "./WorkspaceSpark";

it("preserves suggestions in other workspaces", () => {
  expect(renderToStaticMarkup(<WorkspaceSpark section="/floor" />)).toContain("Find the next handoff");
});
