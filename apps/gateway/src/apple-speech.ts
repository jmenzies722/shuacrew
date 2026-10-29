import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { z } from "zod";
import type { SpeechRequest } from "@shuacrew/core/voice";
import { SpeechService, type SpeechChunk } from "./speech.js";

/**
 * The Mac's own voices (Premium and Enhanced) as Spark voices: a small Swift worker keeps AVSpeechSynthesizer warm and
 * renders each sentence to WAV, through the same queue and JSON-line protocol as the local models. Siri voices are
 * withheld from apps by macOS, so only downloadable voices appear (System Settings → Accessibility → Spoken Content).
 */
const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../speech/apple-worker.swift");
export const APPLE_PREFIX = "apple-";
export const isAppleVoice = (id: string) => id.startsWith(APPLE_PREFIX);

export interface AppleVoice { id: string; name: string; accent: string; description: string; engine: "apple"; identifier: string; quality: "premium" | "enhanced" }
const listed = z.array(z.object({ identifier: z.string().regex(/^[\w.-]{1,200}$/), name: z.string().min(1).max(80), language: z.string().max(20), quality: z.enum(["premium", "enhanced"]), gender: z.string() }));

/** com.apple.voice.premium.en-US.Zoe → apple-zoe-premium: stable, and inside the gateway's voice id pattern. */
export function appleVoiceId(identifier: string, quality: string): string {
  const name = identifier.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${APPLE_PREFIX}${name}-${quality}`.slice(0, 40);
}

/** Premium before Enhanced, then by name: the first one is the best default. */
export function appleVoices(raw: unknown): AppleVoice[] {
  return listed.parse(raw).map(v => ({
    id: appleVoiceId(v.identifier, v.quality), name: `${v.name.replace(/\s*\((Premium|Enhanced)\)$/, "")} (Apple ${v.quality === "premium" ? "Premium" : "Enhanced"})`,
    accent: v.language, description: `Apple ${v.quality} voice on this Mac${v.gender === "unspecified" ? "" : ` · ${v.gender}`}`, engine: "apple" as const, identifier: v.identifier, quality: v.quality,
  })).sort((a, b) => (a.quality === b.quality ? a.name.localeCompare(b.name) : a.quality === "premium" ? -1 : 1));
}

const requestSchema = z.object({ id: z.string().regex(/^[\w-]{1,80}$/), generation: z.number().int().min(0), voiceId: z.string().regex(/^com\.apple\.[\w.-]{1,200}$/), text: z.string().trim().min(1).max(600), speed: z.number().min(0.8).max(1.2) });

export class AppleSpeech {
  private worker?: Promise<SpeechService>;
  private listed: AppleVoice[] = [];
  private listedAt = 0;
  private listing?: Promise<AppleVoice[]>;
  constructor(private options: { home: string; binary?: string }) {}

  /** The worker, compiled once per source version into the speech folder (~2 s, first use only). */
  private async binary(): Promise<string> {
    if (this.options.binary) return this.options.binary;
    const hash = createHash("sha256").update(readFileSync(source)).digest("hex").slice(0, 12);
    const out = path.join(this.options.home, `apple-worker-${hash}`);
    if (existsSync(out)) return out;
    mkdirSync(this.options.home, { recursive: true });
    await promisify(execFile)("/usr/bin/xcrun", ["swiftc", "-O", source, "-o", `${out}.tmp`], { timeout: 180_000 });
    renameSync(`${out}.tmp`, out);
    return out;
  }

  /** Installed voices as last read (refreshed in the background at most once a minute): status() stays instant. */
  voices(): AppleVoice[] {
    if (Date.now() - this.listedAt > 60_000) void this.refresh().catch(() => undefined);
    return this.listed;
  }
  refresh(): Promise<AppleVoice[]> {
    this.listing ??= this.binary().then(binary => new Promise<AppleVoice[]>((resolve, reject) => {
      const child = spawn(binary, [], { stdio: ["pipe", "pipe", "ignore"] });
      let buffer = "";
      const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Listing Apple voices timed out.")); }, 10_000);
      child.on("error", reject);
      child.on("exit", () => { clearTimeout(timer); reject(new Error("The Apple voice worker stopped before listing voices.")); });
      child.stdout.on("data", (data: Buffer) => {
        buffer += data.toString("utf8");
        for (const line of buffer.split("\n").slice(0, -1)) {
          const item = JSON.parse(line);
          if (item.type !== "voices") continue;
          clearTimeout(timer); child.kill("SIGTERM");
          return resolve(appleVoices(item.voices));
        }
      });
      child.stdin.end(JSON.stringify({ type: "list" }) + "\n");
    })).then(voices => { this.listed = voices; this.listedAt = Date.now(); return voices; }).finally(() => { this.listing = undefined; });
    return this.listing;
  }

  async *synthesize(request: SpeechRequest, signal: AbortSignal, warmup = false): AsyncGenerator<SpeechChunk> {
    const voice = (this.listed.find(v => v.id === request.voiceId) ? this.listed : await this.refresh()).find(v => v.id === request.voiceId);
    if (!voice) throw new Error("That Apple voice isn't installed. Download it in System Settings → Accessibility → Spoken Content.");
    const worker = await (this.worker ??= this.binary().then(binary => new SpeechService({ home: this.options.home, command: binary, args: [], validate: raw => requestSchema.parse(raw) })).catch(error => { this.worker = undefined; throw error; }));
    yield* worker.synthesize({ ...request, voiceId: voice.identifier }, signal, warmup);
  }

  close() { void this.worker?.then(w => w.close(), () => undefined); }
}
