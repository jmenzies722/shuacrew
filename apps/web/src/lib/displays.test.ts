import { expect, it } from "vitest";
import { blockScreen, completedBlocks, displaysText, elementsText, pixelsToFractions } from "./buddy";

const shot = { width: 1568, height: 1018, others: [{ n: 2, width: 1280, height: 720 }] };

it("reads which display a block is about", () => {
  expect(blockScreen('```point {"x":100,"y":50,"screen":2}```')).toBe(2);
  expect(blockScreen('```draw [{"shape":"box","x":1,"y":1,"w":9,"h":9,"screen":3}]```')).toBe(3);
  expect(blockScreen('```point {"x":100,"y":50}```')).toBeUndefined();
  expect(blockScreen('```point {"x":100,"y":50,"screen":1}```')).toBeUndefined(); // 1 is the main display
  expect(blockScreen("```point nonsense```")).toBeUndefined();
});

it("converts pixels with the size of the display the block points at", () => {
  const main = JSON.parse(/\{.*\}/.exec(pixelsToFractions('```point {"x":784,"y":509}```', "point", shot))![0]);
  expect(main).toMatchObject({ x: 0.5, y: 0.5 });
  const side = JSON.parse(/\{.*\}/.exec(pixelsToFractions('```point {"x":640,"y":360,"screen":2}```', "point", shot))![0]);
  expect(side).toMatchObject({ x: 0.5, y: 0.5, screen: 2 }); // half of 1280×720, not of the main image
  expect(completedBlocks('ok ```point {"x":640,"y":360,"screen":2}```', shot)[0]!.raw).toContain('"x":0.5');
});

it("tells Spark about the other displays, and nothing when there's one", () => {
  const ctx = { app: "Xcode", displays: [{ n: 2, name: "Studio Display", where: "to the right", width: 1280, height: 720 }] };
  expect(displaysText(ctx)).toContain("image 2 = “Studio Display”, to the right of it (1280×720)");
  expect(displaysText(ctx)).toContain('"screen": <its number>');
  expect(elementsText(ctx)).toMatch(/^THEIR OTHER DISPLAYS[\s\S]*IN FRONT: Xcode/);
  expect(elementsText({ displays: ctx.displays })).toContain("THEIR OTHER DISPLAYS"); // even with no app info
  expect(displaysText({ app: "Xcode" })).toBe("");
  expect(elementsText({ app: "Xcode" })).not.toContain("DISPLAYS");
});
