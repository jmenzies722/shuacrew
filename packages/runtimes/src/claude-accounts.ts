/**
 * Several Claude subscriptions, used as one: each account is a Claude Code config directory with its own
 * login (`~/.claude`, plus one per extra account under ~/.shuacrew/claude-accounts). Claude Code keys its
 * keychain login by that directory, so every account stays signed in at once; ShuaCrew never reads a token,
 * it only asks `claude auth status` who each directory is. A run picks a free account; when one hits its
 * usage limit the next takes over, and only when every account is out does the run pause.
 *
 * Extra accounts share the default account's `projects` folder (a symlink), so a conversation started on
 * one account resumes on another.
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

export interface ClaudeAccount {
  /** The CLAUDE_CONFIG_DIR, or "" for Claude Code's default (~/.claude), which must run WITHOUT the variable. */
  dir: string;
  email?: string;
  /** "pro", "max", "team"… as Claude Code reports it. */
  plan?: string;
  signedIn: boolean;
  /** Per model ("*" = every model): when its usage window lifts, ms since epoch. */
  limits: Record<string, number>;
  /** Last run started on it, for spreading work. */
  lastUsed: number;
}

export type ReadStatus = (dir: string) => Promise<{ loggedIn?: boolean; email?: string; subscriptionType?: string }>;

export interface AccountsOptions {
  executable?: string;
  home?: string;
  /** Where extra accounts live; each subfolder is one account. */
  root?: string;
  /** How long a status check is trusted; logins switched with /login are noticed after this. */
  ttlMs?: number;
  readStatus?: ReadStatus;
  now?: () => number;
}

export class ClaudeAccounts {
  private list: ClaudeAccount[] = [];
  private checkedAt = 0;
  private checking?: Promise<ClaudeAccount[]>;
  private readonly home: string;
  readonly root: string;
  private readonly ttl: number;
  private readonly readStatus: ReadStatus;
  private readonly now: () => number;

  constructor(options: AccountsOptions = {}) {
    this.home = options.home ?? os.homedir();
    this.root = options.root ?? path.join(this.home, ".shuacrew", "claude-accounts");
    this.ttl = options.ttlMs ?? 60_000;
    this.now = options.now ?? Date.now;
    this.readStatus = options.readStatus ?? (async (dir) => {
      if (!options.executable) return {};
      const env = { ...process.env };
      if (dir) env.CLAUDE_CONFIG_DIR = dir; else delete env.CLAUDE_CONFIG_DIR;
      const { stdout } = await exec(options.executable, ["auth", "status"], { timeout: 10_000, env });
      return JSON.parse(stdout);
    });
  }

  /** Every account directory: the default first, then extras in name order. */
  dirs(): string[] {
    const extras = existsSync(this.root)
      ? readdirSync(this.root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => path.join(this.root, d.name)).sort()
      : [];
    return ["", ...extras];
  }

  /** Who each directory is signed in as, re-checked once the last check is older than the TTL. */
  async refresh(force = false): Promise<ClaudeAccount[]> {
    if (!force && this.now() - this.checkedAt < this.ttl) return this.list;
    this.checking ??= (async () => {
      const found = await Promise.all(this.dirs().map(async (dir) => {
        const info = await this.readStatus(dir).catch(() => ({} as Awaited<ReturnType<ReadStatus>>));
        const known = this.list.find((a) => a.dir === dir);
        // A different login in the same folder (you ran /login as someone else) starts with a clean slate.
        const same = known && known.email === info.email;
        return { dir, email: info.email, plan: info.subscriptionType, signedIn: Boolean(info.loggedIn),
          limits: same ? known.limits : {}, lastUsed: same ? known.lastUsed : 0 } satisfies ClaudeAccount;
      }));
      // The same person signed in twice is one subscription, one usage window: keep the first.
      this.list = found.filter((a, i) => !a.email || found.findIndex((b) => b.email === a.email) === i);
      this.checkedAt = this.now();
      return this.list;
    })().finally(() => { this.checking = undefined; });
    return this.checking;
  }

  get accounts(): readonly ClaudeAccount[] { return this.list; }

  /** When this account can run `model` again (0 = now). */
  limitedUntil(account: ClaudeAccount, model?: string): number {
    const until = Math.max(account.limits["*"] ?? 0, model ? account.limits[model] ?? 0 : 0);
    return until > this.now() ? until : 0;
  }

  /** The earliest moment any signed-in account can run `model` again. */
  nextFree(model?: string): number {
    const times = this.list.filter((a) => a.signedIn).map((a) => this.limitedUntil(a, model) || this.now());
    return times.length ? Math.min(...times) : 0;
  }

  /**
   * Which account runs the next turn of `model`, or undefined when none can. `avoid` holds accounts this
   * run already exhausted.
   */
  pick(model?: string, avoid: string[] = []): ClaudeAccount | undefined {
    const ready = this.list.filter((a) => a.signedIn && !avoid.includes(a.dir) && this.limitedUntil(a, model) === 0);
    // Sticky: stay on the account that ran last until it runs out. Warm Spark sessions and the prompt cache live
    // on one account, so hopping every turn would cost a cold start each time; a limit hands off on its own.
    return ready.reduce<ClaudeAccount | undefined>((best, a) => (!best || a.lastUsed > best.lastUsed ? a : best), undefined);
  }

  use(account: ClaudeAccount): void { account.lastUsed = this.now(); }

  markLimited(dir: string, until: number, model?: string): void {
    const account = this.list.find((a) => a.dir === dir);
    if (account) account.limits[model ?? "*"] = Math.max(account.limits[model ?? "*"] ?? 0, until);
  }

  /** Lift every limit early (the "Try now" chip): the next run finds out for real. */
  clearLimits(model?: string): void {
    for (const a of this.list) { if (model) delete a.limits[model]; else a.limits = {}; }
  }

  /** The environment a run on `account` gets: the default account must not carry CLAUDE_CONFIG_DIR at all. */
  static env(account: ClaudeAccount | undefined, base: Record<string, string | undefined>): Record<string, string | undefined> {
    const env = { ...base };
    if (account?.dir) env.CLAUDE_CONFIG_DIR = account.dir; else delete env.CLAUDE_CONFIG_DIR;
    return env;
  }

  /**
   * A folder for one more account, sharing the default account's conversations so resume works across
   * accounts. Returns the folder; the person signs in once with `CLAUDE_CONFIG_DIR=<dir> claude auth login`.
   */
  create(): string {
    mkdirSync(this.root, { recursive: true });
    const taken = new Set(existsSync(this.root) ? readdirSync(this.root) : []);
    let n = 2;
    while (taken.has(String(n))) n++;
    const dir = path.join(this.root, String(n));
    mkdirSync(dir, { recursive: true });
    const shared = path.join(this.home, ".claude", "projects");
    mkdirSync(shared, { recursive: true });
    symlinkSync(shared, path.join(dir, "projects"));
    this.checkedAt = 0; // the next refresh sees it
    return dir;
  }
}
