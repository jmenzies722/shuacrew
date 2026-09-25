import { lstatSync, openSync, readSync, readdirSync, statSync, closeSync } from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { redact, redactDeep } from "@shuacrew/core";
import type { EventStore } from "./store.js";

/** Read-only developer tools. Everything returned is bounded and redacted; nothing here writes. */
export function devRoutes(app: FastifyInstance, store: EventStore) {
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
