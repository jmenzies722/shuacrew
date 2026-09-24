/**
 * `shua` — ShuaCrew from the terminal. One more client of the gateway: anything it can do, the API
 * can do. `doctor` also works with the gateway down, because it checks what the gateway needs.
 */
import { SUBSCRIPTION_STRIPPED } from "@shuacrew/core";
import { ClaudeRuntime, CodexRuntime, findBinary, type Runtime } from "@shuacrew/runtimes";

const BASE = process.env.SHUACREW_URL ?? `http://127.0.0.1:${process.env.SHUACREW_PORT ?? 7420}`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const amber = (s: string) => `\x1b[33m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(BASE + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "X-ShuaCrew": "1", "Content-Type": "application/json", ...(process.env.SHUACREW_TOKEN ? { Authorization: `Bearer ${process.env.SHUACREW_TOKEN}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}

async function doctor(): Promise<number> {
  let problems = 0;
  const line = (ok: boolean | null, label: string, detail: string) => {
    if (ok === false) problems += 1;
    console.log(`  ${ok === true ? green("✓") : ok === false ? red("✗") : amber("!")} ${label.padEnd(22)} ${dim(detail)}`);
  };
  console.log("\nShuaCrew doctor\n");
  const [major] = process.versions.node.split(".").map(Number);
  line((major ?? 0) >= 22, "Node", process.versions.node);
  line(Boolean(findBinary("git")), "git", findBinary("git") ?? "not found — worktrees need git");

  const keys = SUBSCRIPTION_STRIPPED.filter((key) => process.env[key]);
  line(
    keys.length === 0 ? true : null,
    "API keys in env",
    keys.length === 0 ? "none — runtimes use your subscriptions" : `${keys.join(", ")} set here; ShuaCrew strips them from subscription runtimes`,
  );

  for (const runtime of [new ClaudeRuntime(), new CodexRuntime()] as Runtime[]) {
    const status = await runtime.status();
    const ok = status.installed && status.signedIn !== false;
    line(ok, runtime.label, `${status.installed ? `v${status.version ?? "?"} · ` : ""}${status.detail}${status.account ? ` · ${status.account}` : ""} · ${runtime.authMode}`);
  }

  try {
    const health = await api<{ ok: boolean; head: number; rssMb: number; version: string }>("/api/health");
    line(health.ok, "Gateway", `${BASE} · v${health.version} · ${health.head.toLocaleString()} events · ${health.rssMb} MB`);
    const audit = await api<{ ok: boolean; count: number; brokenAt?: number }>("/api/audit/verify");
    line(audit.ok, "Audit chain", audit.ok ? `intact (${audit.count.toLocaleString()} events)` : `BROKEN at #${audit.brokenAt}`);
  } catch {
    line(null, "Gateway", `not running at ${BASE} — start it with \`pnpm dev\``);
  }
  console.log(problems ? `\n${red(`${problems} problem(s)`)}\n` : `\n${green("All good.")}\n`);
  return problems ? 1 : 0;
}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  switch (command) {
    case "doctor":
      return doctor();
    case "run": {
      const ask = rest.filter((a) => !a.startsWith("--")).join(" ");
      const flag = (name: string) => rest.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
      const { id } = await api<{ id: string }>("/api/runs", { ask, runtime: flag("runtime"), model: flag("model"), repo: flag("repo") });
      console.log(`launched ${id} — ${BASE}/runs/${id}`);
      return 0;
    }
    case "approvals": {
      const snapshot = await api<{ approvals: Record<string, { id: string; tool: string; input: unknown; risk: string; reason: string }> }>("/api/snapshot");
      const waiting = Object.values(snapshot.approvals);
      if (!waiting.length) console.log("nothing waiting on you");
      for (const a of waiting) console.log(`${a.id}  ${a.risk.padEnd(8)} ${a.tool}  ${JSON.stringify(a.input).slice(0, 80)}  ${dim(a.reason)}`);
      return 0;
    }
    case "approve":
    case "deny": {
      const [id] = rest;
      await api(`/api/approvals/${id}`, { allow: command === "approve", always: rest.includes("--always") });
      console.log(`${command}d ${id}`);
      return 0;
    }
    case "audit": {
      const result = await api<{ ok: boolean; count: number; brokenAt?: number; why?: string }>("/api/audit/verify");
      console.log(result.ok ? green(`audit chain intact — ${result.count} events`) : red(`audit chain broken at #${result.brokenAt}: ${result.why}`));
      return result.ok ? 0 : 1;
    }
    default:
      console.log(`shua — ShuaCrew from the terminal

  shua doctor                 check runtimes, sign-ins, API-key overrides, gateway, audit chain
  shua run "<ask>" [--runtime=claude|codex|mock] [--model=…] [--repo=path]
  shua approvals              what's waiting on you
  shua approve <id> [--always] · shua deny <id>
  shua audit                  verify the hash-chained audit log`);
      return command ? 1 : 0;
  }
}

process.exitCode = await main(process.argv.slice(2));
