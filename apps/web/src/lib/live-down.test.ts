import { expect, it } from "vitest";
import { liveDownUntil } from "./live-down";

const now = new Date(2026, 9, 3, 15, 50).getTime();
const limit = "You've hit your usage limit. Visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at Oct 9th, 2026 8:28 PM.";

it("keeps Live off until the reset time a usage limit names", () => {
  expect(liveDownUntil(limit, now)).toBe(new Date(2026, 9, 9, 20, 28).getTime());
});

it("keeps Live off for hours when a usage limit gives no readable reset time", () => {
  expect(liveDownUntil("You've hit your usage limit.", now)).toBe(now + 6 * 3_600_000);
});

it("retries Live after ten minutes for an ordinary failure", () => {
  expect(liveDownUntil("The call dropped. Check your connection and try again.", now)).toBe(now + 10 * 60_000);
  expect(liveDownUntil(undefined, now)).toBe(now + 10 * 60_000);
});

it("never trusts a reset time that has already passed", () => {
  expect(liveDownUntil("You've hit your usage limit. Try again at Oct 1st, 2026 8:28 PM.", now)).toBe(now + 6 * 3_600_000);
});
