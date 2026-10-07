import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, realpathSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AnyEvent } from "@shuacrew/core";
import type { Learning } from "./learning.js";
import type { EventStore } from "./store.js";

/**
 * Deleting a session means gone everywhere: its events (re-linked out of the log, one contentless run.deleted left),
 * what was made from it (flashcards, roadmap, study plan, fit check, library artifacts), the files it brought or made
 * (uploads, its git worktree and shua/ branch), the agent's own transcript (Claude Code / Codex, matched by exact id)
 * and its action receipts. Files are only ever removed inside ShuaCrew's own folders, or by exact transcript id.
 */

/** Events that mention a session and exist only because of it — purged with it. (Ventures, sites, schedules that merely
 *  refer to a session are kept: they're yours.) */
export const ABOUT_A_SESSION: ReadonlySet<string> = new Set([
  "lesson.learned", "lesson.applied", "lesson.retired", "briefing.created", "schedule.fired", "trigger.received",
  "approval.requested", "approval.decided", "policy.decided", "review.comment", "review.decided",
  "merge.queued", "merge.landed", "merge.failed", "pr.opened", "error.raised", "task.planned", "task.step", "heartbeat.checked",
]);

export interface ForgetDeps {
  store: EventStore; home: string; learning?: Learning;
  library?: { forgetArtifacts(ids: string[]): void };
  /** Where agent transcripts live (defaults: ~/.codex, ~/.claude plus ShuaCrew's extra Claude accounts). */
  codexHome?: string; claudeDirs?: string[];
  git?: (args: string[]) => string;
}
export interface Forgotten { events: number; files: string[]; learning: number; artifacts: number; receipts: number }

/** What a session left behind, read from its events (before they're purged). Pure: tested. */
export function leftovers(events: AnyEvent[], home: string) {
  const uploads = new Set<string>(), artifacts = new Set<string>(), sessions: Array<{ runtime: string; id: string }> = [], worktrees: Array<{ path: string; branch: string }> = [];
  const uploadsDir = path.join(home, "uploads") + path.sep;
  for (const e of events) {
    const b = e.body as Record<string, unknown>;
    const text = e.kind === "run.created" ? String(b.ask ?? "") : e.kind === "run.followup" || e.kind === "run.followup.edited" ? String(b.text ?? "") : "";
    for (const m of text.matchAll(/(\/[^\s()'"`]+)/g)) if (m[1]!.startsWith(uploadsDir)) uploads.add(m[1]!);
    if (e.kind === "artifact.saved" && typeof b.id === "string") artifacts.add(b.id);
    if (e.kind === "run.session" && typeof b.id === "string") sessions.push({ runtime: String(b.runtime), id: b.id });
    if (e.kind === "run.worktree" && typeof b.path === "string") worktrees.push({ path: b.path, branch: String(b.branch ?? "") });
  }
  return { uploads: [...uploads], artifacts: [...artifacts], sessions, worktrees };
}

/** Learn's records made from the session: removed if they came from it, unlinked if they only pointed at it. */
export function forgetInLearning(learning: Learning, run: string): number {
  const before = JSON.stringify(learning.get());
  learning.edit((s) => ({
    ...s,
    cards: s.cards.filter((c) => c.source.run !== run),
    docs: s.docs.filter((d) => d.run !== run),
    roadmaps: s.roadmaps.filter((r) => r.run !== run),
    courses: s.courses.filter((c) => c.plan !== run).map((c) => ({ ...c, lessons: c.lessons.map((l) => (l.run === run ? { ...l, run: undefined } : l)) })),
    certs: s.certs.map((c) => (c.plan === run ? { ...c, plan: undefined, steps: [] } : c)),
    jobs: s.jobs.map((j) => (j.fit?.run === run ? { ...j, fit: undefined } : j)),
    coach: Object.fromEntries(Object.entries(s.coach).filter(([, v]) => v.run !== run)),
    studied: s.studied.filter((x) => x.run !== run),
    drills: s.drills.filter((d) => d.run !== run),
  }));
  return before === JSON.stringify(learning.get()) ? 0 : 1;
}

/** Inside `root` for real (symlinks resolved), so nothing outside ShuaCrew's folders is ever removed. */
function inside(file: string, root: string) {
  try { const real = realpathSync(file), base = realpathSync(root); return real === base ? false : real.startsWith(base + path.sep); } catch { return false; }
}
/** Transcript files named after an exact session id, a few folders deep (Codex: sessions/YYYY/MM/DD). */
export function transcripts(dir: string, id: string, depth: number, out: string[] = []): string[] {
  if (depth < 0 || !existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    let isDir = false; try { isDir = statSync(full).isDirectory(); } catch { continue; }
    if (name === id || name === `${id}.jsonl` || (name.endsWith(".jsonl") && name.includes(id))) out.push(full);
    else if (isDir) transcripts(full, id, depth - 1, out);
  }
  return out;
}

/** An agent session's own transcript files (Claude Code or Codex), by its exact id — never a pattern. */
export function transcriptsOf(s: { runtime: string; id: string }, home: string, deps: { codexHome?: string; claudeDirs?: string[] } = {}): string[] {
  if (!/^[\w-]{8,80}$/.test(s.id)) return [];
  const codex = deps.codexHome ?? process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex");
  const claude = deps.claudeDirs ?? [path.join(os.homedir(), ".claude"), ...(() => { try { return readdirSync(path.join(home, "claude-accounts")).map((n) => path.join(home, "claude-accounts", n)); } catch { return []; } })()];
  return s.runtime === "codex" ? transcripts(path.join(codex, "sessions"), s.id, 4) : [...new Set(claude.flatMap((d) => transcripts(path.join(d, "projects"), s.id, 1)))];
}

export function forgetRun(run: string, deps: ForgetDeps): Forgotten {
  const { store, home } = deps;
  const left = leftovers(store.forRun(run), home);
  const files: string[] = [];
  const remove = (p: string) => { try { rmSync(p, { recursive: true, force: true }); files.push(p); } catch { /* already gone */ } };
  for (const f of left.uploads) if (inside(f, path.join(home, "uploads"))) remove(f);
  const git = deps.git ?? ((args: string[]) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  for (const w of left.worktrees) {
    if (!existsSync(w.path) || !inside(w.path, path.join(home, "worktrees"))) continue;
    let repo = "";
    try { repo = path.dirname(path.resolve(w.path, git(["-C", w.path, "rev-parse", "--git-common-dir"]).trim())); } catch { /* not a worktree any more */ }
    try { if (repo) git(["-C", repo, "worktree", "remove", "--force", w.path]); } catch { /* fall through to removing the folder */ }
    if (existsSync(w.path)) remove(w.path); else files.push(w.path);
    if (repo) { try { git(["-C", repo, "worktree", "prune"]); } catch { /* ok */ } }
    if (repo && w.branch.startsWith("shua/")) { try { git(["-C", repo, "branch", "-D", w.branch]); } catch { /* merged or gone */ } }
  }
  for (const f of left.sessions.flatMap((s) => transcriptsOf(s, home, deps))) remove(f);
  deps.library?.forgetArtifacts(left.artifacts);
  const learning = deps.learning ? forgetInLearning(deps.learning, run) : 0;
  const receipts = store.forgetReceipts(run);
  const events = store.purgeRun(run, ABOUT_A_SESSION);
  store.append("run.deleted", {}, { run });
  return { events, files, learning, artifacts: left.artifacts.length, receipts };
}
