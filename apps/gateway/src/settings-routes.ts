import { existsSync, lstatSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { redact } from "@shuacrew/core";
import type { EventStore } from "./store.js";
import { GatewaySettings, standingInstructions, type GatewaySettingsPatch } from "./settings.js";

const du = (target: string, depth = 0): number => {
  try {
    const st = lstatSync(target);
    if (!st.isDirectory() || st.isSymbolicLink()) return st.size;
    return depth > 16 ? 0 : readdirSync(target).reduce((s, n) => s + du(path.join(target, n), depth + 1), 0);
  } catch { return 0; }
};

export function settingsRoutes(app: FastifyInstance, deps: {
  settings: GatewaySettings; store: EventStore; home: string; builtinProtected: string[];
  persona?: (member: string) => string | undefined; status?: () => unknown; runtimes?: () => unknown;
}) {
  const { settings, store, home } = deps;
  app.get("/api/settings", async () => ({ ...settings.get(), builtinProtected: deps.builtinProtected }));
  app.post<{ Body: GatewaySettingsPatch }>("/api/settings", async (req, reply) => {
    try { return settings.update(req.body ?? {}); } catch (error) {
      // One readable sentence, not a validation dump: "git.branchPrefix: Letters, numbers, . _ - and / — ending in /".
      const issue = (error as { issues?: Array<{ path: PropertyKey[]; message: string }> }).issues?.[0];
      return reply.code(400).send({ error: issue ? `${issue.path.map(String).join(".")}: ${issue.message}` : (error as Error).message.slice(0, 300) });
    }
  });
  // Time machine: what changed at each save, newest first; restore any version.
  app.get("/api/settings/history", async () => {
    const list = settings.history(), cur = settings.get() as Record<string, unknown>;
    return list.map((h, i) => {
      const after = (list[i + 1]?.value ?? cur) as Record<string, unknown>, before = h.value as Record<string, unknown>;
      return { at: h.at, changed: Object.keys(after).filter((k) => JSON.stringify(after[k]) !== JSON.stringify(before[k])) };
    }).reverse();
  });
  app.post<{ Body: { at?: number } }>("/api/settings/restore", async (req, reply) => {
    try { return settings.restore(Number(req.body?.at)); } catch (e) { return reply.code(400).send({ error: (e as Error).message }); }
  });
  // Exactly what an agent would receive as your instructions (plus the member's persona), for a repo.
  app.get<{ Querystring: { repo?: string; member?: string } }>("/api/settings/instructions-preview", async (req) => {
    const parts = [standingInstructions(settings.get(), req.query.repo || undefined), req.query.member ? deps.persona?.(req.query.member) : undefined].filter(Boolean);
    return { text: parts.join("\n\n") };
  });

  // Local speech: what is on disk, what's in use, and which leftovers are safe to remove.
  const speech = path.join(home, "speech"), activeInstalled = existsSync(path.join(speech, "installed/.ready"));
  const components = () => {
    const items: Array<{ id: string; label: string; detail: string; bytes: number; inUse: boolean; removable: boolean }> = [];
    const add = (id: string, label: string, detail: string, paths: string[], inUse: boolean, removable: boolean) => {
      const existing = paths.filter(p => existsSync(p));
      if (existing.length) items.push({ id, label, detail, bytes: existing.reduce((s, p) => s + du(p), 0), inUse, removable });
    };
    add("voice", "Shua voice engine", "Local neural voices (Qwen, pinned). Needed for spoken replies.", [path.join(speech, "installed")], activeInstalled, false);
    add("whisper", "Speech-to-text (Whisper base.en)", "Turns your voice notes into text on this Mac.", [path.join(home, "models")], true, false);
    // The pre-installer copy is only unused once the installed engine is active.
    add("leftover", "Old voice engine copy", activeInstalled ? "Left from before the installer. Not used — safe to remove." : "Currently used — install the voice engine first.", [path.join(speech, "models"), path.join(speech, "venv")], !activeInstalled, activeInstalled);
    const previous = existsSync(speech) ? readdirSync(speech).filter(n => /^previous-[0-9a-f-]{36}$/.test(n)).map(n => path.join(speech, n)) : [];
    add("previous", "Replaced voice installs", "Kept after an upgrade in case you needed to roll back.", previous, false, true);
    add("partial", "Unfinished voice download", "From a cancelled setup. Removing it means a retry downloads from scratch.", [path.join(speech, "setup-partial")], false, true);
    add("auditions", "Voice preview cache", "Short samples from Settings → Voice. Rebuilt on demand.", [path.join(speech, "auditions")], false, true);
    return items;
  };
  app.get("/api/speech/storage", async () => ({ components: components() }));
  app.post<{ Body: { id?: string } }>("/api/speech/storage/clean", async (req, reply) => {
    const item = components().find(c => c.id === req.body?.id);
    if (!item?.removable) return reply.code(400).send({ error: "That component is in use or not removable" });
    const targets = item.id === "leftover" ? [path.join(speech, "models"), path.join(speech, "venv")]
      : item.id === "previous" ? readdirSync(speech).filter(n => /^previous-[0-9a-f-]{36}$/.test(n)).map(n => path.join(speech, n))
      : item.id === "partial" ? [path.join(speech, "setup-partial")] : [path.join(speech, "auditions")];
    for (const t of targets) if (path.dirname(t) === speech) rmSync(t, { recursive: true, force: true });
    return { freed: item.bytes, components: components() };
  });

  // One redacted report for debugging: versions, health, settings shape, recent log. No secrets, no prompts.
  app.get("/api/dev/diagnostics", async () => {
    const s = settings.get();
    let log: string[] = [];
    try { const { readFileSync } = await import("node:fs"); log = readFileSync(path.join(home, "gateway.log"), "utf8").split("\n").slice(-200).map(redact); } catch { /* no log */ }
    return {
      kind: "shuacrew-diagnostics", createdAt: new Date().toISOString(),
      system: { platform: `${os.platform()} ${os.release()}`, arch: os.arch(), node: process.version, memoryMB: Math.round(process.memoryUsage().rss / 1048576), uptimeS: Math.round(process.uptime()) },
      events: { head: store.head, audit: store.verify() },
      status: deps.status?.(), runtimes: deps.runtimes?.(),
      settings: { failoverOrder: s.failoverOrder, git: s.git, quietHours: s.quietHours, flags: s.flags, protectedPaths: s.protectedPaths.length, instructionsChars: s.instructions.global.length + Object.values(s.instructions.projects).reduce((n, t) => n + t.length, 0) },
      speech: components().map(({ id, bytes, inUse }) => ({ id, bytes, inUse })),
      log,
    };
  });
}
