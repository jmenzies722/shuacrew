import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Companion } from "../components/Companion";
import { parseCompanion } from "./companion";
const actions = { openDecisions: () => {}, openCrew: () => {}, startFocus: () => {} };
it("renders nothing when the master switch is off", () => {
  expect(renderToStaticMarkup(<Companion preferences={parseCompanion(null)} pose="idle" decisions={0} {...actions} />)).toBe("");
});
it("labels the actual offline state instead of pretending to work", () => {
  const html = renderToStaticMarkup(<Companion preferences={parseCompanion({ enabled: true, nickname: "Sparky" })} pose="offline" decisions={0} {...actions} />);
  expect(html).toContain("Sparky"); expect(html).toContain("Offline");
  expect(html).not.toContain("Working on your tasks");
});
