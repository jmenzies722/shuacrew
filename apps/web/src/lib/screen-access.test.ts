import { afterEach, expect, it, vi } from "vitest";
import { readSee, saveSee, screenAllowed, subscribeScreenAccess } from "./screen-access";

afterEach(() => vi.unstubAllGlobals());

it("publishes eye changes locally and receives changes from another window", () => {
  const values = new Map<string, string>();
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => values.set(key, value) });
  const observed: boolean[] = [];
  const release = subscribeScreenAccess(() => observed.push(readSee()));
  saveSee(false);
  values.set("shuacrew.buddy.see", "1");
  window.dispatchEvent(new Event("storage"));
  expect(observed).toEqual([false, true]);
  release(); saveSee(false);
  expect(observed).toHaveLength(2);
});

it("accepts an active screen stream without pretending that capture has succeeded", () => {
  expect(screenAllowed(false, true)).toBe(true);
  expect(screenAllowed(true, false)).toBe(true);
  expect(screenAllowed(false, false)).toBe(false);
});
