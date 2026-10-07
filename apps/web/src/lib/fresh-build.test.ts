import { expect, it } from "vitest";
import { buildOf, quietNow } from "./fresh-build";

it("reads the build a page runs from its hashed main script", () => {
  expect(buildOf('<script type="module" crossorigin src="/assets/index-CTWKySh-.js"></script>')).toBe("/assets/index-CTWKySh-.js");
  expect(buildOf('<script type="module" src="/src/main.tsx"></script>')).toBeNull(); // the dev server
});

it("reloads onto a new build only at a quiet moment", () => {
  const idle = { busy: false, typing: false, foreground: false, notch: true };
  expect(quietNow(idle)).toBe(true);                                   // the notch, idle
  expect(quietNow({ ...idle, busy: true })).toBe(false);               // speaking, listening, a call, working
  expect(quietNow({ ...idle, typing: true })).toBe(false);             // never under your fingers
  expect(quietNow({ ...idle, notch: false, foreground: true })).toBe(false); // the main window in front of you
  expect(quietNow({ ...idle, notch: false, foreground: false })).toBe(true); // …or once it's in the background
});
