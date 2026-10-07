import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { shuaLook } from "./shua-look";

it("renders your Shua as self-contained markup the phone can show, and the gateway accepts", () => {
  const look = shuaLook();
  expect(look.name).toBe("Shua");
  expect(look.markup.startsWith("<span")).toBe(true);
  expect(look.markup).toContain("spark-character");
  expect(look.markup).toContain("mood-idle");
  expect(look.markup).toContain("<svg");
  // Tests stub CSS imports; the real file is what the build embeds, so it's the one checked against the gateway's rules.
  const realCss = readFileSync(new URL("../components/spark-character.css", import.meta.url), "utf8");
  expect(realCss).toContain(".mood-sleepy");
  expect(/@import|url\(\s*["']?(?!#|data:image\/svg)|expression\(|<\/?style/i.test(realCss)).toBe(false);
  // The gateway's rules (apps/gateway/src/shua-look.ts): nothing that could run or load.
  expect(/<script|<iframe|<object|<embed|<foreignObject|\son\w+\s*=|javascript:|href\s*=\s*["']?(?!#)/i.test(look.markup)).toBe(false);
  expect(/@import|url\(\s*["']?(?!#|data:image\/svg)|expression\(|<\/?style/i.test(look.css)).toBe(false);
  expect(look.markup.length).toBeLessThan(250_000);
  expect(look.accent).toMatch(/^#[0-9a-f]{6}$/);
  expect(look.voiceId).toMatch(/^[a-z][a-z0-9-]*$/);
  expect(look.voiceSpeed).toBeGreaterThanOrEqual(0.8);
});
