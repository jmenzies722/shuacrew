import { expect, it } from "vitest";
import { djLine } from "./radio-dj";

const track = (title: string, artist = "") => ({ id: title, station: "lofi-jazz", title, artist, duration: 120 });
it("introduces what's really coming on, and only mentions the crew when there's something to say", () => {
  expect(djLine({ kind: "track", track: track("Aruarian Dance", "Nujabes"), previous: track("Rain"), station: "Lofi Jazz" }, { running: 0, waiting: 0 }, true)).toBe("That was Rain. Up next, Aruarian Dance by Nujabes.");
  expect(djLine({ kind: "track", track: track("Coffee"), previous: null, station: "Lofi Jazz" }, { running: 2, waiting: 0 }, true)).toBe("Up next, Coffee. Meanwhile, 2 sessions are working.");
  expect(djLine({ kind: "live", station: { id: "yt", name: "Chillhop Radio", genre: "Lofi Jazz", videoId: "x", channel: "Chillhop Music" } }, { running: 0, waiting: 1 }, true)).toBe("Tuning in to Chillhop Radio, from Chillhop Music. 1 decision is waiting on you.");
  expect(djLine({ kind: "live", station: { id: "yt", name: "Chillhop Radio", genre: "Lofi Jazz", videoId: "x", channel: "Chillhop Music" } }, { running: 3, waiting: 1 }, false)).toBe("Tuning in to Chillhop Radio, from Chillhop Music.");
});
