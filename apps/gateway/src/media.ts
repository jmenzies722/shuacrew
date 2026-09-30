/**
 * Voice, photo and video — processed on this Mac, nothing uploaded anywhere.
 *
 *  - Voice: speech → text with whisper.cpp (whisper-cli + a local ggml model).
 *  - Photos: HEIC → JPEG (agents can't read HEIC), and very large images scaled down so they cost
 *    fewer tokens. macOS `sips` does both.
 *  - Video: keyframes at even intervals (with timestamps) and a timestamped transcript of the audio,
 *    written up as one Markdown file the agent reads — so it can "watch" the video.
 *
 * Every tool is optional: without ffmpeg or whisper the file is still attached as-is, and the
 * status says what's missing and how to add it.
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const HOME = process.env.HOME ?? os.homedir();
const find = (names: string[]) => names.find((p) => existsSync(p));
const bin = (name: string) => find([`/opt/homebrew/bin/${name}`, `/usr/local/bin/${name}`, ...(process.env.PATH ?? "").split(":").map((d) => path.join(d, name))]);

export interface MediaTools {
  ffmpeg?: string;
  ffprobe?: string;
  whisper?: string;
  model?: string;
}

export function tools(modelsDir = path.join(process.env.SHUACREW_HOME ?? path.join(HOME, ".shuacrew"), "models"), speed: "accurate" | "fast" = "accurate"): MediaTools {
  // Accurate: the best English model you have. Fast (live captions while you talk): the quickest good one.
  const models = existsSync(modelsDir) ? readdirSync(modelsDir).filter((f) => /^ggml-.*\.bin$/.test(f)) : [];
  const rank = speed === "fast" ? ["base.en", "small.en", "tiny.en", "base", "small", "large-v3-turbo", "medium.en", "tiny"] : ["large-v3-turbo", "medium.en", "small.en", "base.en", "small", "base", "tiny.en", "tiny"];
  const best = [...models].sort((a, b) => rank.findIndex((r) => a.includes(r)) - rank.findIndex((r) => b.includes(r)))[0];
  return { ffmpeg: bin("ffmpeg"), ffprobe: bin("ffprobe"), whisper: bin("whisper-cli") ?? bin("whisper-cpp"), model: best ? path.join(modelsDir, best) : undefined };
}

export function status(t = tools()) {
  return {
    voice: Boolean(t.ffmpeg && t.whisper && t.model),
    video: Boolean(t.ffmpeg && t.ffprobe),
    photos: process.platform === "darwin",
    missing: [
      !t.ffmpeg && "ffmpeg (brew install ffmpeg)",
      !t.whisper && "whisper-cli (brew install whisper-cpp)",
      t.whisper && !t.model && "a speech model in ~/.shuacrew/models (ggml-base.en.bin from huggingface.co/ggerganov/whisper.cpp)",
    ].filter(Boolean) as string[],
  };
}

function run(file: string, args: string[], timeoutMs = 300_000, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, signal }, (error, stdout, stderr) => {
      if (error) reject(new Error(`${path.basename(file)}: ${(stderr || error.message).toString().trim().split("\n").pop()}`));
      else resolve(stdout.toString());
    });
  });
}

/** Speech → text. `timestamps` keeps "[00:01.2 → 00:04.0]" markers (for video). */
/** Whisper's vocabulary hint: the names and terms you say, so it spells them right. Short and comma-separated works best. */
export function vocabulary(words: string[]): string {
  // "Hey Shua" first: without it Whisper hears the wake phrase as one word ("Heishua").
  const base = ["Hey Shua", "ShuaCrew", "Spark", "Shua", "Claude", "Codex", "crew", "session", "playbook", "venture", "Kubernetes", "TypeScript", "Swift", "GitHub", "deploy", "pull request", "API"];
  const seen = new Set<string>(), out: string[] = [];
  for (const w of [...words, ...base]) { const k = w.trim(); if (k && k.length <= 40 && !seen.has(k.toLowerCase())) { seen.add(k.toLowerCase()); out.push(k); } }
  return out.slice(0, 60).join(", ");
}

/** A rough sound-alike key: case, h's, doubled letters and vowel colour don't matter ("Ria" ~ "Rhea", "Shuaa" ~ "Shua"). */
const soundKey = (w: string) => w.toLowerCase().replace(/[^a-z]/g, "").replace(/h/g, "").replace(/(.)\1+/g, "$1").replace(/[aeiouy]+/g, "a");

/**
 * Snap names Whisper almost got right to their exact spelling. Only capitalized words mid-sentence (a name,
 * not the first word of a sentence) are touched, so everyday words are never "corrected".
 */
export function fixNames(text: string, names: string[]): string {
  // The wake phrase, however Whisper split or spelled it: "Heishua", "Hei Shuaa", "hey, shua".
  text = text.replace(/\bhe[iy]?,?\s*shu+a+\b/gi, "Hey Shua");
  const byKey = new Map<string, string>();
  for (const n of names) { const k = soundKey(n); if (k.length >= 2 && !/\s/.test(n)) byKey.set(k, n); }
  return text.replace(/(^|[.!?]\s+|\s)([A-Z][A-Za-z']+)/g, (all, lead: string, word: string, offset: number) => {
    const sentenceStart = offset === 0 || /[.!?]\s+$/.test(lead);
    if (sentenceStart) return all;
    const exact = byKey.get(soundKey(word));
    return exact && exact !== word ? lead + exact : all;
  });
}

/** "en" (default), "auto" (Whisper detects it), or a two-letter language code; anything else falls back to English. */
export function languageArg(language?: string) { return language === "auto" || (language && /^[a-z]{2}$/.test(language)) ? language : "en"; }

/**
 * Whisper always encodes a 30 s window, however short the clip; the encoder is most of the time. A spoken turn gets a
 * window fitted to its length (50 frames a second, rounded up, with room to spare): the big model then runs in ~0.8 s
 * instead of ~1.4 s on an M1 Pro, just as accurate. Too small a window would cut the end off, so never under the clip.
 */
export function fittedAudioCtx(seconds: number): number {
  return Math.min(1500, Math.max(512, Math.ceil(((seconds + 1.5) * 50) / 64) * 64));
}

/**
 * Whisper sometimes says a turn twice or three times over ("Can you open Finder…? Can you open Finder…?"): a phrase
 * repeated back to back, word for word, is kept once. Only whole runs of 3+ words, so "no, no" or "very very" stay.
 */
export function withoutRepeats(text: string): string {
  const words = text.split(/\s+/).filter(Boolean);
  const key = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");
  for (let size = Math.floor(words.length / 2); size >= 3; size--) {
    for (let i = 0; i + 2 * size <= words.length; i++) {
      let same = true;
      for (let k = 0; k < size && same; k++) same = key(words[i + k]!) === key(words[i + size + k]!);
      if (same) return withoutRepeats([...words.slice(0, i + size), ...words.slice(i + 2 * size)].join(" "));
    }
  }
  return words.join(" ");
}

export async function transcribe(file: string, options: { timestamps?: boolean; signal?: AbortSignal; timeoutMs?: number; prompt?: string; fast?: boolean; language?: string; model?: "fast" | "accurate"; fitWindow?: boolean } = {}, t = tools(undefined, options.model ?? (options.fast ? "fast" : "accurate"))): Promise<string> {
  options.signal?.throwIfAborted();
  if (!t.ffmpeg || !t.whisper || !t.model) throw new Error(`voice needs ${status(t).missing.join(", ")}`);
  const wav = path.join(os.tmpdir(), `shuacrew-${randomUUID().slice(0, 8)}.wav`);
  try {
    // A spoken turn starts with the mic's pre-roll and ends with its tail: Whisper hears that quiet as "you" and, with a
    // fitted window, can say a short turn twice ("Show me an example of it Show me an example of it"). Cut the quiet
    // off both ends and shorten long pauses; measured on 20 turns: 7.8% → 2.8% word errors, no repeats, same speed.
    const quiet = options.fitWindow ? ["-af", "silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.2:stop_periods=-1:stop_threshold=-40dB:stop_silence=0.35"] : [];
    await run(t.ffmpeg, ["-y", "-loglevel", "error", "-i", file, "-vn", ...quiet, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav], options.timeoutMs ?? 120_000, options.signal);
    const threads = String(Math.max(2, Math.min(8, os.cpus().length - 2)));
    const seconds = Math.max(0, statSync(wav).size - 44) / 32_000; // 16 kHz mono 16-bit
    if (options.fitWindow && seconds < 0.25) return ""; // nothing but quiet: no words, rather than an invented "you"
    const window = options.fitWindow && seconds < 28 ? ["-ac", String(fittedAudioCtx(seconds))] : [];
    const out = await run(t.whisper, ["-m", t.model, "-f", wav, "-t", threads, "-np", "-l", languageArg(options.language), ...(options.fast ? ["-bs", "1", "-bo", "1"] : ["-bs", "5"]), ...window, ...(options.prompt ? ["--prompt", options.prompt] : []), ...(options.timestamps ? [] : ["-nt"])], options.timeoutMs ?? 600_000, options.signal);
    const text = out
      .split("\n")
      .map((l) => l.replace(/^\[(\d\d:\d\d:\d\d)\.\d+ --> (\d\d:\d\d:\d\d)\.\d+\]\s*/, (_, a: string, b: string) => `[${a.replace(/^00:/, "")}–${b.replace(/^00:/, "")}] `).trim())
      .filter((l) => l && !/^\[?(BLANK_AUDIO|MUSIC|NO SPEECH)\]?$/i.test(l.replace(/^\[[^\]]*\]\s*/, "")))
      .join(options.timestamps ? "\n" : " ")
      .trim();
    return options.timestamps ? text : withoutRepeats(text);
  } finally {
    rmSync(wav, { force: true });
  }
}

/** HEIC → JPEG, and anything over 2400px on its long side scaled down. Returns the file the agent should read. */
export async function preparePhoto(file: string): Promise<string | undefined> {
  if (process.platform !== "darwin") return undefined;
  const heic = /\.(heic|heif)$/i.test(file);
  const info = await run("/usr/bin/sips", ["-g", "pixelWidth", "-g", "pixelHeight", file], 20_000).catch(() => "");
  const w = Number(/pixelWidth: (\d+)/.exec(info)?.[1] ?? 0);
  const h = Number(/pixelHeight: (\d+)/.exec(info)?.[1] ?? 0);
  if (!heic && Math.max(w, h) <= 2400) return undefined;
  const out = file.replace(/\.[^.]+$/, "") + ".agent.jpg";
  await run("/usr/bin/sips", ["-s", "format", "jpeg", "-s", "formatOptions", "85", ...(Math.max(w, h) > 2400 ? ["-Z", "2400"] : []), file, "--out", out], 60_000);
  return out;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Keyframes + a timestamped transcript, written up as <video>.analysis.md next to it. */
export async function prepareVideo(file: string, name: string, t = tools()): Promise<{ analysis: string; frames: string[]; transcript?: string; duration: number }> {
  if (!t.ffmpeg || !t.ffprobe) throw new Error("video needs ffmpeg (brew install ffmpeg)");
  const probe = JSON.parse(await run(t.ffprobe, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file], 30_000)) as {
    format?: { duration?: string };
    streams?: Array<{ codec_type?: string; width?: number; height?: number; r_frame_rate?: string }>;
  };
  const duration = Number(probe.format?.duration ?? 0);
  const video = probe.streams?.find((s) => s.codec_type === "video");
  const hasAudio = probe.streams?.some((s) => s.codec_type === "audio");
  // One frame every few seconds for short clips, capped at 16 for long ones.
  const count = Math.max(1, Math.min(16, Math.round(duration / 4) || 1));
  const dir = path.join(path.dirname(file), "frames");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const frames: Array<{ at: number; file: string }> = [];
  for (let i = 0; i < count; i++) {
    const at = duration ? (duration * (i + 0.5)) / count : 0;
    const out = path.join(dir, `frame-${String(i + 1).padStart(2, "0")}.jpg`);
    await run(t.ffmpeg, ["-y", "-loglevel", "error", "-ss", at.toFixed(2), "-i", file, "-frames:v", "1", "-vf", "scale='min(1280,iw)':-2", "-q:v", "3", out], 60_000);
    if (existsSync(out)) frames.push({ at, file: out });
  }
  let transcript: string | undefined;
  if (hasAudio && t.whisper && t.model) transcript = await transcribe(file, { timestamps: true }, t).catch(() => undefined);
  const analysis = file.replace(/\.[^.]+$/, "") + ".analysis.md";
  writeFileSync(
    analysis,
    [
      `# Video: ${name}`,
      "",
      `Length ${clock(duration)}${video?.width ? ` · ${video.width}×${video.height}` : ""}${hasAudio ? "" : " · no audio"}. The original is at ${file}.`,
      "",
      "## Keyframes",
      "Read each image to see the video at that moment:",
      ...frames.map((f) => `- ${clock(f.at)} — ${f.file}`),
      "",
      "## What's said",
      transcript ? transcript : hasAudio ? "(the speech couldn't be transcribed — voice needs whisper-cli and a model)" : "(no audio track)",
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  return { analysis, frames: frames.map((f) => f.file), transcript, duration };
}

/** Which kind of processing a file gets, from its name. */
export function kindOf(name: string): "photo" | "audio" | "video" | undefined {
  if (/\.(heic|heif|jpe?g|png|webp|tiff?)$/i.test(name)) return "photo";
  if (/\.(mp3|m4a|wav|aac|ogg|oga|opus|flac|webm|caf|aiff?)$/i.test(name)) return name.toLowerCase().endsWith(".webm") ? "audio" : "audio";
  if (/\.(mp4|mov|m4v|mkv|avi)$/i.test(name)) return "video";
  return undefined;
}

export const sizeOf = (file: string) => (existsSync(file) ? statSync(file).size : 0);
