import { expect, it } from "vitest";
import { asksAboutEarlier } from "./screen-memory";
it("notices questions that reach back to something on screen", () => {
  for (const q of ["what was that error an hour ago?", "remind me what the Stripe number was", "the command I saw earlier", "what was on my screen before lunch"]) expect(asksAboutEarlier(q)).toBe(true);
  for (const q of ["open Safari", "teach me kubernetes", "put on lofi jazz"]) expect(asksAboutEarlier(q)).toBe(false);
});
