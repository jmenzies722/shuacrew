/**
 * The library: everything the crew made (artifacts) and everything you gave it to know (knowledge),
 * in one searchable place. The log records that an artifact or source exists; the bytes live in
 * 0600 files under the data home, and the text in a full-text index next to the log. The index is
 * derived — lose it and `reindex()` rebuilds it from the files.
 */
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { apply, decide, defaultContext, defaultRules, emptyState, normalise, type AnyEvent, type ArtifactView, type CrewState, type KnowledgeView } from "@shuacrew/core";
import type { EventStore } from "./store.js";

export type ArtifactKind = ArtifactView["kind"];

export interface Hit {
  id: string;
  type: "artifact" | "knowledge";
  title: string;
  where: string; // file inside a folder source, or the artifact's file
  snippet: string;
}

const TEXT = /\.(md|mdx|markdown|txt|text|csv|tsv|json|jsonl|ya?ml|toml|xml|html?|css|scss|js|jsx|ts|tsx|mjs|cjs|py|rb|go|rs|swift|kt|java|c|h|cpp|hpp|cs|php|sh|zsh|sql|graphql|proto|ini|cfg|conf|env\.example|log|tex|org|rst|adoc)$/i;
const CONVERT = /\.(docx?|rtf|rtfd|odt|pages|webarchive)$/i; // macOS textutil reads these
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", ".turbo", "target", "vendor", ".venv", "venv", "__pycache__", "Pods", "DerivedData", ".cache"]);
const MAX_FILE = 2 * 1024 * 1024;
const MAX_SOURCE = 60 * 1024 * 1024;
const MAX_FILES = 3000;
const CHUNK = 1400;

const MIME: Record<string, string> = {
  md: "text/markdown", markdown: "text/markdown", txt: "text/plain", html: "text/html", htm: "text/html", css: "text/css",
  json: "application/json", csv: "text/csv", svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", webp: "image/webp", pdf: "application/pdf", js: "text/javascript", ts: "text/plain", tsx: "text/plain",
  py: "text/plain", sql: "text/plain", yaml: "text/yaml", yml: "text/yaml", xml: "application/xml",
};

export function kindOf(file: string): ArtifactKind {
  const ext = file.split(".").pop()?.toLowerCase() ?? "";
  if (["md", "markdown", "txt", "rtf", "docx"].includes(ext)) return "doc";
  if (["html", "htm"].includes(ext)) return "page";
  if (["csv", "tsv", "json", "jsonl", "yaml", "yml", "xml", "sql"].includes(ext)) return "data";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image";
  if (TEXT.test(file)) return "code";
  return "file";
}

/** Paragraph-aware chunks of about CHUNK characters, so a hit points at the part that matters. */
export function chunk(text: string): string[] {
  const out: string[] = [];
  let current = "";
  for (const para of text.replace(/\r\n/g, "\n").split(/\n{2,}/)) {
    if (current && current.length + para.length > CHUNK) {
      out.push(current);
      current = "";
    }
    if (para.length > CHUNK * 1.5) {
      for (let i = 0; i < para.length; i += CHUNK) out.push(para.slice(i, i + CHUNK));
      continue;
    }
    current = current ? `${current}\n\n${para}` : para;
  }
  if (current.trim()) out.push(current);
  return out.filter((c) => c.trim());
}

/** Plain words → an FTS query that finds documents with all of them (prefix-matched). */
export function ftsQuery(query: string, any = false): string {
  const words = (query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length > 1).slice(0, 12);
  return words.map((w) => `"${w}"*`).join(any ? " OR " : " ");
}

export class Library {
  private state: CrewState = emptyState();
  private index: DatabaseSync;
  private unsubscribe: () => void;

  constructor(
    private store: EventStore,
    private root: string,
  ) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    chmodSync(root, 0o700);
    const db = path.join(root, "index.db");
    this.index = new DatabaseSync(db);
    chmodSync(db, 0o600); // it holds the text of your documents
    this.index.exec(`
      create table if not exists docs (id text not null, type text not null, title text not null, file text not null, text text not null);
      create index if not exists docs_id on docs(id);
      create virtual table if not exists chunks using fts5(id unindexed, type unindexed, title, file unindexed, text, tokenize='porter unicode61');
    `);
    for (const e of store.read(0)) this.take(e);
    this.unsubscribe = store.subscribe((e) => this.take(e));
  }

  private take(e: AnyEvent) {
    if (e.kind.startsWith("artifact.") || e.kind.startsWith("knowledge.")) apply(this.state, e);
  }

  stop() {
    this.unsubscribe();
    this.index.close();
  }

  artifacts(): ArtifactView[] {
    return Object.values(this.state.artifacts).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  sources(): KnowledgeView[] {
    return Object.values(this.state.knowledge).sort((a, b) => b.addedAt - a.addedAt);
  }

  artifact(id: string): ArtifactView | undefined {
    return this.state.artifacts[id];
  }

  /** The file that holds an artifact's version (latest when not given). */
  fileOf(id: string, version?: number): string | undefined {
    const a = this.state.artifacts[id];
    if (!a) return undefined;
    const v = version && version >= 1 && version <= a.version ? version : a.version;
    const file = path.join(this.root, "artifacts", id, `v${v}`, a.file);
    return existsSync(file) ? file : undefined;
  }

  // ── artifacts ──────────────────────────────────────────────────────────────

  /** Save something the crew made. Passing an existing id saves a new version of it. */
  save(input: { title: string; content: string | Buffer; filename?: string; summary?: string; id?: string; run?: string; member?: string; by?: "agent" | "you" }): ArtifactView {
    const title = input.title.trim().slice(0, 160);
    if (!title) throw new Error("an artifact needs a title");
    const bytes = typeof input.content === "string" ? Buffer.from(input.content, "utf8") : input.content;
    if (!bytes.length) throw new Error("an artifact needs content");
    if (bytes.length > 20 * 1024 * 1024) throw new Error("artifacts are limited to 20 MB");
    const was = input.id ? this.state.artifacts[input.id] : undefined;
    if (input.id && !was) throw new Error(`no artifact ${input.id}`);
    const id = was?.id ?? `a_${randomUUID().slice(0, 10)}`;
    const file = safeName(input.filename || was?.file || `${slug(title)}.md`);
    const version = (was?.version ?? 0) + 1;
    const dir = path.join(this.root, "artifacts", id, `v${version}`);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const full = path.join(dir, file);
    writeFileSync(full, bytes, { mode: 0o600 });
    chmodSync(full, 0o600);
    const ext = file.split(".").pop()?.toLowerCase() ?? "";
    this.store.append(
      "artifact.saved",
      { id, version, title, kind: kindOf(file), file, mime: MIME[ext] ?? "application/octet-stream", size: bytes.length, summary: input.summary?.trim().slice(0, 400) || undefined, member: input.member, by: input.by ?? "agent" },
      { run: input.run ?? null },
    );
    this.unindex(id);
    if (TEXT.test(file)) this.indexDoc(id, "artifact", title, file, bytes.toString("utf8"), searchable(file, bytes.toString("utf8")));
    return this.state.artifacts[id]!;
  }

  /** A deleted session's artifacts: out of the library's view, its search index and the disk (their events are purged with the session). */
  forgetArtifacts(ids: string[]) {
    for (const id of ids) {
      delete this.state.artifacts[id];
      this.unindex(id);
      if (/^[\w-]{1,80}$/.test(id)) rmSync(path.join(this.root, "artifacts", id), { recursive: true, force: true });
    }
  }

  removeArtifact(id: string) {
    if (!this.state.artifacts[id]) throw new Error(`no artifact ${id}`);
    this.store.append("artifact.removed", { id });
    this.unindex(id);
    rmSync(path.join(this.root, "artifacts", id), { recursive: true, force: true });
  }

  // ── knowledge ──────────────────────────────────────────────────────────────

  /** A note you write straight into the library. */
  note(title: string, text: string): KnowledgeView {
    if (!text.trim()) throw new Error("the note is empty");
    const id = `k_${randomUUID().slice(0, 10)}`;
    const chunks = this.indexDoc(id, "knowledge", title.trim() || "Note", "note", text);
    this.store.append("knowledge.added", { id, title: title.trim() || "Note", source: "note", files: 1, chunks, size: Buffer.byteLength(text) });
    return this.state.knowledge[id]!;
  }

  /**
   * A file or folder you point at. Its text is copied into the index (the library works even if
   * the original moves), and the same policy that guards the agents guards this: no secrets, no
   * protected folders.
   */
  add(target: string, title?: string, id = `k_${randomUUID().slice(0, 10)}`): KnowledgeView {
    const file = path.resolve(target.replace(/^~(?=$|\/)/, process.env.HOME ?? "~"));
    if (!existsSync(file)) throw new Error(`nothing at ${target}`);
    this.guard(file);
    const folder = statSync(file).isDirectory();
    let files = 0;
    let chunks = 0;
    let size = 0;
    this.unindex(id); // re-reading a source replaces what was indexed for it
    for (const f of folder ? walk(file) : [file]) {
      if (files >= MAX_FILES || size >= MAX_SOURCE) break;
      if (folder && !this.allowed(f)) continue;
      const text = readText(f);
      if (!text?.trim()) continue;
      files++;
      size += text.length;
      chunks += this.indexDoc(id, "knowledge", title?.trim() || path.basename(file), folder ? path.relative(file, f) : path.basename(f), text);
    }
    if (!files) throw new Error(folder ? "found no readable text files in that folder" : readError(file));
    this.store.append("knowledge.added", { id, title: title?.trim() || path.basename(file), source: folder ? "folder" : "file", origin: file, files, chunks, size });
    this.prints.set(id, fingerprint(file));
    return this.state.knowledge[id]!;
  }

  private prints = new Map<string, string>();

  /**
   * Keep what you added current: a file or folder that changed since it was read is read again
   * (same id, so search results and agents' references still work). Cheap when nothing changed.
   */
  resync(): string[] {
    const changed: string[] = [];
    for (const source of this.sources()) {
      if (!source.origin || source.source === "note" || !existsSync(source.origin)) continue;
      const now = fingerprint(source.origin);
      const was = this.prints.get(source.id);
      if (was === undefined) {
        this.prints.set(source.id, now); // first look since start: remember, don't re-read
        continue;
      }
      if (was === now) continue;
      try {
        this.add(source.origin, source.title, source.id);
        changed.push(source.id);
      } catch {
        this.prints.set(source.id, now);
      }
    }
    return changed;
  }


  removeSource(id: string) {
    if (!this.state.knowledge[id]) throw new Error(`no source ${id}`);
    this.store.append("knowledge.removed", { id });
    this.unindex(id);
  }

  // ── search ─────────────────────────────────────────────────────────────────

  search(query: string, options: { limit?: number; type?: "artifact" | "knowledge" } = {}): Hit[] {
    const limit = Math.min(Math.max(options.limit ?? 8, 1), 30);
    for (const any of [false, true]) {
      const match = ftsQuery(query, any);
      if (!match) return [];
      const rows = this.index
        .prepare(
          `select id, type, title, file, snippet(chunks, 4, '«', '»', '…', 24) as snippet from chunks
           where chunks match ? ${options.type ? "and type = ?" : ""} order by bm25(chunks, 0, 0, 4, 0, 1) limit ?`,
        )
        .all(...([match, ...(options.type ? [options.type] : []), limit * 3] as [string, ...Array<string | number>])) as unknown as Array<Hit & { file: string }>;
      // One hit per file: the best chunk.
      const seen = new Set<string>();
      const hits: Hit[] = [];
      for (const r of rows) {
        const key = `${r.id}:${r.file}`;
        if (seen.has(key) || (!this.state.artifacts[r.id] && !this.state.knowledge[r.id])) continue;
        seen.add(key);
        hits.push({ id: r.id, type: r.type, title: r.title, where: r.file, snippet: r.snippet.replace(/\s+/g, " ").trim() });
        if (hits.length >= limit) break;
      }
      if (hits.length) return hits;
    }
    return [];
  }

  /** Full text of an artifact or a source (or one file of a folder source), capped for a context window. */
  read(id: string, file?: string, max = 60_000): { title: string; text: string; truncated: boolean } {
    const rows = this.index.prepare(`select title, file, text from docs where id = ? ${file ? "and file = ?" : ""}`).all(...([id, ...(file ? [file] : [])] as [string, ...string[]])) as Array<{ title: string; file: string; text: string }>;
    if (!rows.length) throw new Error(this.state.artifacts[id] ? "that artifact isn't text — open it in the Library" : `nothing in the library called ${id}`);
    const text = rows.length === 1 ? rows[0]!.text : rows.map((r) => `### ${r.file}\n\n${r.text}`).join("\n\n");
    return { title: rows[0]!.title, text: text.slice(0, max), truncated: text.length > max };
  }

  /** Rebuild the artifact half of the index from the files (knowledge text lives only in the index). */
  reindex() {
    for (const a of Object.values(this.state.artifacts)) {
      const f = this.fileOf(a.id);
      this.unindex(a.id);
      if (f && TEXT.test(a.file)) this.indexDoc(a.id, "artifact", a.title, a.file, readFileSync(f, "utf8"), searchable(a.file, readFileSync(f, "utf8")));
    }
  }

  /** `text` is what reading returns (a page's source); `search` is what matching and snippets see. */
  private indexDoc(id: string, type: "artifact" | "knowledge", title: string, file: string, text: string, search = text): number {
    this.index.prepare("insert into docs (id, type, title, file, text) values (?, ?, ?, ?, ?)").run(id, type, title, file, text);
    const insert = this.index.prepare("insert into chunks (id, type, title, file, text) values (?, ?, ?, ?, ?)");
    const parts = chunk(search);
    for (const part of parts) insert.run(id, type, title, file, part);
    return parts.length;
  }

  private unindex(id: string) {
    this.index.prepare("delete from docs where id = ?").run(id);
    this.index.prepare("delete from chunks where id = ?").run(id);
  }

  private guard(file: string) {
    const verdict = decide(normalise("Read", { file_path: file }), defaultContext(path.dirname(file)), [{ name: "global", rules: defaultRules() }]);
    if (verdict.verdict === "deny") throw new Error(`can't add that: ${verdict.reason}`);
  }

  private allowed(file: string): boolean {
    try {
      this.guard(file);
      return true;
    } catch {
      return false;
    }
  }
}

/** How a file or folder looks right now: count, newest change, total size. */
function fingerprint(target: string): string {
  try {
    const st = statSync(target);
    if (!st.isDirectory()) return `1:${st.mtimeMs}:${st.size}`;
    let n = 0;
    let newest = 0;
    let bytes = 0;
    for (const f of walk(target)) {
      const s = statSync(f);
      n++;
      newest = Math.max(newest, s.mtimeMs);
      bytes += s.size;
      if (n > MAX_FILES) break;
    }
    return `${n}:${newest}:${bytes}`;
  } catch {
    return "gone";
  }
}

function* walk(dir: string, depth = 0): Generator<string> {
  if (depth > 8) return;
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") && e.name !== ".github") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) yield* walk(full, depth + 1);
    } else if (e.isFile() && (TEXT.test(e.name) || CONVERT.test(e.name) || /\.pdf$/i.test(e.name))) yield full;
  }
}

function readText(file: string): string | undefined {
  try {
    if (statSync(file).size > MAX_FILE * (CONVERT.test(file) || /\.pdf$/i.test(file) ? 10 : 1)) return undefined;
    if (TEXT.test(file)) {
      const text = readFileSync(file, "utf8");
      if (text.includes("\u0000")) return undefined; // binary after all
      return /\.html?$/i.test(file) ? htmlText(text) : text;
    }
    if (CONVERT.test(file)) return execFileSync("/usr/bin/textutil", ["-convert", "txt", "-stdout", file], { encoding: "utf8", timeout: 20_000, maxBuffer: 20 * 1024 * 1024 });
    if (/\.pdf$/i.test(file)) {
      for (const bin of ["/opt/homebrew/bin/pdftotext", "/usr/local/bin/pdftotext"]) {
        if (existsSync(bin)) return execFileSync(bin, ["-layout", file, "-"], { encoding: "utf8", timeout: 30_000, maxBuffer: 30 * 1024 * 1024 });
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function readError(file: string): string {
  if (/\.pdf$/i.test(file)) return "PDFs need pdftotext — install it with `brew install poppler`, then add the file again";
  return "couldn't read text from that file";
}

function htmlText(html: string): string {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|h\d|li|tr|section|article)>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*(\n\s*)+/g, "\n\n");
}

/** What search sees: a page's words, not its markup. */
function searchable(file: string, text: string): string {
  return /\.html?$/i.test(file) ? htmlText(text) : text;
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "artifact";
}

/** A filename, never a path. */
function safeName(name: string): string {
  return path.basename(name).replace(/[^\w.\- ]+/g, "_").replace(/^\.+/, "").slice(0, 120) || "artifact.md";
}
