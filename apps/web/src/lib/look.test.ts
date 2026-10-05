import { expect, it } from "vitest";
import { DEFAULT_LOOK, applyLook, parseLook } from "./look";

it("keeps valid choices and falls back on junk", () => {
  expect(parseLook(null)).toEqual(DEFAULT_LOOK);
  const p = parseLook({ uiFont: "comic-sans", monoFont: "menlo", chatStyle: "bubbles", sounds: { done: true, volume: 9 } });
  expect(p).toMatchObject({ uiFont: "system", displayFont: "same", monoFont: "menlo", chatStyle: "bubbles", sounds: { done: true, approval: false, volume: 0.4 } });
});
it("writes fonts and layout onto the root element", () => {
  const vars = new Map<string, string>();
  const root = { style: { setProperty: (k: string, v: string) => void vars.set(k, v), removeProperty: (k: string) => void vars.delete(k) }, dataset: {} as Record<string, string> };
  applyLook(parseLook({ monoFont: "sf-mono", readingFont: "serif", chatWidth: "wide", ligatures: false }), root as unknown as HTMLElement);
  expect(vars.get("--font-mono")).toContain("SF Mono");
  expect(vars.get("--font-reading")).toContain("New York");
  expect(vars.get("--chat-width")).toBe("960px");
  expect(root.dataset.ligatures).toBe("off");
});
it("at defaults writes only the interface type (SF Pro); everything else stays the app's own", () => {
  const vars = new Map<string, string>([["--chat-width", "960px"]]);
  const root = { style: { setProperty: (k: string, v: string) => void vars.set(k, v), removeProperty: (k: string) => void vars.delete(k) }, dataset: {} as Record<string, string> };
  applyLook(DEFAULT_LOOK, root as unknown as HTMLElement);
  expect([...vars.keys()]).toEqual(["--font-ui"]);
  expect(vars.get("--font-ui")).toContain("SF Pro");
  expect(root.dataset.display).toBe("same");
});
it("the theme owns the accent: a custom accent saved by an older version is cleared, never applied", async () => {
  const { contrast } = await import("./look");
  const vars = new Map<string, string>([["--amber", "#ffe066"]]);
  const root = { style: { setProperty: (k: string, v: string) => void vars.set(k, v), removeProperty: (k: string) => void vars.delete(k) }, dataset: {} as Record<string, string> };
  applyLook(parseLook({ customAccent: "#FFE066" }), root as unknown as HTMLElement);
  expect(vars.has("--amber")).toBe(false); expect(vars.has("--on-accent")).toBe(false);
  expect(contrast("#ffffff", "#000000")).toBeCloseTo(21, 0);
});

it("persists the motion character and safely migrates older settings", () => {
  expect(parseLook({}).motionStyle).toBe("responsive");
  expect(parseLook({ motionStyle: "expressive" }).motionStyle).toBe("expressive");
  expect(parseLook({ motionStyle: "invalid" }).motionStyle).toBe("responsive");
  const root = { style: { setProperty() {}, removeProperty() {} }, dataset: {} as Record<string, string> };
  applyLook(parseLook({ motionStyle: "calm" }), root as unknown as HTMLElement);
  expect(root.dataset.motionStyle).toBe("calm");
});
