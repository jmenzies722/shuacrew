import { describe, expect, it } from "vitest";
import { clock, searchAlbums, shelves, topArtists, type Album } from "./apple-music";

const DAY = 86_400_000, now = Date.UTC(2026, 9, 5);
const album = (id: string, o: Partial<Album> = {}): Album => ({ id, title: `Album ${id}`, artist: "Lupe Fiasco", year: 2007, tracks: 1, added: now - DAY, plays: 0, lastPlayed: 0, genre: "Hip-Hop/Rap", ...o });

describe("Studio shelves", () => {
  it("puts whole records first and never shows an album twice", () => {
    const lib = [album("a", { tracks: 14, plays: 90 }), album("b", { tracks: 1, plays: 200, added: now }), album("c", { tracks: 1, added: now - 2 * DAY })];
    const rows = shelves(lib, now);
    expect(rows[0]).toMatchObject({ id: "full" });
    expect(rows[0]!.albums.map((x) => x.id)).toEqual(["a"]);
    const all = rows.flatMap((r) => r.albums.map((x) => x.id));
    expect(new Set(all).size).toBe(all.length);
  });
  it("rediscovers loved albums that went quiet", () => {
    const rows = shelves([album("old", { plays: 40, lastPlayed: now - 200 * DAY, added: now - 900 * DAY }), ...Array.from({ length: 30 }, (_, i) => album(`n${i}`, { added: now - i }))], now);
    expect(rows.find((r) => r.id === "rediscover")?.albums.map((x) => x.id)).toEqual(["old"]);
  });
  it("drops empty shelves", () => {
    expect(shelves([], now)).toEqual([]);
  });
});

describe("Studio search and stats", () => {
  const lib = [album("1", { title: "The Cool", plays: 5 }), album("2", { title: "The Black Album", artist: "JAŸ-Z", plays: 50 }), album("3", { title: "Food & Liquor", plays: 9 })];
  it("matches every word across title, artist and genre, most played first", () => {
    expect(searchAlbums(lib, "lupe").map((a) => a.id)).toEqual(["3", "1"]);
    expect(searchAlbums(lib, "black jaÿ").map((a) => a.id)).toEqual(["2"]);
    expect(searchAlbums(lib, "  ")).toEqual([]);
  });
  it("ranks artists by plays", () => {
    expect(topArtists(lib)[0]).toEqual({ name: "JAŸ-Z", plays: 50, albums: 1 });
  });
  it("formats song times", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(245.7)).toBe("4:05");
  });
});
