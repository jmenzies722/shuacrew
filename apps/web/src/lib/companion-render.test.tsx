import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Companion, sparkAtlasStyle, SparkArt } from "../components/Companion";
import { SparkCharacter } from "../components/SparkCharacter";
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
it("keeps one atlas slot for every crop and marks portrait so CSS can zoom the head", () => {
  expect(sparkAtlasStyle("calm", "none")).toEqual({ backgroundPosition: "0% 0%" });
  expect(sparkAtlasStyle("bright", "cap")).toEqual({ backgroundPosition: `${1 / 6 * 100}% 100%` });
  expect(sparkAtlasStyle("curious", "headphones")).toEqual({ backgroundPosition: `${2 / 6 * 100}% 50%` });
  const portrait = renderToStaticMarkup(<SparkArt preferences={parseCompanion({ enabled: true, face: "bright" })} crop="portrait" />);
  expect(portrait).toContain("is-portrait");
  expect(portrait).toContain("100%");
  const full = renderToStaticMarkup(<SparkArt preferences={parseCompanion({ enabled: true, face: "bright" })} />);
  expect(full).not.toContain("is-portrait");
  const avatar = renderToStaticMarkup(<SparkCharacter preferences={parseCompanion({ enabled: true })} crop="portrait" size={38} />);
  expect(avatar).toContain("is-portrait");
  expect(renderToStaticMarkup(<SparkCharacter preferences={parseCompanion({ enabled: true })} size={84} />)).not.toContain("is-portrait");
});
