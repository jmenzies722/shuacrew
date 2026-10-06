import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import type { FastifyInstance } from "fastify";
import { defaultRules, type AnyEvent } from "@shuacrew/core";

const run = promisify(execFile);

/** Every rule the policy enforces, in words: what it matches, whether it blocks, asks or allows, and how risky it is. */
export interface PolicyRuleInfo { id: string; description: string; verdict: "allow" | "ask" | "deny"; risk: string }
export function policyRules(): PolicyRuleInfo[] {
  return defaultRules().map(({ id, description, verdict, risk }) => ({ id, description, verdict, risk: String(risk) }));
}

export interface PolicyStats {
  days: number;
  verdicts: { allow: number; ask: number; deny: number };
  /** What you did when asked: allowed, denied, timed out, and how many you made "always". */
  answers: { allowed: number; denied: number; timedOut: number; always: number };
  rules: Array<{ rule: string; verdict: string; hits: number }>;
  tools: Array<{ tool: string; asked: number; blocked: number }>;
  daily: Array<{ day: string; allow: number; ask: number; deny: number }>;
}
/** Every decision in the window, counted: by verdict, by rule, by tool, by day (UTC). Synthetic demo runs are left out. */
export function policyStats(events: Iterable<AnyEvent>, now: number, days = 7): PolicyStats {
  const from = now - days * 86_400_000, demo = new Set<string>();
  const verdicts = { allow: 0, ask: 0, deny: 0 }, answers = { allowed: 0, denied: 0, timedOut: 0, always: 0 };
  const rules = new Map<string, { rule: string; verdict: string; hits: number }>(), tools = new Map<string, { tool: string; asked: number; blocked: number }>();
  const daily = new Map<string, { day: string; allow: number; ask: number; deny: number }>();
  for (let t = from; t <= now; t += 86_400_000) { const d = new Date(t).toISOString().slice(0, 10); daily.set(d, { day: d, allow: 0, ask: 0, deny: 0 }); }
  for (const e of events) {
    if (e.kind === "run.created" && e.run && e.body.runtime === "mock") demo.add(e.run);
    if (e.at < from || (e.run && demo.has(e.run))) continue;
    if (e.kind === "policy.decided") {
      const v = e.body.verdict as "allow" | "ask" | "deny";
      verdicts[v]++;
      const r = rules.get(e.body.rule) ?? { rule: e.body.rule, verdict: v, hits: 0 }; r.hits++; rules.set(e.body.rule, r);
      if (v !== "allow") { const t = tools.get(e.body.tool) ?? { tool: e.body.tool, asked: 0, blocked: 0 }; if (v === "ask") t.asked++; else t.blocked++; tools.set(e.body.tool, t); }
      const d = daily.get(new Date(e.at).toISOString().slice(0, 10)); if (d) d[v]++;
    }
    if (e.kind === "approval.decided") {
      if (e.body.by === "timeout") answers.timedOut++; else if (e.body.allow) answers.allowed++; else answers.denied++;
      if (e.body.always && e.body.allow) answers.always++;
    }
  }
  return { days, verdicts, answers, rules: [...rules.values()].sort((a, b) => b.hits - a.hits).slice(0, 12), tools: [...tools.values()].sort((a, b) => b.asked + b.blocked - a.asked - a.blocked).slice(0, 8), daily: [...daily.values()] };
}

export interface Change { hash: string; subject: string; at: number }
/** `git log --format=%h%x1f%s%x1f%ct` → changes, newest first; anything malformed is skipped, never guessed. */
export function parseGitLog(stdout: string): Change[] {
  return stdout.split("\n").map((line) => line.split("\x1f")).filter((p) => p.length === 3 && /^[0-9a-f]{6,}$/.test(p[0]!) && /^\d+$/.test(p[2]!))
    .map(([hash, subject, at]) => ({ hash: hash!, subject: subject!.trim(), at: Number(at) * 1000 }));
}

/**
 * /api/policy/rules and /api/updates. Updates reads this install's own repo (read-only git commands with a short
 * timeout): the version, the branch and commit it runs, and the latest changes. It never fetches, pulls or writes.
 */
export function registerPolicyAndUpdates(app: FastifyInstance, options: { repoRoot: string; version: string; build: () => string; store?: { read: (from: number) => Iterable<AnyEvent> }; guardrails?: () => unknown }) {
  app.get("/api/policy/rules", async () => policyRules());
  app.get<{ Querystring: { days?: string } }>("/api/policy/stats", async (request) => {
    const days = [1, 7, 30].includes(Number(request.query.days)) ? Number(request.query.days) : 7;
    return options.store ? policyStats(options.store.read(0), Date.now(), days) : null;
  });
  app.get("/api/policy/guardrails", async () => options.guardrails?.() ?? null);
  app.get("/api/updates", async () => {
    const git = (args: string[]) => run("git", ["-C", options.repoRoot, ...args], { timeout: 3000, maxBuffer: 256 * 1024 }).then((r) => r.stdout.trim()).catch(() => "");
    const [branch, commit, log] = await Promise.all([git(["rev-parse", "--abbrev-ref", "HEAD"]), git(["rev-parse", "--short", "HEAD"]), git(["log", "-15", "--no-merges", "--format=%h%x1f%s%x1f%ct"])]);
    return { version: options.version, build: options.build(), branch: branch || null, commit: commit || null, changes: parseGitLog(log) };
  });
}

/** The repo this gateway was installed from: two levels above the web build it serves, or where it was started. */
export const repoRootFrom = (webRoot?: string) => (webRoot ? path.resolve(webRoot, "..", "..", "..") : process.cwd());
