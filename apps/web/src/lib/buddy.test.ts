import { expect, it } from "vitest";
import { buddyPrompt, guideFollowUp, nextSentences, parseActions, parseGuide, parsePoint, speakable, spoken } from "./buddy";

it("reads a valid point, rejects out-of-range or junk, and hides it from the bubble", () => {
  const reply = 'Click Save.\n```point {"x": 0.82, "y": 0.07, "label": "Save button"}```';
  expect(parsePoint(reply)).toEqual({ x: 0.82, y: 0.07, label: "Save button" });
  expect(speakable(reply)).toBe("Click Save.");
  expect(parsePoint('```point {"x": 1.4, "y": 0.2}```')).toBeNull();
  expect(parsePoint("```point nope```")).toBeNull();
  expect(parsePoint("no point here")).toBeNull();
});
it("asks for grounding and pointing only when there is a screenshot", () => {
  expect(buddyPrompt("where is export?", { width: 1568, height: 980 })).toContain("1568×980");
  expect(buddyPrompt("hi", null)).toContain("No screenshot");
});
it("reads actions, drops unsafe ones, and keeps them out of the bubble and the voice", () => {
  const reply = 'Opening Safari for you.\n```do [{"type":"open_app","name":"Safari"},{"type":"open_url","url":"javascript:alert(1)"},{"type":"open_path","path":"~/a/../../etc"},{"type":"focus","minutes":25},{"type":"rm","path":"/"}]```';
  expect(parseActions(reply)).toEqual([{ type: "open_app", name: "Safari" }, { type: "focus", minutes: 25 }]);
  expect(parseActions('```do {"type":"open_url","url":"https://github.com"}```')).toEqual([{ type: "open_url", url: "https://github.com" }]);
  expect(parseActions("```do not json```")).toEqual([]);
  expect(speakable(reply)).toBe("Opening Safari for you.");
  expect(spoken("**Sure** — open `Notes`, then [this](https://x.y).\n- step one")).toBe("Sure — open Notes, then this. step one");
});
it("speaks whole sentences as they stream, never code", () => {
  const a = nextSentences("Opening Safari. Then I'll", 0);
  expect(a.chunks).toEqual(["Opening Safari."]);
  const b = nextSentences("Opening Safari. Then I'll search it.\n```do []```", a.upto);
  expect(b.chunks).toEqual(["Then I'll search it."]);
  expect(nextSentences("Done", 0, true).chunks).toEqual(["Done"]);
  expect(buddyPrompt("open safari", null)).toContain("open_app");
});
it("reads guide steps, clamps boxes, and knows when it's done", () => {
  const r = 'Click Share at the top right.\n```guide {"x":0.9,"y":0.05,"w":0.05,"h":0.03,"label":"Click Share","step":2}```';
  expect(parseGuide(r)).toEqual({ x: 0.9, y: 0.05, w: 0.05, h: 0.03, label: "Click Share", step: 2, done: false });
  expect(parseGuide('```guide {"done": true}```')).toEqual({ done: true });
  expect(parseGuide('```guide {"x":2,"y":0}```')).toBeNull();
  expect(parseGuide('```guide {"x":0.5,"y":0.5,"w":3}```')).toMatchObject({ w: 0.04, h: 0.04, step: 1 });
  expect(speakable(r)).toBe("Click Share at the top right.");
  expect(buddyPrompt("how do I share", { width: 100, height: 50 }, { name: "Kit", tone: "coach", length: "brief" })).toContain("You are Kit");
  expect(guideFollowUp("Click Share", { width: 10, height: 5 })).toContain("fresh screenshot");
});
