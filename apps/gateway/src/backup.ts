/**
 * Nightly, encrypted backups of everything ShuaCrew knows: a consistent snapshot of the event log,
 * the Library, skills, published sites and your keys — tarred, then AES-256 encrypted with a
 * passphrase made once and kept in your macOS Keychain. They land in iCloud Drive when you have
 * it (so they leave this disk), keeping the latest 14.
 *
 * Restore:  security find-generic-password -s ShuaCrew-backup -w \
 *             | openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass stdin -in <file> | tar xz -C <folder>
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { Cron } from "croner";
import type { EventStore } from "./store.js";

const KEEP = 14;
const SERVICE = "ShuaCrew-backup";
/** What's worth keeping; models and uploads are large and can be fetched or re-attached. */
const INCLUDE = ["library", "plugin", "sites", "venture-keys.json", "mcp-auth.json", "secrets.json"];

export function defaultDestination(home = os.homedir()): string {
  const icloud = path.join(home, "Library", "Mobile Documents", "com~apple~CloudDocs");
  return existsSync(icloud) ? path.join(icloud, "ShuaCrew Backups") : path.join(home, "ShuaCrew Backups");
}

const opensslBin = () => ["/opt/homebrew/bin/openssl", "/usr/local/bin/openssl", "/usr/bin/openssl"].find((p) => existsSync(p)) ?? "openssl";

function run(file: string, args: string[], options: { env?: NodeJS.ProcessEnv; input?: string } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, { env: { ...process.env, ...options.env }, maxBuffer: 16 * 1024 * 1024, timeout: 30 * 60_000 }, (error, stdout, stderr) =>
      error ? reject(new Error(`${path.basename(file)}: ${(stderr || error.message).toString().trim().split("\n").pop()}`)) : resolve(stdout.toString()),
    );
    if (options.input !== undefined) child.stdin?.end(options.input);
  });
}

/** The backup passphrase: made once, kept in the login Keychain. */
export async function keychainKey(): Promise<string> {
  try {
    return (await run("/usr/bin/security", ["find-generic-password", "-s", SERVICE, "-a", "backup", "-w"])).trim();
  } catch {
    const key = randomBytes(32).toString("base64url");
    await run("/usr/bin/security", ["add-generic-password", "-s", SERVICE, "-a", "backup", "-l", "ShuaCrew backup passphrase", "-w", key, "-U"]);
    return key;
  }
}

export class Backups {
  private cron?: Cron;

  constructor(
    private store: EventStore,
    private home: string,
    readonly destination = defaultDestination(),
    private key: () => Promise<string> = keychainKey,
  ) {}

  /** Make one now. Returns the file. */
  async run(now = new Date()): Promise<{ file: string; bytes: number }> {
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    const work = path.join(os.tmpdir(), `shuacrew-backup-${stamp}-${randomBytes(3).toString("hex")}`);
    mkdirSync(work, { recursive: true, mode: 0o700 });
    mkdirSync(this.destination, { recursive: true });
    const file = path.join(this.destination, `shuacrew-${stamp}.tar.gz.enc`);
    try {
      this.store.snapshot(path.join(work, "shuacrew.db"));
      const parts = INCLUDE.filter((p) => existsSync(path.join(this.home, p)));
      const tar = path.join(work, "backup.tar.gz");
      await run("/usr/bin/tar", ["-czf", tar, "-C", work, "shuacrew.db", "-C", this.home, ...parts]);
      await run(opensslBin(), ["enc", "-aes-256-cbc", "-pbkdf2", "-iter", "200000", "-salt", "-pass", "env:SHUACREW_BACKUP_KEY", "-in", tar, "-out", file], { env: { SHUACREW_BACKUP_KEY: await this.key() } });
      const bytes = statSync(file).size;
      this.store.append("backup.made", { file, bytes });
      this.prune();
      return { file, bytes };
    } catch (error) {
      this.store.append("backup.made", { file, bytes: 0, error: (error as Error).message.slice(0, 300) });
      rmSync(file, { force: true });
      throw error;
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }

  list(): Array<{ file: string; bytes: number; at: number }> {
    if (!existsSync(this.destination)) return [];
    return readdirSync(this.destination)
      .filter((f) => /^shuacrew-.*\.tar\.gz\.enc$/.test(f))
      .map((f) => {
        const file = path.join(this.destination, f);
        const st = statSync(file);
        return { file, bytes: st.size, at: st.mtimeMs };
      })
      .sort((a, b) => b.at - a.at);
  }

  private prune() {
    for (const old of this.list().slice(KEEP)) rmSync(old.file, { force: true });
  }

  /** Nightly at 2:30. */
  schedule() {
    this.cron = new Cron("30 2 * * *", () => void this.run().catch(() => undefined));
  }

  stop() {
    this.cron?.stop();
  }
}
