/**
 * Type what you want, get the command: plain English → one shell command, written by Codex
 * through your own logged-in Codex subscription — your subscription, no API key, and no tools:
 * it can only answer, never run anything. You see the command and choose to run it.
 */
import { CodexRuntime, codexTeachingCompletion } from "@shuacrew/runtimes";
import { agentEnv } from "@shuacrew/core/redact";
import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const SYSTEM = `You turn a request into ONE shell command for zsh on macOS (BSD tools, Homebrew installed).
Reply with only the command — no explanation, no backticks, no leading $.
Prefer safe, read-only commands when the request allows. Never use sudo or rm -rf unless the request explicitly asks.
If it truly needs several steps, join them with && on one line.`;

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

/** Tool-free structured answer using the same subscription transport as visual teaching. */
export const codex: Ask = async (args, cwd) => {
  const runtime = new CodexRuntime({ authMode: "subscription" });
  const model = runtime.models.find(m => m.tier === "fast")?.id ?? runtime.models[0]?.id;
  if (!model) throw new Error("No Codex model is available");
  const value = await codexTeachingCompletion({
    prompt: args[args.indexOf("-p") + 1] ?? "", system: args[args.indexOf("--system-prompt") + 1] ?? "Reply accurately.",
    schema: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"], additionalProperties: false },
    model, cwd, env: agentEnv(process.env, "subscription"), signal: AbortSignal.timeout(60000), images: [],
  });
  if (!value || typeof (value as { answer?: unknown }).answer !== "string") throw new Error("Codex returned no answer");
  return (value as { answer: string }).answer;
};

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

export async function suggest(input: { prompt: string; cwd?: string; branch?: string; last?: { command: string; exit?: number } }, ask: Ask = codex): Promise<string> {
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
  const reply = await ask(["-p", context, "--model", "codex-auto", "--tools", "", "--system-prompt", SYSTEM], cwd);
  const command = commandFrom(reply);
  if (!command) throw new Error("no command came back — try saying it another way");
  return command;
}
