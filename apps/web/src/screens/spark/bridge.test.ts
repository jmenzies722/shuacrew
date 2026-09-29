import { expect, it, vi } from "vitest";

vi.stubGlobal("window", { addEventListener: () => {}, removeEventListener: () => {} });
const { playingContext } = await import("./bridge");

it("tells Spark what's playing on every question — the radio, or that nothing is", async () => {
  expect(await playingContext(async () => ({ playing: true, title: "Rainy Window", station: "Lofi Hip-Hop" }))).toBe("ShuaCrew Radio is on: Rainy Window (Lofi Hip-Hop).");
  expect(await playingContext(async () => ({ playing: false, title: null, station: null }))).toMatch(/^Nothing is playing right now/);
});
