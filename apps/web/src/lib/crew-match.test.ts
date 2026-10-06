import { expect, it } from "vitest";
import { bestMember, memberScore } from "./crew-match";

const crew = [
  { id: "rhea", name: "Rhea", role: "Researcher", triggers: ["research", "market", "competitors", "compare", "who pays"] },
  { id: "eli", name: "Eli", role: "Engineer", triggers: ["build", "implement", "fix", "bug", "refactor"] },
  { id: "dani", name: "Dani", role: "Designer", triggers: ["design", "ui", "ux", "landing page", "brand"] },
  { id: "otto", name: "Otto", role: "Operator", triggers: ["stripe", "payments", "pricing", "revenue", "domain"] },
  { id: "shua", name: "Shua", role: "Personal assistant", triggers: ["anything"] },
];

it("routes work to whoever it's for", () => {
  expect(bestMember("Fix the flaky upload bug", crew)?.id).toBe("eli");
  expect(bestMember("Who are our competitors and what do they charge?", crew)?.id).toBe("rhea");
  expect(bestMember("Design a landing page for Shua Labs", crew)?.id).toBe("dani");
  expect(bestMember("Set up Stripe payments", crew)?.id).toBe("otto");
});
it("matches word starts but not fragments", () => {
  expect(memberScore("researching the market", crew[0]!)).toBeGreaterThan(0);
  expect(memberScore("a building with a bug", crew[1]!)).toBeGreaterThan(0);
  expect(memberScore("ux", crew[2]!)).toBe(1);
  expect(memberScore("luxury", crew[2]!)).toBe(0); // "ux" inside a word isn't UX
});
it("never picks the generalist and returns null when nothing fits", () => {
  expect(bestMember("anything at all", crew)).toBeNull();
  expect(bestMember("", crew)).toBeNull();
});
