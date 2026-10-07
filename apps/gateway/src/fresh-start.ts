import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AnyEvent } from "@shuacrew/core";
import { EventStore } from "./store.js";
import { transcriptsOf } from "./forget.js";

/**
 * Start fresh: erase what you made, keep how you set things up. It runs as the gateway starts (nothing has the database
 * open), when Settings → Start fresh left a marker and restarted it. Nothing is destroyed on the way: the old database
 * (a consistent copy) and every content file and folder move into backups/fresh-start-<time>/, with a README on how to
 * put them back. The new log holds only your setup, re-recorded; a new content epoch makes every window drop what it
 * holds and clear its stored content.
 */

/** Your setup, re-recorded into the fresh log: crew, skills, integrations, schedules, webhooks, heartbeats, config, provider limits. */
export const SETUP_KINDS: ReadonlySet<string> = new Set([
  "crew.member.set", "crew.member.removed", "skill.proposed", "skill.decided", "mcp.set", "mcp.removed", "mcp.spark",
  "schedule.set", "schedule.removed", "webhook.set", "webhook.removed", "heartbeat.set", "heartbeat.removed",
  "config.changed", "playbook.removed", "runtime.limited", "runtime.restored",
]);
/** What you made, in ~/.shuacrew: moved into the backup. (Settings, Shua's look, accounts, keys, pairing, models and backups stay.) */
export const CONTENT_ENTRIES = [
  "learning.json", "library", "uploads", "worktrees", "workspace", "shell", "live", "teaching", "sites", "spoken-summaries",
  "screen-memory.jsonl", "shua-actions.jsonl", "shua-voice.jsonl", "personal-setup.json", "spark-selftest.log", "spark-selftest.log.mark", "voice-compare.jsonl",
] as const;
const MARKER = "fresh-start.json";

export const requestFreshStart = (home: string) => writeFileSync(path.join(home, MARKER), JSON.stringify({ at: Date.now() }), { mode: 0o600 });
export const freshStartPending = (home: string) => existsSync(path.join(home, MARKER));

export interface FreshStart { backup: string; kept: number; erased: number; moved: string[]; transcripts: number }

export function performFreshStart(home: string, deps: { codexHome?: string; claudeDirs?: string[]; git?: (args: string[]) => string } = {}): FreshStart {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = path.join(home, "backups", `fresh-start-${stamp}`);
  mkdirSync(backup, { recursive: true, mode: 0o700 });
  const db = path.join(home, "shuacrew.db");
  const setup: AnyEvent[] = [], sessions: Array<{ runtime: string; id: string }> = [], worktrees: string[] = [];
  let all = 0;
  if (existsSync(db)) {
    const old = new EventStore(db);
    for (const e of old.read(0)) {
      all++;
      if (SETUP_KINDS.has(e.kind)) setup.push(e);
      const b = e.body as Record<string, unknown>;
      if (e.kind === "run.session" && typeof b.id === "string") sessions.push({ runtime: String(b.runtime), id: b.id });
      if (e.kind === "run.worktree" && typeof b.path === "string") worktrees.push(b.path);
    }
    old.snapshot(path.join(backup, "shuacrew.db")); // a consistent copy, whatever the WAL holds
    old.close();
  }
  // The fresh log: only your setup, in its original order (new timestamps and hashes, same meaning).
  const next = path.join(home, `shuacrew.fresh-${stamp}.db`);
  const fresh = new EventStore(next);
  for (const e of setup) fresh.append(e.kind, e.body, { run: e.run, session: e.session });
  fresh.close();
  for (const f of ["shuacrew.db", "shuacrew.db-wal", "shuacrew.db-shm"]) { const p = path.join(home, f); if (existsSync(p)) renameSync(p, path.join(backup, `original-${f}`)); }
  renameSync(next, db);
  for (const f of ["-wal", "-shm"]) { const p = `${next}${f}`; if (existsSync(p)) renameSync(p, `${db}${f}`); }
  // The repos whose session worktrees move away get their worktree list pruned (the code stays on the shua/ branches).
  const git = deps.git ?? ((args: string[]) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  const repos = new Set<string>();
  for (const w of worktrees) { try { if (existsSync(w)) repos.add(path.dirname(path.resolve(w, git(["-C", w, "rev-parse", "--git-common-dir"]).trim()))); } catch { /* not a worktree any more */ } }
  const moved: string[] = [];
  for (const name of CONTENT_ENTRIES) {
    const p = path.join(home, name);
    if (!existsSync(p)) continue;
    renameSync(p, path.join(backup, name)); moved.push(name);
  }
  // The gateway's own log is open for writing by launchd: keep a copy, then empty it in place.
  const log = path.join(home, "gateway.log");
  if (existsSync(log)) { copyFileSync(log, path.join(backup, "gateway.log")); truncateSync(log, 0); moved.push("gateway.log"); }
  for (const repo of repos) { try { git(["-C", repo, "worktree", "prune"]); } catch { /* ok */ } }
  // The agents' own transcripts of those sessions (exact ids only) go into the backup too.
  let transcripts = 0;
  const tdir = path.join(backup, "transcripts");
  for (const f of sessions.flatMap((s) => transcriptsOf(s, home, deps))) {
    try { mkdirSync(tdir, { recursive: true, mode: 0o700 }); renameSync(f, path.join(tdir, `${transcripts}-${path.basename(f)}`)); transcripts++; } catch { /* already gone */ }
  }
  writeFileSync(path.join(home, "content-epoch.json"), JSON.stringify({ epoch: `fresh-${stamp}` }), { mode: 0o600 });
  writeFileSync(path.join(backup, "README.txt"), [
    `ShuaCrew fresh start, ${new Date().toString()}.`,
    `Kept ${setup.length} setup events of ${all}; everything else is here, untouched.`,
    "To undo: quit ShuaCrew, stop the gateway (pnpm service uninstall, or just quit it), then move shuacrew.db and the folders/files",
    "below back into ~/.shuacrew (replacing the fresh ones), and start it again. Agent transcripts are in transcripts/.",
    "", `Moved: ${moved.join(", ") || "nothing"}`,
  ].join("\n"), { mode: 0o600 });
  rmSync(path.join(home, MARKER), { force: true });
  return { backup, kept: setup.length, erased: all - setup.length, moved, transcripts };
}
