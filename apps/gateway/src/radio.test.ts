import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { expect, it } from "vitest";
import { Radio, matchStation, nameParts, parseCommand, radioRoutes } from "./radio.js";

const tmp = () => mkdtempSync(path.join(os.tmpdir(), "radio-"));

it("reads artist and title from file names", () => {
  expect(nameParts("/x/03 - Nujabes - Aruarian Dance.mp3")).toEqual({ artist: "Nujabes", title: "Aruarian Dance" });
  expect(nameParts("/x/rainy_night.m4a")).toEqual({ artist: "", title: "rainy night" });
});

it("only accepts known commands and clamps volume", () => {
  expect(parseCommand({ cmd: "play", station: "jazz" })).toEqual({ cmd: "play", station: "jazz", track: undefined });
  expect(parseCommand({ cmd: "volume", value: 40 })).toEqual({ cmd: "volume", value: 0.4 });
  expect(parseCommand({ cmd: "volume", value: 7 })).toEqual({ cmd: "volume", value: 0.07 });
  expect(parseCommand({ cmd: "rm -rf" })).toBeNull();
});

it("sets up the two starter stations, lists tracks, and matches loose station names", async () => {
  const root = tmp();
  try {
    const radio = new Radio(root);
    await radio.setup();
    writeFileSync(path.join(root, "Lofi Jazz", "Artist - Song.mp3"), "not really audio");
    mkdirSync(path.join(root, "Lofi Hip-Hop", "album"), { recursive: true });
    writeFileSync(path.join(root, "Lofi Hip-Hop", "album", "beat.wav"), "x");
    writeFileSync(path.join(root, "Lofi Jazz", "notes.txt"), "not audio");
    const stations = await radio.stations();
    expect(stations.map((s) => s.name)).toEqual(["Lofi Jazz", "Lofi Hip-Hop"]);
    expect(stations[0]!.tracks.map((t) => [t.artist, t.title])).toEqual([["Artist", "Song"]]);
    expect(stations[1]!.tracks).toHaveLength(1);
    expect(matchStation(stations, "jazz")?.name).toBe("Lofi Jazz");
    expect(matchStation(stations, "hip hop")?.name).toBe("Lofi Hip-Hop");
    expect(matchStation(stations, "classical")).toBeUndefined();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it("streams listed tracks with ranges, refuses unknown ids, and relays commands to the open player", async () => {
  const root = tmp(), app = Fastify();
  try {
    const radio = radioRoutes(app, new Radio(root));
    await radio.setup();
    writeFileSync(path.join(root, "Lofi Jazz", "a.mp3"), "0123456789");
    const list = (await app.inject("/api/radio")).json() as { stations: Array<{ tracks: Array<{ id: string; file?: string }> }> };
    const id = list.stations[0]!.tracks[0]!.id;
    expect(list.stations[0]!.tracks[0]!.file).toBeUndefined(); // paths never leave the gateway
    const part = await app.inject({ url: `/api/radio/tracks/${id}/audio`, headers: { range: "bytes=2-5" } });
    expect(part.statusCode).toBe(206); expect(part.body).toBe("2345"); expect(part.headers["content-type"]).toBe("audio/mpeg");
    expect((await app.inject("/api/radio/tracks/../../etc/passwd/audio")).statusCode).toBe(404);
    expect((await app.inject("/api/radio/tracks/deadbeefdeadbeef/audio")).statusCode).toBe(404);
    const post = (body: object) => app.inject({ method: "POST", url: "/api/radio/command", payload: body });
    expect((await post({ cmd: "pause" })).statusCode).toBe(409); // nobody is listening yet
    const heard: unknown[] = []; const off = radio.subscribe((c) => heard.push(c));
    expect((await post({ cmd: "play", station: "jazz" })).statusCode).toBe(200);
    expect((await post({ cmd: "play", station: "hip hop" })).statusCode).toBe(409); // empty station says so
    expect((await post({ cmd: "play", station: "opera" })).statusCode).toBe(404);
    off();
    expect(heard).toEqual([{ cmd: "play", station: "lofi-jazz", track: undefined }]);
  } finally { await app.close(); rmSync(root, { recursive: true, force: true }); }
});
