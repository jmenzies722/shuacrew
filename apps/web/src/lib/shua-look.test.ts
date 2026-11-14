import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { shuaLook } from "./shua-look";

it("renders Shua's mark as self-contained markup the phone can show, and the gateway accepts", () => {
  const look = shuaLook();
  expect(look.name).toBe("Shua");
  expect(look.markup.startsWith("<svg")).toBe(true);
  expect(look.markup).toContain("shua-mark");
  expect(look.markup).toContain("is-idle");
  expect(look.markup).not.toMatch(/spark-character|ch-robot/); // no character any more
  // Tests stub CSS imports; the real file is what the build embeds, so it's the one checked against the gateway's rules.
  const realCss = readFileSync(new URL("../components/mark.css", import.meta.url), "utf8");
  expect(realCss).toContain(".shua-mark.is-live");
  expect(/@import|url\(\s*["']?(?!#|data:image\/svg)|expression\(|<\/?style/i.test(realCss)).toBe(false);
  // The gateway's rules (apps/gateway/src/shua-look.ts): nothing that could run or load.
  expect(/<script|<iframe|<object|<embed|<foreignObject|\son\w+\s*=|javascript:|href\s*=\s*["']?(?!#)/i.test(look.markup)).toBe(false);
  expect(/@import|url\(\s*["']?(?!#|data:image\/svg)|expression\(|<\/?style/i.test(look.css)).toBe(false);
  expect(look.markup.length).toBeLessThan(250_000);
  expect(look.accent).toMatch(/^#[0-9a-f]{6}$/);
  expect(look.voiceId).toMatch(/^[a-z][a-z0-9-]*$/);
  expect(look.voiceSpeed).toBeGreaterThanOrEqual(0.8);
});
