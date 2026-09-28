/**
 * ShuaCrew Radio: your own music, as stations. A station is a folder under ~/Music/ShuaCrew Radio (Lofi Jazz and
 * Lofi Hip-Hop to start; any folder you add becomes a station). The gateway lists and streams the files — nothing is
 * downloaded, generated or sent anywhere — and relays play/pause/skip commands from Spark, agents (through the radio
 * skill) or the terminal to the player in the app over a small event stream.
 */
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance, FastifyReply } from "fastify";

export const DEFAULT_STATIONS = ["Lofi Jazz", "Lofi Hip-Hop"] as const;
const AUDIO = new Set([".mp3", ".m4a", ".aac", ".wav", ".flac", ".aiff", ".aif", ".ogg", ".opus"]);
const TYPES: Record<string, string> = { ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".aac": "audio/aac", ".wav": "audio/wav", ".flac": "audio/flac", ".aiff": "audio/aiff", ".aif": "audio/aiff", ".ogg": "audio/ogg", ".opus": "audio/ogg" };
const MAX_TRACKS = 2000;

/** A YouTube live station, played through YouTube's own embedded player (never downloaded). */
export interface YouTubeStation { id: string; name: string; genre: "Lofi Jazz" | "Lofi Hip-Hop" | "Other"; videoId: string; channel: string }
/** Verified with YouTube oEmbed on 2026-09-25: long-running 24/7 streams that allow embedding. */
export const DEFAULT_YOUTUBE: YouTubeStation[] = [
  { id: "yt-lofi-girl", name: "lofi hip hop radio 📚", genre: "Lofi Hip-Hop", videoId: "jfKfPfyJRdk", channel: "Lofi Girl" },
  { id: "yt-chillhop", name: "Chillhop Radio · jazzy & lofi", genre: "Lofi Jazz", videoId: "5yx6BWlEVcY", channel: "Chillhop Music" },
  { id: "yt-jazz-lofi", name: "jazz/lofi hip hop radio 🌱", genre: "Lofi Jazz", videoId: "kgx4WGK0oNU", channel: "Abao in Tokyo" },
  { id: "yt-lofi-sleep", name: "lofi hip hop radio 💤 sleep/chill", genre: "Lofi Hip-Hop", videoId: "JD-kMIpDfnY", channel: "Lofi Girl" },
];
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
/** Pull the 11-character video id out of any YouTube link (watch, live, youtu.be, embed) or a bare id. */
export function youtubeId(input: string): string | null {
  const t = input.trim();
  if (VIDEO_ID.test(t)) return t;
  try {
    const u = new URL(t);
    if (!/(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be)$/.test(u.hostname)) return null;
    const id = u.hostname.endsWith("youtu.be") ? u.pathname.slice(1) : u.searchParams.get("v") ?? u.pathname.match(/\/(?:live|embed|shorts)\/([^/?]+)/)?.[1] ?? "";
    return VIDEO_ID.test(id) ? id : null;
  } catch { return null; }
}

export interface RadioTrack { id: string; station: string; title: string; artist: string; duration: number | null; file: string }
export interface RadioStation { id: string; name: string; tracks: RadioTrack[] }
export type RadioCommand =
  | { cmd: "play"; station?: string; track?: string }
  | { cmd: "pause" } | { cmd: "resume" } | { cmd: "next" } | { cmd: "previous" } | { cmd: "stop" }
  | { cmd: "volume"; value: number }
  | { cmd: "duck" } | { cmd: "unduck" };

export const radioRoot = () => process.env.SHUACREW_RADIO_DIR || path.join(os.homedir(), "Music", "ShuaCrew Radio");
export const stationId = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const trackId = (rel: string) => createHash("sha1").update(rel).digest("hex").slice(0, 16);

/** "Artist - Title.mp3" → both; otherwise the file name is the title. Tags from ffprobe win when present. */
export function nameParts(file: string): { title: string; artist: string } {
  const base = path.basename(file, path.extname(file)).replace(/^\d{1,3}[\s._-]+/, "").replace(/_/g, " ").trim();
  const m = /^(.+?)\s+[-–]\s+(.+)$/.exec(base);
  return m ? { artist: m[1]!.trim(), title: m[2]!.trim() } : { title: base, artist: "" };
}

function probe(file: string): Promise<{ title?: string; artist?: string; duration?: number }> {
  return new Promise((resolve) => {
    execFile("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_entries", "format=duration:format_tags=title,artist", file], { timeout: 4000 }, (err, out) => {
      if (err) return resolve({});
      try {
        const f = (JSON.parse(out) as { format?: { duration?: string; tags?: Record<string, string> } }).format ?? {};
        const tags = Object.fromEntries(Object.entries(f.tags ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
        resolve({ title: tags.title, artist: tags.artist, duration: f.duration ? Number(f.duration) : undefined });
      } catch { resolve({}); }
    });
  });
}

export class Radio {
  private youtubeFile = process.env.SHUACREW_RADIO_YOUTUBE || path.join(os.homedir(), ".shuacrew", "radio-youtube.json");
  youtube(): YouTubeStation[] {
    try { const list = JSON.parse(readFileSync(this.youtubeFile, "utf8")) as YouTubeStation[]; return Array.isArray(list) ? list.filter((x) => VIDEO_ID.test(x.videoId)) : DEFAULT_YOUTUBE; } catch { return DEFAULT_YOUTUBE; }
  }
  saveYoutube(list: YouTubeStation[]) { mkdirSync(path.dirname(this.youtubeFile), { recursive: true }); writeFileSync(this.youtubeFile, JSON.stringify(list, null, 2)); }
  private cache = new Map<string, { mtime: number; size: number; title: string; artist: string; duration: number | null }>();
  private byId = new Map<string, RadioTrack>();
  private listeners = new Set<(c: RadioCommand) => void>();
  constructor(readonly root = radioRoot()) {}

  /** Make the two starter stations (and nothing else). */
  setup() {
    for (const name of DEFAULT_STATIONS) mkdirSync(path.join(this.root, name), { recursive: true });
    const readme = path.join(this.root, "README.txt");
    if (!existsSync(readme)) writeFileSync(readme, "ShuaCrew Radio\n\nEach folder here is a station. Drop audio files (mp3, m4a, wav, flac, aiff) into Lofi Jazz or Lofi Hip-Hop,\nor make a new folder for a new station. Name files \"Artist - Title.mp3\" if they have no tags.\n");
    return this.stations();
  }

  async stations(): Promise<RadioStation[]> {
    if (!existsSync(this.root)) return [];
    const out: RadioStation[] = [];
    const folders = readdirSync(this.root, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith(".")).map((d) => d.name);
    // Starter stations first, in their order; any others alphabetically.
    folders.sort((a, b) => (DEFAULT_STATIONS.indexOf(a as never) + 1 || 99) - (DEFAULT_STATIONS.indexOf(b as never) + 1 || 99) || a.localeCompare(b));
    let total = 0;
    for (const name of folders) {
      const files = this.walk(path.join(this.root, name)).slice(0, Math.max(0, MAX_TRACKS - total));
      total += files.length;
      const tracks = await Promise.all(files.map((f) => this.track(name, f)));
      out.push({ id: stationId(name), name, tracks });
    }
    return out;
  }

  private walk(dir: string, depth = 0): string[] {
    if (depth > 3) return [];
    const out: string[] = [];
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      if (d.name.startsWith(".")) continue;
      const p = path.join(dir, d.name);
      if (d.isDirectory()) out.push(...this.walk(p, depth + 1));
      else if (AUDIO.has(path.extname(d.name).toLowerCase())) out.push(p);
    }
    return out.sort((a, b) => a.localeCompare(b));
  }

  private async track(station: string, file: string): Promise<RadioTrack> {
    const rel = path.relative(this.root, file), st = statSync(file);
    let meta = this.cache.get(rel);
    if (!meta || meta.mtime !== st.mtimeMs || meta.size !== st.size) {
      const guess = nameParts(file), tags = await probe(file);
      meta = { mtime: st.mtimeMs, size: st.size, title: tags.title?.trim() || guess.title, artist: tags.artist?.trim() || guess.artist, duration: tags.duration && Number.isFinite(tags.duration) ? Math.round(tags.duration) : null };
      this.cache.set(rel, meta);
    }
    const t: RadioTrack = { id: trackId(rel), station: stationId(station), title: meta.title, artist: meta.artist, duration: meta.duration, file };
    this.byId.set(t.id, t);
    return t;
  }

  /** Only files inside the radio folder that were listed can ever be served. */
  file(id: string): RadioTrack | undefined {
    const t = this.byId.get(id);
    if (!t) return undefined;
    const resolved = path.resolve(t.file), root = path.resolve(this.root) + path.sep;
    return resolved.startsWith(root) && existsSync(resolved) ? t : undefined;
  }

  command(c: RadioCommand) { for (const l of this.listeners) l(c); return { ok: true, listeners: this.listeners.size }; }
  subscribe(l: (c: RadioCommand) => void) { this.listeners.add(l); return () => { this.listeners.delete(l); }; }
}

/** Validates a command from outside (Spark, an agent's skill, the terminal). */
export function parseCommand(body: unknown): RadioCommand | null {
  const b = (body ?? {}) as Record<string, unknown>;
  switch (b.cmd) {
    case "play": return { cmd: "play", station: typeof b.station === "string" ? b.station : undefined, track: typeof b.track === "string" ? b.track : undefined };
    case "pause": case "resume": case "next": case "previous": case "stop": case "duck": case "unduck": return { cmd: b.cmd };
    case "volume": { const v = Number(b.value); return Number.isFinite(v) ? { cmd: "volume", value: Math.min(1, Math.max(0, v > 1 ? v / 100 : v)) } : null; }
    default: return null;
  }
}

/** Resolve "jazz", "hip hop", "lofi-hip-hop" or a folder name to a station id. */
export function matchStation(stations: RadioStation[], query: string): RadioStation | undefined {
  const q = stationId(query);
  return stations.find((s) => s.id === q) ?? stations.find((s) => s.id.includes(q) || q.includes(s.id.replace(/^lofi-/, "")));
}

/** "lofi girl", "chillhop", "sleep", or a genre ("jazz", "hip hop") → a YouTube station. Local folders win on exact names. */
export function matchYoutube(list: YouTubeStation[], query: string): YouTubeStation | undefined {
  const q = query.toLowerCase().trim();
  const byName = list.find((s) => s.id === q || s.name.toLowerCase().includes(q) || s.channel.toLowerCase().includes(q));
  if (byName) return byName;
  if (/youtube|stream|live/.test(q)) return list.find((s) => /jazz/.test(q) ? s.genre === "Lofi Jazz" : /hip/.test(q) ? s.genre === "Lofi Hip-Hop" : true);
  return undefined;
}

function stream(reply: FastifyReply, file: string, range: string | undefined) {
  const size = statSync(file).size, type = TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
  reply.header("Accept-Ranges", "bytes").header("Content-Type", type).header("Cache-Control", "no-store");
  const m = range ? /bytes=(\d*)-(\d*)/.exec(range) : null;
  if (m && (m[1] || m[2])) {
    const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start >= size || start > end) return reply.code(416).header("Content-Range", `bytes */${size}`).send();
    return reply.code(206).header("Content-Range", `bytes ${start}-${end}/${size}`).header("Content-Length", end - start + 1).send(createReadStream(file, { start, end }));
  }
  return reply.header("Content-Length", size).send(createReadStream(file));
}

export function radioRoutes(app: FastifyInstance, radio = new Radio(), fetcher: typeof fetch = fetch) {
  app.get("/api/radio", async () => ({ root: radio.root, exists: existsSync(radio.root), youtube: radio.youtube(), stations: (await radio.stations()).map((s) => ({ ...s, tracks: s.tracks.map(({ file: _f, ...t }) => t) })) }));
  // YouTube stations: add by link (checked with YouTube's oEmbed — it must exist and allow embedding), or remove.
  app.post<{ Body: { url?: string; name?: string; genre?: string } }>("/api/radio/youtube", async (req, reply) => {
    const videoId = youtubeId(req.body?.url ?? "");
    if (!videoId) return reply.code(400).send({ error: "That isn't a YouTube link." });
    const list = radio.youtube();
    if (list.some((s) => s.videoId === videoId)) return reply.code(409).send({ error: "That station is already on the dial." });
    let title = "", channel = "";
    try {
      const r = await fetcher(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`, { signal: AbortSignal.timeout(8000) });
      if (r.status === 401 || r.status === 403) return reply.code(422).send({ error: "That video doesn't allow playing outside YouTube." });
      if (!r.ok) return reply.code(404).send({ error: "YouTube doesn't know that video." });
      const o = await r.json() as { title?: string; author_name?: string }; title = o.title ?? ""; channel = o.author_name ?? "";
    } catch { return reply.code(502).send({ error: "Couldn't reach YouTube to check that link." }); }
    const genre = req.body?.genre === "Lofi Jazz" || req.body?.genre === "Lofi Hip-Hop" ? req.body.genre : /jazz/i.test(title) ? "Lofi Jazz" : /hip ?hop|lofi|lo-fi/i.test(title) ? "Lofi Hip-Hop" : "Other";
    const station: YouTubeStation = { id: `yt-${videoId.toLowerCase()}`, name: (req.body?.name?.trim() || title || "YouTube station").slice(0, 80), genre, videoId, channel };
    radio.saveYoutube([...list, station]);
    return station;
  });
  app.delete<{ Params: { id: string } }>("/api/radio/youtube/:id", async (req) => { radio.saveYoutube(radio.youtube().filter((s) => s.id !== req.params.id)); return { ok: true }; });
  // Station art: YouTube's thumbnail, fetched here so the page keeps its strict img-src 'self'.
  app.get<{ Params: { videoId: string } }>("/api/radio/youtube/:videoId/art", async (req, reply) => {
    if (!VIDEO_ID.test(req.params.videoId)) return reply.code(400).send();
    try {
      const r = await fetcher(`https://i.ytimg.com/vi/${req.params.videoId}/hqdefault.jpg`, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) return reply.code(404).send();
      return reply.header("Content-Type", "image/jpeg").header("Cache-Control", "max-age=86400").send(Buffer.from(await r.arrayBuffer()));
    } catch { return reply.code(502).send(); }
  });
  app.post("/api/radio/setup", async () => { await radio.setup(); return { root: radio.root, ok: true }; });
  app.post("/api/radio/reveal", async (_req, reply) => {
    if (!existsSync(radio.root)) await radio.setup();
    execFile("open", [radio.root]);
    return reply.send({ ok: true });
  });
  app.get<{ Params: { id: string } }>("/api/radio/tracks/:id/audio", async (req, reply) => {
    let t = radio.file(req.params.id);
    if (!t) { await radio.stations(); t = radio.file(req.params.id); } // listed since the last restart
    if (!t) return reply.code(404).send({ error: "no such track" });
    return stream(reply, t.file, req.headers.range);
  });
  // What is really playing, as reported by the player in the app (it's the only one that knows). Spark, the notch and
  // agents read this instead of guessing, so "pause the radio" matches reality. A report older than 75 s (the app
  // closed, or it stopped heartbeating) counts as off.
  let playing: { playing: boolean; title: string | null; station: string | null; at: number } = { playing: false, title: null, station: null, at: 0 };
  app.post<{ Body: { playing?: unknown; title?: unknown; station?: unknown } }>("/api/radio/status", async (req) => {
    const b = req.body ?? {};
    playing = { playing: b.playing === true, title: typeof b.title === "string" ? b.title.slice(0, 200) : null, station: typeof b.station === "string" ? b.station.slice(0, 200) : null, at: Date.now() };
    return { ok: true };
  });
  app.get("/api/radio/status", async () => (Date.now() - playing.at > 75_000 ? { playing: false, title: null, station: null, fresh: false } : { ...playing, fresh: true }));
  // Commands: Spark, agents (via the radio skill) and the terminal drive the player that's open in the app.
  app.post("/api/radio/command", async (req, reply) => {
    const c = parseCommand(req.body);
    if (!c) return reply.code(400).send({ error: 'cmd must be play, pause, resume, next, previous, stop or volume' });
    if (c.cmd === "play" && c.station) {
      const s = matchStation(await radio.stations(), c.station);
      // Your own music first; then a YouTube station you named ("lofi girl", "chillhop"); then one of the same kind.
      const named = !s?.tracks.length ? matchYoutube(radio.youtube(), c.station) : undefined;
      if (named) { c.station = named.id; const sent = radio.command(c); return sent.listeners ? { ok: true, station: named.name } : reply.code(409).send({ error: "ShuaCrew isn't open, so there's no player to control." }); }
      if (!s || !s.tracks.length) {
        // No local music for that yet: tune to a live YouTube station of the same kind instead of saying no.
        const genre = /jazz/i.test(c.station) || /jazz/i.test(s?.name ?? "") ? "Lofi Jazz" : /hip|lofi|lo-fi|beats|study|chill/i.test(c.station) || /hip/i.test(s?.name ?? "") ? "Lofi Hip-Hop" : null;
        const live = genre ? radio.youtube().find((x) => x.genre === genre) : undefined;
        if (!live) return s ? reply.code(409).send({ error: `${s.name} has no tracks yet — add audio files to ${path.join(radio.root, s.name)}.` }) : reply.code(404).send({ error: `No station called "${c.station}".` });
        c.station = live.id;
        const sent = radio.command(c);
        return sent.listeners ? { ok: true, station: live.name } : reply.code(409).send({ error: "ShuaCrew isn't open, so there's no player to control." });
      }
      c.station = s.id;
    }
    const sent = radio.command(c);
    return sent.listeners ? { ok: true } : reply.code(409).send({ error: "ShuaCrew isn't open, so there's no player to control." });
  });
  app.get("/api/radio/events", (req, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
    reply.raw.write(": radio\n\n");
    const off = radio.subscribe((c) => reply.raw.write(`data: ${JSON.stringify(c)}\n\n`));
    const ping = setInterval(() => reply.raw.write(": ping\n\n"), 25_000);
    req.raw.on("close", () => { off(); clearInterval(ping); });
  });
  return radio;
}

/** The radio as a Claude Code skill in ShuaCrew's plugin: every crew session (and Spark) can put music on. */
export const RADIO_SKILL = `---
name: shuacrew-radio
description: Play, pause, skip or change ShuaCrew Radio (lofi jazz, lofi hip-hop, or any station folder the user made) and set its volume. Use when the user asks for music, lofi, focus music, "put something on", or to control what's playing.
---

# ShuaCrew Radio

ShuaCrew Radio plays the user's own music files. Each station is a folder in \`~/Music/ShuaCrew Radio\`
(starters: **Lofi Jazz**, **Lofi Hip-Hop**). The player lives in the ShuaCrew app; you control it through the
local gateway. Every request needs the header \`X-ShuaCrew: 1\`.

## See what's available

\`\`\`bash
curl -s http://127.0.0.1:7420/api/radio | python3 -c 'import json,sys; [print(s["name"], len(s["tracks"]), "tracks") for s in json.load(sys.stdin)["stations"]]'
\`\`\`

## Control it

\`\`\`bash
R() { curl -s -X POST http://127.0.0.1:7420/api/radio/command -H 'X-ShuaCrew: 1' -H 'Content-Type: application/json' -d "$1"; }
R '{"cmd":"play","station":"lofi jazz"}'      # start a station ("jazz", "hip hop" also work)
R '{"cmd":"pause"}'   R '{"cmd":"resume"}'   R '{"cmd":"next"}'   R '{"cmd":"previous"}'   R '{"cmd":"stop"}'
R '{"cmd":"volume","value":40}'               # 0-100
\`\`\`

## Rules

- Never download, generate or fetch music from the internet. Only the user's files play.
- If a station has no tracks, say so and tell the user which folder to drop files into
  (\`POST /api/radio/setup\` creates the starter folders; \`POST /api/radio/reveal\` opens them in Finder).
- A 409 "ShuaCrew isn't open" means the app is closed: tell the user rather than retrying.
`;

export function installRadioSkill(pluginRoot: string) {
  const dir = path.join(pluginRoot, "skills", "shuacrew-radio");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "SKILL.md"), RADIO_SKILL);
  writeFileSync(path.join(dir, ".source"), "yours\n");
}
