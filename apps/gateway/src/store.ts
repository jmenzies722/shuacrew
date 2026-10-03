/**
 * The event store: an append-only, hash-chained log on SQLite.
 *
 * `node:sqlite` rather than better-sqlite3: it ships with Node, needs no native build (so the
 * desktop app bundles a plain Node binary), and measured 100k inserts in ~45ms here. WAL mode
 * lets the dashboard read while an agent writes. Every statement is prepared once.
 *
 * Nothing leaves this file un-redacted: agent output can contain secrets an agent printed by
 * accident, so bodies are redacted *before* they are stored and hashed — the log never holds them.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import {
  GENESIS,
  hashOf,
  parseBody,
  redactDeep,
  verify,
  type AnyEvent,
  type Body,
  type Kind,
  type Verification,
} from "@shuacrew/core";

type Row = { seq: number; at: number; kind: string; run: string | null; session: string | null; body: string; prev: string; hash: string };

export type Listener = (event: AnyEvent) => void;

export class EventStore {
  readonly path: string;
  private db: DatabaseSync;
  private listeners = new Set<Listener>();
  private lastHash: string;
  private lastSeq: number;
  private insert: StatementSync;
  private since: StatementSync;
  private sinceForRun: StatementSync;
  private ofKind: StatementSync;

  constructor(file = ":memory:") {
    this.path = file;
    if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS action_receipts (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, owner TEXT NOT NULL, result TEXT);
      CREATE TABLE IF NOT EXISTS events (
        seq     INTEGER PRIMARY KEY,
        at      REAL    NOT NULL,
        kind    TEXT    NOT NULL,
        run     TEXT,
        session TEXT,
        body    TEXT    NOT NULL,
        prev    TEXT    NOT NULL,
        hash    TEXT    NOT NULL
      );
      CREATE INDEX IF NOT EXISTS events_run  ON events (run, seq);
      CREATE INDEX IF NOT EXISTS events_kind ON events (kind, seq);
    `);
    this.insert = this.db.prepare(
      "INSERT INTO events (seq, at, kind, run, session, body, prev, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    this.since = this.db.prepare("SELECT * FROM events WHERE seq > ? ORDER BY seq LIMIT ?");
    this.sinceForRun = this.db.prepare("SELECT * FROM events WHERE run = ? AND seq > ? ORDER BY seq");
    this.ofKind = this.db.prepare("SELECT * FROM events WHERE kind = ? AND seq > ? ORDER BY seq");
    const last = this.db.prepare("SELECT seq, hash FROM events ORDER BY seq DESC LIMIT 1").get() as
      | { seq: number; hash: string }
      | undefined;
    this.lastSeq = last?.seq ?? 0;
    this.lastHash = last?.hash ?? GENESIS;
  }

  /** Durable at-most-once reservation. An interrupted/unknown action is never automatically retried. */
  claimAction(id: string, fingerprint: string, owner: string) {
    const inserted = this.db.prepare("INSERT OR IGNORE INTO action_receipts (id, fingerprint, owner) VALUES (?, ?, ?)").run(id, fingerprint, owner).changes;
    const row = this.db.prepare("SELECT fingerprint, result FROM action_receipts WHERE id = ?").get(id) as { fingerprint: string; result: string | null };
    return { claimed: Number(inserted) === 1, conflict: row.fingerprint !== fingerprint, result: row.result ? JSON.parse(row.result) as { ok: boolean; message: string; run?: string } : null };
  }
  finishAction(id: string, owner: string, result: { ok: boolean; message: string; run?: string }) {
    return Number(this.db.prepare("UPDATE action_receipts SET result = ? WHERE id = ? AND owner = ? AND result IS NULL").run(JSON.stringify(redactDeep(result)), id, owner).changes) === 1;
  }

  get head(): number {
    return this.lastSeq;
  }

  /** Record a fact. Validated, redacted, chained, stored, then announced — in that order. */
  append<K extends Kind>(kind: K, body: Body<K> | Record<string, unknown>, where: { run?: string | null; session?: string | null } = {}): AnyEvent {
    const clean = redactDeep(parseBody(kind, body));
    const fact = {
      seq: this.lastSeq + 1,
      at: Date.now(),
      kind,
      run: where.run ?? null,
      session: where.session ?? null,
      body: clean,
      prev: this.lastHash,
    };
    const hash = hashOf(fact);
    this.insert.run(fact.seq, fact.at, fact.kind, fact.run, fact.session, JSON.stringify(fact.body), fact.prev, hash);
    this.lastSeq = fact.seq;
    this.lastHash = hash;
    const event = { ...fact, hash } as AnyEvent;
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // a broken subscriber must never stop the log
      }
    }
    return event;
  }

  /** Everything after `after`, oldest first, in pages — so a reconnecting client asks for what it missed. */
  *read(after = 0, page = 5000): Generator<AnyEvent> {
    let cursor = after;
    for (;;) {
      const rows = this.since.all(cursor, page) as Row[];
      for (const row of rows) {
        cursor = row.seq;
        yield toEvent(row);
      }
      if (rows.length < page) return;
    }
  }

  forRun(run: string, after = 0): AnyEvent[] {
    return (this.sinceForRun.all(run, after) as Row[]).map(toEvent);
  }

  ofKinds(kind: Kind, after = 0): AnyEvent[] {
    return (this.ofKind.all(kind, after) as Row[]).map(toEvent);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  verify(): Verification {
    return verify(this.read(0));
  }

  close(): void {
    this.listeners.clear();
    if (this.db.isOpen) this.db.close();
  }

  /** Test seam: lets a test tamper with the log to prove `verify` notices. */
  unsafeExec(sql: string): void {
    this.db.exec(sql);
  }

  /** A consistent copy of the whole log, safe to take while it's being written (for backups). */
  snapshot(file: string): void {
    this.db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  }
}

function toEvent(row: Row): AnyEvent {
  return {
    seq: row.seq,
    at: row.at,
    kind: row.kind as Kind,
    run: row.run,
    session: row.session,
    body: JSON.parse(row.body),
    prev: row.prev,
    hash: row.hash,
  } as AnyEvent;
}
