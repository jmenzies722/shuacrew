import { afterEach, expect, it, vi } from "vitest";
import { openMobileSettings } from "./native";
afterEach(() => vi.unstubAllGlobals());
it("opens native mobile settings without passing credentials or cloud configuration", () => {
  const messages: unknown[] = [];
  vi.stubGlobal("window", { webkit: { messageHandlers: { shuacrew: { postMessage: (value: unknown) => messages.push(value) } } } });
  expect(openMobileSettings()).toBe(true);
  expect(messages).toEqual([{ type: "mobileSettings" }]);
  vi.stubGlobal("window", {});
  expect(openMobileSettings()).toBe(false);
});
