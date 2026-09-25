import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { z } from "zod";

/**
 * Settings the gateway itself enforces (not just the screen): failover order, standing
 * instructions, extra protected folders, git behaviour, quiet hours for automation, feature flags.
 * Stored as ~/.shuacrew/settings.json (0600). Every read and write is validated; a bad file falls
 * back to defaults instead of breaking the gateway.
 */
const minutes = z.number().int().min(0).max(1439);
export const GatewaySettingsSchema = z.object({
  version: z.literal(1).default(1),
  /** Where a run goes when its agent hits a limit, in order. Empty = any available agent. */
  failoverOrder: z.array(z.string().regex(/^[a-z0-9:-]{1,40}$/)).max(8).default([]),
  instructions: z.object({
    /** Every agent, every session. */
    global: z.string().max(8000).default(""),
    /** Keyed by absolute repo path. */
    projects: z.record(z.string().min(1).max(4096), z.string().max(8000)).default({}),
  }).default({ global: "", projects: {} }),
  /** Added to the built-in protected folders; agents can never read or change these. */
  protectedPaths: z.array(z.string().min(1).max(4096).refine(p => p.startsWith("/") || p.startsWith("~/"), "Use an absolute path or ~/…")).max(50).default([]),
  git: z.object({
    branchPrefix: z.string().max(40).regex(/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*\/$/, "Letters, numbers, . _ - and / — ending in /").default("shua/"),
    /** "shuacrew": commits by ShuaCrew. "me": your own git identity. */
    author: z.enum(["shuacrew", "me"]).default("shuacrew"),
    /** Land a run as one commit named after the session instead of every checkpoint. */
    squash: z.boolean().default(false),
    protectedBranches: z.array(z.string().regex(/^[A-Za-z0-9._/-]{1,100}$/)).max(20).default(["main", "master", "release", "production"]),
  }).default({ branchPrefix: "shua/", author: "shuacrew", squash: false, protectedBranches: ["main", "master", "release", "production"] }),
  /** Scheduled jobs, webhooks and heartbeats wait (queued) during these local hours. */
  quietHours: z.object({ enabled: z.boolean().default(false), start: minutes.default(22 * 60), end: minutes.default(7 * 60) }).default({ enabled: false, start: 22 * 60, end: 7 * 60 }),
  /** "If the prompt mentions …, use …" — applied only when you left agent and model on Auto. First match wins. */
  router: z.array(z.object({
    name: z.string().trim().min(1).max(40),
    match: z.string().trim().min(1).max(300),
    runtime: z.string().regex(/^[a-z0-9:-]{0,40}$/).default(""),
    model: z.string().regex(/^[A-Za-z0-9._:-]{0,64}$/).default(""),
    effort: z.enum(["", "low", "medium", "high", "max"]).default(""),
  })).max(20).default([]),
  /** Stop a session that runs past these (a follow-up continues it). null = no cap. */
  caps: z.object({ maxMinutes: z.number().int().min(1).max(1440).nullable().default(null), maxTokens: z.number().int().min(1000).max(1e9).nullable().default(null) }).default({ maxMinutes: null, maxTokens: null }),
  /** Your own shell commands when a session of yours finishes or fails. Env: SHUA_RUN_ID, SHUA_STATUS, SHUA_TITLE, SHUA_REPO. */
  hooks: z.object({ onDone: z.string().max(2000).default(""), onFailed: z.string().max(2000).default("") }).default({ onDone: "", onFailed: "" }),
  /** What the Mac menu-bar item shows beside its icon. */
  menuBar: z.enum(["attention", "running", "tokens", "off"]).default("attention"),
  flags: z.record(z.string().regex(/^[a-z0-9-]{1,40}$/), z.boolean()).default({}),
});
export type GatewaySettingsValue = z.infer<typeof GatewaySettingsSchema>;
export type GatewaySettingsPatch = { [K in keyof GatewaySettingsValue]?: GatewaySettingsValue[K] extends object ? Partial<GatewaySettingsValue[K]> : GatewaySettingsValue[K] };

export class GatewaySettings {
  private value: GatewaySettingsValue;
  constructor(private file: string) { this.value = this.load(); }
  private load(): GatewaySettingsValue {
    try {
      if (!existsSync(this.file)) return GatewaySettingsSchema.parse({});
      const parsed = GatewaySettingsSchema.safeParse(JSON.parse(readFileSync(this.file, "utf8")));
      return parsed.success ? parsed.data : GatewaySettingsSchema.parse({});
    } catch { return GatewaySettingsSchema.parse({}); }
  }
  get(): GatewaySettingsValue { return this.value; }
  /** Shallow-merges each section, validates the whole, writes atomically. Throws on invalid input. */
  update(patch: GatewaySettingsPatch): GatewaySettingsValue {
    const merged: Record<string, unknown> = { ...this.value };
    for (const [key, v] of Object.entries(patch ?? {})) {
      const current = (this.value as Record<string, unknown>)[key];
      merged[key] = v && typeof v === "object" && !Array.isArray(v) && current && typeof current === "object" && !Array.isArray(current) ? { ...current, ...v } : v;
    }
    const next = GatewaySettingsSchema.parse(merged);
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    renameSync(tmp, this.file);
    chmodSync(this.file, 0o600);
    this.value = next;
    return next;
  }
}

/** Is local time inside quiet hours? Handles windows that cross midnight (22:00 → 07:00). */
export function inQuietHours(q: GatewaySettingsValue["quietHours"], now = new Date()): boolean {
  if (!q.enabled || q.start === q.end) return false;
  const m = now.getHours() * 60 + now.getMinutes();
  return q.start < q.end ? m >= q.start && m < q.end : m >= q.start || m < q.end;
}

/** Your standing instructions for a run: global first, then the project's (most specific wins last). */
export function standingInstructions(s: GatewaySettingsValue, repo?: string): string | undefined {
  const parts: string[] = [];
  if (s.instructions.global.trim()) parts.push(`Standing instructions from the user (apply to all work):\n${s.instructions.global.trim()}`);
  const project = repo && Object.entries(s.instructions.projects).filter(([p]) => repo === p || repo.startsWith(`${p.replace(/\/+$/, "")}/`)).sort((a, b) => b[0].length - a[0].length)[0];
  if (project?.[1].trim()) parts.push(`Project instructions for ${project[0]}:\n${project[1].trim()}`);
  return parts.length ? parts.join("\n\n") : undefined;
}

/** Order agents for failover: your order first (skipping unknown ids), then anything else available. */
export function failoverCandidates(order: string[], available: string[], exclude: string): string[] {
  const known = order.filter(id => available.includes(id) && id !== exclude);
  return [...known, ...available.filter(id => !known.includes(id) && id !== exclude)];
}

/** The first rule whose keywords appear in the prompt (comma-separated, case-insensitive, whole words). */
export function matchRoute(rules: GatewaySettingsValue["router"], ask: string) {
  const text = ask.toLowerCase();
  return rules.find((r) => r.match.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean)
    .some((k) => new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(text)));
}
