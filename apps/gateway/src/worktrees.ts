/**
 * Worktree-per-run: every code task gets its own git worktree and branch, so many agents can
 * work on one repo at once without touching each other's files — or the person's checkout.
 *
 * Worktrees live under ~/.shuacrew/worktrees/<repo>/<run>, outside the repo, so an agent's
 * workspace is never nested inside the project it is changing. Each checkpoint is a commit on the
 * run's branch: time travel and rollback are `git` operations, not a second copy of the files.
 */
import { execFile } from "node:child_process";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await run("git", args, { cwd, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  return stdout.trim();
}

export interface Worktree {
  path: string;
  branch: string;
  base: string;
}

export class Worktrees {
  constructor(private root = path.join(process.env.SHUACREW_HOME ?? path.join(os.homedir(), ".shuacrew"), "worktrees")) {}

  /** A new branch for the run, from the repo's current branch — or from `from` (a fork's checkpoint). */
  async create(repo: string, runId: string, from?: string): Promise<Worktree> {
    const top = await git(repo, "rev-parse", "--show-toplevel");
    const base = await git(top, "rev-parse", "--abbrev-ref", "HEAD");
    const branch = `shua/${runId}`;
    const where = path.join(this.root, path.basename(top), runId);
    mkdirSync(path.dirname(where), { recursive: true });
    await git(top, "worktree", "add", "-b", branch, where, from ?? (base === "HEAD" ? "HEAD" : base));
    return { path: where, branch, base };
  }

  /**
   * Push the run's branch and open a pull request on GitHub. Never force-pushes; needs an `origin`
   * remote and the GitHub CLI signed in. Returns the PR's URL (an existing one if already open).
   */
  async openPullRequest(worktree: string, branch: string, base: string, title: string, body: string): Promise<string> {
    const origin = await git(worktree, "remote", "get-url", "origin").catch(() => "");
    if (!origin) throw new Error("this repo has no `origin` remote to push to");
    await git(worktree, "push", "-u", "origin", `${branch}:${branch}`);
    const gh = (...args: string[]) =>
      new Promise<string>((resolve, reject) =>
        execFile("gh", args, { cwd: worktree, timeout: 60_000 }, (error, stdout, stderr) => (error ? reject(new Error((stderr || error.message).trim())) : resolve(stdout.trim()))),
      );
    const existing = await gh("pr", "view", branch, "--json", "url", "-q", ".url").catch(() => "");
    if (existing) return existing;
    return gh("pr", "create", "--head", branch, "--base", base, "--title", title, "--body", body);
  }

  /** Commit everything the agent changed as one checkpoint. Empty checkpoints still mark the turn. */
  async checkpoint(worktree: string, message: string): Promise<string> {
    await git(worktree, "add", "-A");
    await git(worktree, "-c", "user.name=ShuaCrew", "-c", "user.email=shuacrew@localhost", "commit", "--allow-empty", "-q", "-m", message);
    return git(worktree, "rev-parse", "HEAD");
  }

  /** Put the worktree's files back as they were at a checkpoint. The history keeps both. */
  async rollback(worktree: string, commit: string): Promise<void> {
    await git(worktree, "checkout", commit, "--", ".");
    await git(worktree, "clean", "-fd");
  }

  async diff(worktree: string, base: string): Promise<string> {
    await git(worktree, "add", "-A");
    return git(worktree, "diff", "--cached", "--merge-base", base, "--stat", "--patch");
  }

  async files(worktree: string, base: string): Promise<Array<{ path: string; change: string }>> {
    await git(worktree, "add", "-A");
    // Everything the run changed since its branch left the base, committed or not.
    const out = await git(worktree, "diff", "--cached", "--merge-base", base, "--name-status");
    return out
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [status, ...rest] = line.split("\t");
        return { path: rest.join("\t"), change: status === "A" ? "added" : status === "D" ? "deleted" : "modified" };
      });
  }

  async show(worktree: string, ref: string, file: string): Promise<string> {
    try {
      return await git(worktree, "show", `${ref}:${file}`);
    } catch {
      return "";
    }
  }

  async remove(repo: string, worktree: string, branch?: string): Promise<void> {
    await git(repo, "worktree", "remove", "--force", worktree).catch(() => undefined);
    if (branch) await git(repo, "branch", "-D", branch).catch(() => undefined);
  }

  /**
   * Land a run's branch on its base: rebase onto the latest base, run the checks, fast-forward.
   * The merge queue calls this one run at a time.
   */
  async land(repo: string, tree: Worktree, check?: string): Promise<{ ok: true; commit: string } | { ok: false; reason: string }> {
    const top = await git(repo, "rev-parse", "--show-toplevel");
    try {
      await git(tree.path, "add", "-A");
      await git(tree.path, "-c", "user.name=ShuaCrew", "-c", "user.email=shuacrew@localhost", "commit", "-q", "--allow-empty", "-m", "final changes");
      await git(tree.path, "rebase", tree.base);
    } catch (error) {
      await git(tree.path, "rebase", "--abort").catch(() => undefined);
      return { ok: false, reason: `rebase onto ${tree.base} failed: ${(error as Error).message.split("\n")[0]}` };
    }
    if (check) {
      try {
        await run("/bin/sh", ["-c", check], { cwd: tree.path, maxBuffer: 64 * 1024 * 1024 });
      } catch (error) {
        return { ok: false, reason: `checks failed after rebase: ${check}` };
      }
    }
    const current = await git(top, "rev-parse", "--abbrev-ref", "HEAD");
    if (current !== tree.base) return { ok: false, reason: `${top} is on ${current}, not ${tree.base} — land it by hand` };
    try {
      await git(top, "merge", "--ff-only", tree.branch);
    } catch (error) {
      return { ok: false, reason: `could not fast-forward ${tree.base}: ${(error as Error).message.split("\n")[0]}` };
    }
    return { ok: true, commit: await git(top, "rev-parse", "HEAD") };
  }
}
