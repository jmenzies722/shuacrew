/**
 * Real terminals: a login shell in a pseudo-terminal, owned by the gateway so it outlives the page.
 * Reload the window, restart the app — the shell, its scrollback and whatever it's running are
 * still there when the page reattaches. These are the person's own shells: the agent policy doesn't
 * gate them, and what's typed is never written to the event log (it may hold secrets).
 */
import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import type { IPty } from "node-pty";

interface Socket {
  send(data: string): void;
  on(event: "message", listener: (data: unknown) => void): void;
  on(event: "close", listener: () => void): void;
  close(): void;
}

export interface TerminalInfo {
  id: string;
  title: string;
  cwd: string;
  run?: string;
  createdAt: number;
  exited?: number;
}

const SCROLLBACK = 512 * 1024; // what a reattaching page gets replayed

export class Terminals {
  private open = new Map<string, TerminalInfo & { pty: IPty; buffer: string; clients: Set<Socket> }>();
  private spawn?: typeof import("node-pty").spawn;

  /** node-pty's prebuilt helper loses its execute bit through pnpm; put it back once. */
  private load() {
    if (this.spawn) return this.spawn;
    const require = createRequire(import.meta.url);
    const root = path.dirname(require.resolve("node-pty/package.json"));
    for (const helper of [path.join(root, "prebuilds", `${process.platform}-${process.arch}`, "spawn-helper"), path.join(root, "build", "Release", "spawn-helper")]) {
      if (existsSync(helper) && !(statSync(helper).mode & 0o111)) chmodSync(helper, 0o755);
    }
    this.spawn = (require("node-pty") as typeof import("node-pty")).spawn;
    return this.spawn;
  }

  create(options: { cwd?: string; run?: string; cols?: number; rows?: number } = {}): TerminalInfo {
    const cwd = options.cwd && existsSync(options.cwd) ? options.cwd : os.homedir();
    const shell = process.env.SHELL && existsSync(process.env.SHELL) ? process.env.SHELL : "/bin/zsh";
    const env = { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor", TERM_PROGRAM: "ShuaCrew", SHUACREW_TERMINAL: "1" } as Record<string, string>;
    delete env.SHUACREW_TOKEN;
    const pty = this.load()(shell, ["-l"], { name: "xterm-256color", cols: options.cols ?? 100, rows: options.rows ?? 28, cwd, env });
    const id = `t_${randomUUID().slice(0, 8)}`;
    const entry = { id, title: path.basename(cwd) || "~", cwd, run: options.run, createdAt: Date.now(), pty, buffer: "", clients: new Set<Socket>() };
    pty.onData((data) => {
      entry.buffer = (entry.buffer + data).slice(-SCROLLBACK);
      for (const client of entry.clients) client.send(JSON.stringify({ type: "data", data }));
    });
    pty.onExit(({ exitCode }) => {
      (entry as TerminalInfo).exited = exitCode;
      for (const client of entry.clients) client.send(JSON.stringify({ type: "exit", code: exitCode }));
    });
    this.open.set(id, entry);
    return this.info(entry);
  }

  /** All terminals, one session's, or ("home") those opened outside any session. */
  list(run?: string): TerminalInfo[] {
    return [...this.open.values()].filter((t) => run === undefined || (run === "home" ? !t.run : t.run === run)).map((t) => this.info(t));
  }

  /** Replay the scrollback, then stream; the page sends keystrokes and its size. */
  attach(id: string, socket: Socket) {
    const entry = this.open.get(id);
    if (!entry) {
      socket.send(JSON.stringify({ type: "exit", code: -1, reason: "no such terminal" }));
      socket.close();
      return;
    }
    entry.clients.add(socket);
    socket.send(JSON.stringify({ type: "ready", ...this.info(entry), replay: entry.buffer }));
    socket.on("message", (raw) => {
      let message: { type?: string; data?: string; cols?: number; rows?: number };
      try {
        message = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (entry.exited !== undefined) return;
      if (message.type === "input" && typeof message.data === "string") entry.pty.write(message.data);
      if (message.type === "resize" && message.cols && message.rows) {
        entry.pty.resize(Math.max(2, Math.min(500, Math.floor(message.cols))), Math.max(1, Math.min(300, Math.floor(message.rows))));
      }
    });
    socket.on("close", () => entry.clients.delete(socket));
  }

  close(id: string): boolean {
    const entry = this.open.get(id);
    if (!entry) return false;
    if (entry.exited === undefined) entry.pty.kill();
    for (const client of entry.clients) client.close();
    this.open.delete(id);
    return true;
  }

  closeAll() {
    for (const id of [...this.open.keys()]) this.close(id);
  }

  private info(t: TerminalInfo): TerminalInfo {
    return { id: t.id, title: t.title, cwd: t.cwd, run: t.run, createdAt: t.createdAt, exited: t.exited };
  }
}
