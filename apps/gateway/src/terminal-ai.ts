/**
 * Type what you want, get the command: plain English → one shell command, written by Claude
 * (Haiku) through your own logged-in `claude` CLI — your subscription, no API key, and no tools:
 * it can only answer, never run anything. You see the command and choose to run it.
 */
import { execFile } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const SYSTEM = `You turn a request into ONE shell command for zsh on macOS (BSD tools, Homebrew installed).
Reply with only the command — no explanation, no backticks, no leading $.
Prefer safe, read-only commands when the request allows. Never use sudo or rm -rf unless the request explicitly asks.
If it truly needs several steps, join them with && on one line.`;

const bin = () => [path.join(os.homedir(), ".local/bin/claude"), "/opt/homebrew/bin/claude", "/usr/local/bin/claude", ...(process.env.PATH ?? "").split(":").map((d) => path.join(d, "claude"))].find((p) => existsSync(p));

/**
 * Why the CLI failed, in words worth showing. `claude -p` reports things like a usage limit on
 * stdout; Node's own message is "Command failed: <the whole argv>", which is never useful.
 */
export function failure(stdout: string, stderr: string, error: Error & { killed?: boolean; code?: unknown }): string {
  if (error.killed) return "Claude took too long — try again";
  const said = (stdout.trim() || stderr.trim()).split("\n").filter(Boolean).pop();
  if (said && /limit|reset/i.test(said)) return `Claude is at its usage limit — ${said}`;
  if (said) return said.slice(0, 200);
  return error.code === "ENOENT" ? "the claude CLI isn't installed" : "Claude couldn't answer — check `claude` works in a terminal";
}

export type Ask =(args: string[], cwd: string) => Promise<string>;

/** One tool-less `claude -p` call through your logged-in CLI (your subscription, never an API key). */
export const claude: Ask = (args, cwd) =>
  new Promise((resolve, reject) => {
    const file = bin();
    if (!file) return reject(new Error("the claude CLI isn't installed"));
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY; // your subscription, never a stray key
    delete env.ANTHROPIC_AUTH_TOKEN;
    // No personal settings: your own Claude Code output style or CLAUDE.md would leak into ShuaCrew's answers.
    const child = execFile(file, [...args, "--setting-sources", ""], { cwd, env, timeout: 60_000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) =>
      error ? reject(new Error(failure(stdout.toString(), stderr.toString(), error))) : resolve(stdout.toString()),
    );
    child.stdin?.end();
  });

/** The command, cleaned of anything that isn't the command. */
export function commandFrom(reply: string): string {
  const fenced = /```(?:\w+)?\n([\s\S]*?)```/.exec(reply)?.[1];
  const text = (fenced ?? reply).trim();
  const lines = text.split("\n").map((l) => l.replace(/^\$\s+/, "").trimEnd()).filter(Boolean);
  // Keep continuation lines (ending in \) together; otherwise the first line is the command.
  const out: string[] = [];
  for (const line of lines) {
    out.push(line);
    if (!line.endsWith("\\")) break;
  }
  return out.join("\n").replace(/^`|`$/g, "");
}

export async function suggest(input: { prompt: string; cwd?: string; branch?: string; last?: { command: string; exit?: number } }, ask: Ask = claude): Promise<string> {
  const prompt = input.prompt.trim().replace(/^#\s*/, "");
  if (!prompt) throw new Error("say what you want to do");
  const cwd = input.cwd && existsSync(input.cwd) ? input.cwd : os.homedir();
  let listing = "";
  try {
    listing = readdirSync(cwd).filter((n) => !n.startsWith(".")).slice(0, 40).join("  ");
  } catch {
    /* unreadable folder: no listing */
  }
  const context = [
    `Folder: ${cwd}`,
    input.branch && `Git branch: ${input.branch}`,
    listing && `In it: ${listing}`,
    input.last && `Last command: ${input.last.command}${input.last.exit !== undefined ? ` (exit ${input.last.exit})` : ""}`,
    `Request: ${prompt}`,
  ]
    .filter(Boolean)
    .join("\n");
  const reply = await ask(["-p", context, "--model", "claude-haiku-4-5", "--tools", "", "--system-prompt", SYSTEM], cwd);
  const command = commandFrom(reply);
  if (!command) throw new Error("no command came back — try saying it another way");
  return command;
}
