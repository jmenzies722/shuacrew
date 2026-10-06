import { expect, it } from "vitest";
import { featureMatches } from "../screens/Guide";

const card = { title: "The smart notch", where: "Settings → Desktop home", body: <>The camera housing becomes a <b>Dynamic Island</b>.</>, points: ["Hover to open it"] };

it("matches every word against the title, place, body text and points", () => {
  expect(featureMatches(card, "")).toBe(true);
  expect(featureMatches(card, "notch")).toBe(true);
  expect(featureMatches(card, "dynamic island")).toBe(true); // text nested inside markup
  expect(featureMatches(card, "hover desktop")).toBe(true);
  expect(featureMatches(card, "notch email")).toBe(false);
});
