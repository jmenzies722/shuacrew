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

export function tools(modelsDir = path.join(process.env.SHUACREW_HOME ?? path.join(HOME, ".shuacrew"), "models")): MediaTools {
  // The most accurate English model you have, else any model.
  const models = existsSync(modelsDir) ? readdirSync(modelsDir).filter((f) => /^ggml-.*\.bin$/.test(f)) : [];
  const rank = ["large-v3-turbo", "medium.en", "small.en", "base.en", "small", "base", "tiny.en", "tiny"];
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

function run(file: string, args: string[], timeoutMs = 300_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(`${path.basename(file)}: ${(stderr || error.message).toString().trim().split("\n").pop()}`));
      else resolve(stdout.toString());
    });
  });
}

/** Speech → text. `timestamps` keeps "[00:01.2 → 00:04.0]" markers (for video). */
export async function transcribe(file: string, options: { timestamps?: boolean } = {}, t = tools()): Promise<string> {
  if (!t.ffmpeg || !t.whisper || !t.model) throw new Error(`voice needs ${status(t).missing.join(", ")}`);
  const wav = path.join(os.tmpdir(), `shuacrew-${randomUUID().slice(0, 8)}.wav`);
  try {
    await run(t.ffmpeg, ["-y", "-loglevel", "error", "-i", file, "-vn", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav], 120_000);
    const threads = String(Math.max(2, Math.min(8, os.cpus().length - 2)));
    const out = await run(t.whisper, ["-m", t.model, "-f", wav, "-t", threads, "-np", ...(options.timestamps ? [] : ["-nt"])], 600_000);
    return out
      .split("\n")
      .map((l) => l.replace(/^\[(\d\d:\d\d:\d\d)\.\d+ --> (\d\d:\d\d:\d\d)\.\d+\]\s*/, (_, a: string, b: string) => `[${a.replace(/^00:/, "")}–${b.replace(/^00:/, "")}] `).trim())
      .filter((l) => l && !/^\[?(BLANK_AUDIO|MUSIC|NO SPEECH)\]?$/i.test(l.replace(/^\[[^\]]*\]\s*/, "")))
      .join(options.timestamps ? "\n" : " ")
      .trim();
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
