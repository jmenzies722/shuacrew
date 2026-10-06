import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import type { FastifyInstance } from "fastify";
import { defaultRules } from "@shuacrew/core";

const run = promisify(execFile);

/** Every rule the policy enforces, in words: what it matches, whether it blocks, asks or allows, and how risky it is. */
export interface PolicyRuleInfo { id: string; description: string; verdict: "allow" | "ask" | "deny"; risk: string }
export function policyRules(): PolicyRuleInfo[] {
  return defaultRules().map(({ id, description, verdict, risk }) => ({ id, description, verdict, risk: String(risk) }));
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
export function registerPolicyAndUpdates(app: FastifyInstance, options: { repoRoot: string; version: string; build: () => string }) {
  app.get("/api/policy/rules", async () => policyRules());
  app.get("/api/updates", async () => {
    const git = (args: string[]) => run("git", ["-C", options.repoRoot, ...args], { timeout: 3000, maxBuffer: 256 * 1024 }).then((r) => r.stdout.trim()).catch(() => "");
    const [branch, commit, log] = await Promise.all([git(["rev-parse", "--abbrev-ref", "HEAD"]), git(["rev-parse", "--short", "HEAD"]), git(["log", "-15", "--no-merges", "--format=%h%x1f%s%x1f%ct"])]);
    return { version: options.version, build: options.build(), branch: branch || null, commit: commit || null, changes: parseGitLog(log) };
  });
}

/** The repo this gateway was installed from: two levels above the web build it serves, or where it was started. */
export const repoRootFrom = (webRoot?: string) => (webRoot ? path.resolve(webRoot, "..", "..", "..") : process.cwd());
