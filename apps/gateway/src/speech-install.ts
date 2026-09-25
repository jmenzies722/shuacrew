import { spawn } from "node:child_process";
import { existsSync, mkdirSync, renameSync, statfsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../speech");
type Runner = (file: string, args: string[], signal: AbortSignal) => Promise<void>;
const execute: Runner = (file, args, signal) => new Promise((resolve, reject) => {
  const child = spawn(file, args, { signal, stdio: "ignore", timeout: 20 * 60_000 });
  child.on("error", reject);
  child.on("exit", code => code === 0 ? resolve() : reject(new Error("Speech setup failed. Check network access and available disk space, then retry.")));
});

/** Installs only pinned first-party manifest assets into an isolated, recoverable tree. */
export class SpeechInstaller {
  private abort?: AbortController;
  private state: "missing" | "installing" | "ready" | "failed" = "missing";
  private step = "";
  private error?: string;
  constructor(private home: string, private runner: Runner = execute) {}
  status() { return { state: this.state, step: this.step, error: this.error }; }
  cancel() { this.abort?.abort(); }
  async install() {
    if (this.abort) throw new Error("Speech setup is already running.");
    this.abort = new AbortController(); const signal = this.abort.signal;
    this.state = "installing"; this.error = undefined;
    try {
      mkdirSync(this.home, { recursive: true, mode: 0o700 });
      const disk = statfsSync(this.home);
      if (disk.bavail * disk.bsize < 8 * 1024 ** 3) throw new Error("Speech setup needs at least 8 GiB of free disk space.");
      const stage = path.join(this.home, "setup-partial");
      mkdirSync(stage, { recursive: true, mode: 0o700 });
      const uv = ["/opt/homebrew/bin/uv", "/usr/local/bin/uv"].find(existsSync) ?? "uv";
      const python = path.join(stage, "venv/bin/python");
      this.step = "Creating an isolated Python environment";
      if (!existsSync(python)) await this.runner(uv, ["venv", "--relocatable", "--python", "3.12", path.join(stage, "venv")], signal);
      this.step = "Installing pinned speech dependencies";
      await this.runner(uv, ["pip", "install", "--python", python, "-r", path.join(source, "requirements.lock"), "-r", path.join(source, "pocket-requirements.lock")], signal);
      this.step = "Downloading pinned US and UK models (approximately 3–4 GB)";
      await this.runner(python, [path.join(source, "download.py"), stage], signal);
      signal.throwIfAborted();
      this.step = "Activating the local speech environment";
      writeFileSync(path.join(stage, ".ready"), "1\n", { mode: 0o600 });
      const installed = path.join(this.home, "installed");
      if (existsSync(installed)) renameSync(installed, path.join(this.home, `previous-${randomUUID()}`));
      renameSync(stage, installed);
      this.state = "ready"; this.step = "Ready";
    } catch (error) {
      this.state = "failed";
      this.error = signal.aborted ? "Setup cancelled. Partial downloads are retained for retry." : error instanceof Error ? error.message : "Speech setup failed.";
      throw new Error(this.error);
    } finally { this.abort = undefined; }
  }
}
