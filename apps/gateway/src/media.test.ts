import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { kindOf, status, tools } from "./media.js";
import { Uploads } from "./uploads.js";

const t = tools(path.join(os.homedir(), ".shuacrew", "models"));
const real = Boolean(t.ffmpeg && t.whisper && t.model && process.platform === "darwin");

describe("media", () => {
  it("knows what each file is", () => {
    expect(kindOf("IMG_0042.HEIC")).toBe("photo");
    expect(kindOf("memo.m4a")).toBe("audio");
    expect(kindOf("dictation.webm")).toBe("audio");
    expect(kindOf("demo.mov")).toBe("video");
    expect(kindOf("notes.pdf")).toBeUndefined();
    expect(status({}).missing).toEqual(["ffmpeg (brew install ffmpeg)", "whisper-cli (brew install whisper-cpp)"]);
  });

  // Uses this Mac's real ffmpeg, whisper-cli, model, `say` and `sips`.
  it.runIf(real)("turns a voice note into words and a video into keyframes plus a transcript", async () => {
    process.env.SHUACREW_HOME = path.join(os.homedir(), ".shuacrew");
    const dir = mkdtempSync(path.join(os.tmpdir(), "shua-media-"));
    const aiff = path.join(dir, "voice.aiff");
    execFileSync("say", ["-o", aiff, "Ship the landing page on Friday."]);
    const uploads = new Uploads(path.join(dir, "uploads"));

    const note = await uploads.process(uploads.save("voice.aiff", readFileSync(aiff)));
    expect(note.transcript?.toLowerCase()).toContain("landing page");
    expect(readFileSync(note.agentPath!, "utf8")).toContain("# Voice note: voice.aiff");

    // A 6-second video: a test pattern with the spoken sentence as its sound.
    const mp4 = path.join(dir, "demo.mp4");
    execFileSync(t.ffmpeg!, ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=10:duration=6", "-i", aiff, "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", mp4]);
    const video = await uploads.process(uploads.save("demo.mp4", readFileSync(mp4)));
    expect(video.frames).toBeGreaterThanOrEqual(1);
    const analysis = readFileSync(video.agentPath!, "utf8");
    expect(analysis).toMatch(/^# Video: demo\.mp4/);
    expect(analysis).toMatch(/- 0:0\d — .*frame-01\.jpg/);
    expect(analysis.toLowerCase()).toContain("landing page");
    expect(existsSync(analysis.match(/— (\/.*frame-01\.jpg)/)![1]!)).toBe(true);

    // A big PNG comes back as a JPEG the agent can read cheaply.
    const png = path.join(dir, "big.png");
    execFileSync(t.ffmpeg!, ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=3200x2000", "-frames:v", "1", png]);
    const photo = await uploads.process(uploads.save("big.png", readFileSync(png)));
    expect(photo.agentPath).toMatch(/\.agent\.jpg$/);
    expect(execFileSync("sips", ["-g", "pixelWidth", photo.agentPath!]).toString()).toContain("2400");
    writeFileSync(path.join(dir, "done"), "");
  }, 180_000);
});
