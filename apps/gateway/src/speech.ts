import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { SpeechRequest } from "@shuacrew/core/voice";
import { SpeechInstaller } from "./speech-install.js";

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../speech");
const identifier = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/);
const modelSchema = z.object({ repository: z.string().regex(/^[\w-]+\/[\w.-]+$/), revision: z.string().regex(/^[a-f0-9]{40}$/), directory: identifier, bytes: z.number().positive(), license: z.string().min(1) });
const manifestSchema = z.object({ version: z.literal(1), models: z.record(z.string(), modelSchema), voices: z.array(z.object({ id: identifier, name: z.string().min(1), accent: z.enum(["en-US", "en-GB"]), description: z.string(), engine: z.enum(["qwen", "pocket"]), speaker: identifier.or(z.enum(["Aiden", "Ryan"])), license: z.string().min(1), source: z.string().url(), attribution: z.string().optional() })).min(1).max(4) }).superRefine((m, ctx) => {
  if (new Set(m.voices.map(v => v.id)).size !== m.voices.length || m.voices.some(v => !m.models[v.engine])) ctx.addIssue({ code: "custom", message: "Duplicate voice or missing model" });
});
export type SpeechManifest = z.infer<typeof manifestSchema>;
export const validateManifest = (input: unknown): SpeechManifest => manifestSchema.parse(input);
export const speechManifest = validateManifest(JSON.parse(readFileSync(path.join(directory, "manifest.json"), "utf8")));
const requestSchema = z.object({ id: z.string().regex(/^[\w-]{1,80}$/), generation: z.number().int().min(0), voiceId: identifier, text: z.string().trim().min(1).max(600), speed: z.number().min(0.8).max(1.2) });
export function validateSpeechRequest(input: unknown, manifest = speechManifest): SpeechRequest {
  const request = requestSchema.parse(input);
  if (!manifest.voices.some(v => v.id === request.voiceId)) throw new Error("Choose one of the available voices.");
  return request;
}
export type SpeechChunk = { id: string; generation: number; type: "audio"; data: string } | { id: string; generation: number; type: "done" };

/** One local process, one inference at a time. A cancelled inference kills the worker,
 * so even an uncooperative engine cannot send audio into the next request. */
export class SpeechService {
  readonly installer: SpeechInstaller;
  private child?: ChildProcessWithoutNullStreams;
  private idle?: ReturnType<typeof setTimeout>;
  private warmMinutes = 5;
  private active = false;
  private closed = false;
  private ids = new Set<string>();
  private waiting: Array<() => void> = [];
  constructor(private options: { home: string; command?: string; args?: string[]; timeoutMs?: number }) { this.installer = new SpeechInstaller(options.home); }
  private root() { return existsSync(path.join(this.options.home, "installed/.ready")) ? path.join(this.options.home, "installed") : this.options.home; }
  status() {
    const ready = existsSync(path.join(this.root(), "venv/bin/python")) && existsSync(path.join(this.root(), "models/qwen-custom-4bit/model.safetensors"));
    const setup = this.installer.status();
    return { state: setup.state === "installing" ? "installing" : ready ? "ready" : setup.state, voices: speechManifest.voices, audition: true, step: setup.step, error: ready ? undefined : setup.error ?? "Download local speech models to get started. Allow approximately 3–4 GB of downloads and 8 GiB free disk space." };
  }
  private kill() {
    clearTimeout(this.idle);
    this.child?.kill("SIGKILL");
    this.child = undefined;
  }
  close() { this.closed = true; this.installer.cancel(); this.kill(); for (const wake of this.waiting.splice(0)) wake(); }
  async warm(voiceId: string, signal: AbortSignal, warmMinutes = 5) {
    if (![2, 5, 10].includes(warmMinutes)) throw new Error("Choose a warm retention of 2, 5 or 10 minutes.");
    this.warmMinutes = warmMinutes;
    for await (const chunk of this.synthesize({ id: crypto.randomUUID(), generation: 0, voiceId, text: "Warm up.", speed: 1 }, signal, true)) {
      if (chunk.type === "audio") throw new Error("Warmup unexpectedly generated audio.");
    }
    return { ready: true };
  }
  async *synthesize(raw: SpeechRequest, signal: AbortSignal, warmup = false): AsyncGenerator<SpeechChunk> {
    const request = validateSpeechRequest(raw);
    if (this.closed) throw new Error("Speech service is closed.");
    signal.throwIfAborted();
    if (this.ids.has(request.id)) throw new Error("Speech request is already active.");
    if (this.waiting.length >= 3) throw new Error("Speech queue is full. Try again shortly.");
    this.ids.add(request.id);
    let acquired = false;
    try {
      if (this.active) await new Promise<void>((resolve, reject) => {
        const next = () => { signal.removeEventListener("abort", abort); resolve(); };
        const abort = () => { this.waiting = this.waiting.filter(f => f !== next); reject(new Error("Speech cancelled.")); };
        this.waiting.push(next);
        signal.addEventListener("abort", abort, { once: true });
      });
      acquired = true;
      this.active = true;
      signal.throwIfAborted();
      if (this.closed) throw new Error("Speech service is closed.");
      clearTimeout(this.idle);
      const root = this.root();
      const child = this.child ??= spawn(this.options.command ?? path.join(root, "venv/bin/python"), this.options.args ?? [path.join(directory, "worker.py"), root], { stdio: "pipe", env: { ...process.env, ...(existsSync(path.join(root, "models/hub")) ? { HF_HUB_CACHE: path.join(root, "models/hub") } : {}), HF_HUB_OFFLINE: "1", TOKENIZERS_PARALLELISM: "false", PYTHONUNBUFFERED: "1" } });
      // Never forward raw model diagnostics or user text into the gateway log.
      child.stderr.resume();
      const queue: SpeechChunk[] = [];
      let wake: (() => void) | undefined, failure: Error | undefined, complete = false, buffer = "", bytes = 0;
      const fail = (error: Error) => { failure ??= error; this.kill(); wake?.(); };
      const onData = (data: Buffer) => {
        buffer += data.toString("utf8");
        if (buffer.length > 4 * 1024 * 1024) return fail(new Error("Speech output exceeded its limit."));
        for (;;) {
          const newline = buffer.indexOf("\n");
          if (newline < 0) break;
          const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
          try {
            const item = JSON.parse(line);
            if (item.type === "ready") continue;
            if (item.id !== request.id) throw new Error("Unexpected speech response.");
            if (item.type === "error") throw new Error("Local voice synthesis failed. Retry or choose another voice.");
            if (item.type === "audio") {
              if (typeof item.data !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(item.data)) throw new Error("Invalid speech audio.");
              const audio = Buffer.from(item.data, "base64");
              bytes += audio.length;
              if (audio.length < 44 || audio.toString("ascii", 0, 4) !== "RIFF" || audio.toString("ascii", 8, 12) !== "WAVE" || bytes > 16 * 1024 * 1024 || queue.length >= 256) throw new Error("Invalid or excessive speech audio.");
              queue.push({ id: request.id, generation: request.generation, type: "audio", data: item.data });
            } else if (item.type === "done") {
              complete = true;
              queue.push({ id: request.id, generation: request.generation, type: "done" });
            } else throw new Error("Invalid speech response.");
            wake?.();
          } catch (error) { fail(error instanceof Error ? error : new Error("Invalid speech output.")); break; }
        }
      };
      const onExit = () => { if (!complete) fail(new Error("Local speech process stopped. Please retry.")); if (this.child === child) this.child = undefined; };
      const onError = () => fail(new Error("Local speech could not start. Check speech setup."));
      const onAbort = () => fail(new Error("Speech cancelled."));
      child.stdout.on("data", onData); child.on("error", onError); child.on("exit", onExit); child.stdin.on("error", onError);
      signal.addEventListener("abort", onAbort, { once: true });
      const timeout = setTimeout(() => fail(new Error("Local speech timed out. Please retry.")), this.options.timeoutMs ?? (warmup ? 90_000 : 30_000));
      try {
        child.stdin.write(JSON.stringify({ ...request, warmup }) + "\n");
        for (;;) {
          signal.throwIfAborted();
          if (failure) throw failure;
          const item = queue.shift();
          if (item) { yield item; if (item.type === "done") break; }
          else await new Promise<void>(resolve => { wake = resolve; });
        }
      } finally {
        clearTimeout(timeout);
        signal.removeEventListener("abort", onAbort);
        child.stdout.off("data", onData); child.off("error", onError); child.off("exit", onExit); child.stdin.off("error", onError);
        if (!complete) this.kill();
        // Keep an error listener on the idle child (a late stdin error is harmless).
        child.on("error", () => {}); child.stdin.on("error", () => {});
      }
    } finally {
      this.ids.delete(request.id);
      if (acquired) {
        const next = this.waiting.shift();
        if (next) next(); else { this.active = false; this.idle = setTimeout(() => this.kill(), this.warmMinutes * 60_000); this.idle.unref(); }
      }
    }
  }
}
