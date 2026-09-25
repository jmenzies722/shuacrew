import { lstatSync, openSync, readSync, readdirSync, statSync, closeSync } from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { redact, redactDeep } from "@shuacrew/core";
import type { EventStore } from "./store.js";

/** Read-only developer tools. Everything returned is bounded and redacted; nothing here writes. */
export function devRoutes(app: FastifyInstance, store: EventStore, prompts?: { promptsFor(run: string): unknown[]; promptRuns(): string[] }) {
  const home = path.dirname(store.path);

  // Newest-first tail of the event log, optionally filtered by kind prefix ("run.", "room.queue").
  app.get<{ Querystring: { before?: string; limit?: string; kind?: string } }>("/api/dev/events", async (req) => {
    const head = store.head, before = Math.min(Number(req.query.before) || head + 1, head + 1);
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 100, 500));
    const kind = (req.query.kind ?? "").trim().slice(0, 64);
    const window = kind ? 20_000 : limit;
    const matches: Array<{ seq: number; at: number; kind: string; run?: string; body: string }> = [];
    for (const e of store.read(Math.max(0, before - 1 - window))) {
      if (e.seq >= before) break;
      if (kind && !e.kind.startsWith(kind)) continue;
      const body = JSON.stringify(redactDeep(e.body));
      matches.push({ seq: e.seq, at: e.at, kind: e.kind, run: e.run ?? undefined, body: body.length > 4000 ? `${body.slice(0, 4000)}…` : body });
      if (matches.length > limit) matches.shift();
    }
    return { head, events: matches.reverse() };
  });

  // Prompt inspector: exactly what recent turns were sent (redacted). In memory since the gateway started.
  app.get<{ Querystring: { run?: string } }>("/api/dev/prompts", async (req) => {
    if (!prompts) return { runs: [], prompts: [] };
    const run = req.query.run ?? prompts.promptRuns()[0];
    return { runs: prompts.promptRuns(), run: run ?? null, prompts: run ? redactDeep(prompts.promptsFor(run)) : [] };
  });

  // Activity over a window: events per bucket by group, tool usage, run outcomes. Read-only, from the log.
  app.get<{ Querystring: { minutes?: string } }>("/api/dev/metrics", async (req) => devMetrics(store, Math.max(5, Math.min(Number(req.query.minutes) || 60, 1440))));

  // Last lines of the gateway log (tail read, never the whole file).
  app.get<{ Querystring: { lines?: string } }>("/api/dev/log", async () => {
    const file = path.join(home, "gateway.log");
    try {
      const size = statSync(file).size, span = Math.min(size, 256 * 1024), buffer = Buffer.alloc(span), fd = openSync(file, "r");
      try { readSync(fd, buffer, 0, span, size - span); } finally { closeSync(fd); }
      const lines = buffer.toString("utf8").split("\n");
      if (span < size) lines.shift(); // drop the partial first line
      return { file, size, lines: lines.slice(-400).map(redact) };
    } catch { return { file, size: 0, lines: [] }; }
  });

  // What ShuaCrew keeps on disk, by area.
  app.get("/api/dev/storage", async () => {
    const du = (target: string, depth = 0): number => {
      try {
        const st = lstatSync(target);
        if (!st.isDirectory() || st.isSymbolicLink()) return st.size;
        if (depth > 12) return 0;
        return readdirSync(target).reduce((sum, name) => sum + du(path.join(target, name), depth + 1), 0);
      } catch { return 0; }
    };
    const areas: Array<[string, string[]]> = [
      ["Event log & audit", ["shuacrew.db", "shuacrew.db-wal", "shuacrew.db-shm"]], ["Library", ["library"]], ["Speech models", ["models", "speech"]],
      ["Published sites", ["sites"]], ["Snapshots", ["snapshots"]], ["Workspace", ["workspace"]], ["Terminal history", ["shell"]], ["Gateway log", ["gateway.log"]],
    ];
    return { home, events: store.head, areas: areas.map(([label, parts]) => ({ label, bytes: parts.reduce((s, p) => s + du(path.join(home, p)), 0) })) };
  });
}

const GROUPS = ["agent", "run", "tool", "turn", "room", "approval", "policy", "mcp", "gateway", "other"] as const;
const SCAN = 60_000;
/** Buckets the last `minutes` of events. Scans at most the newest 60k events and says so if the window reaches past them. */
export function devMetrics(store: EventStore, minutes: number, now = Date.now()) {
  const since = now - minutes * 60_000, bucketMs = Math.max(60_000, Math.ceil((minutes * 60_000) / 60 / 60_000) * 60_000);
  const count = Math.ceil((now - since) / bucketMs);
  const buckets = Array.from({ length: count }, (_, i) => ({ at: since + i * bucketMs, ...Object.fromEntries(GROUPS.map((g) => [g, 0])) })) as Array<{ at: number } & Record<(typeof GROUPS)[number], number>>;
  const tools = new Map<string, { calls: number; failed: number }>(), callName = new Map<string, string>();
  const outcomes: Record<string, number> = { done: 0, failed: 0, cancelled: 0, merged: 0 };
  const start = Math.max(0, store.head - SCAN);
  let first: number | undefined, total = 0;
  for (const e of store.read(start)) {
    first ??= e.at;
    if (e.at < since || e.at > now) continue;
    total++;
    const head = e.kind.split(".")[0]!, group = (GROUPS as readonly string[]).includes(head) ? head as (typeof GROUPS)[number] : "other";
    const b = buckets[Math.min(count - 1, Math.floor((e.at - since) / bucketMs))];
    if (b) b[group]++;
    if (e.kind === "tool.called") { const name = e.body.tool; callName.set(e.body.id, name); const t = tools.get(name) ?? { calls: 0, failed: 0 }; t.calls++; tools.set(name, t); }
    // A result only carries its call id; failures count against the tool that call used.
    if (e.kind === "tool.returned" && !e.body.ok) { const name = callName.get(e.body.id); const t = name ? tools.get(name) : undefined; if (t) t.failed++; }
    if (e.kind === "run.status") { const st = String((e.body as { status?: unknown }).status); if (st in outcomes) outcomes[st]!++; }
  }
  return {
    minutes, bucketMs, total, groups: GROUPS, buckets,
    tools: [...tools.entries()].map(([name, t]) => ({ name, ...t })).sort((a, b) => b.calls - a.calls).slice(0, 12),
    outcomes,
    // Honest coverage: if we started scanning mid-window, earlier activity isn't counted.
    partial: start > 0 && first !== undefined && first > since,
  };
}
