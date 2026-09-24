/**
 * Skills, for real: each skill is a folder — SKILL.md plus the scripts, templates and references
 * it uses — inside ShuaCrew's own Claude Code plugin (~/.shuacrew/plugin). Claude sessions load
 * that plugin, see every skill's description, and invoke one when the work calls for it, exactly
 * as in Claude Code. Your own ~/.claude is never touched. Codex has no plugins, so it is handed a
 * relevant skill's instructions in its prompt instead (memory does that).
 *
 * Every install is also a fact in the log (skill.proposed + skill.decided), so memory knows the
 * skill and accepted skills memory proposes on its own become real skill folders here too.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AnyEvent } from "@shuacrew/core";
import type { EventStore } from "./store.js";

const REPO = "anthropics/skills";
const TREE = `https://api.github.com/repos/${REPO}/git/trees/main?recursive=1`;
const RAW = `https://raw.githubusercontent.com/${REPO}/main`;
const MAX_FILES = 200;
const MAX_BYTES = 12 * 1024 * 1024;

export interface SkillInfo {
  name: string;
  description: string;
  files: number;
  bytes: number;
  source: "catalog" | "yours" | "learned";
  updatedAt: number;
}

export interface CatalogEntry {
  name: string;
  description: string;
  files: number;
  installed: boolean;
}

type Fetch = typeof fetch;

export function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
}

/** The YAML frontmatter fields Claude reads (name, description), from a SKILL.md. */
export function frontmatter(markdown: string): { name?: string; description?: string } {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown)?.[1] ?? "";
  const field = (key: string) => {
    const m = new RegExp(`^${key}:\\s*(.*)$`, "m").exec(block);
    if (!m) return undefined;
    let v = m[1]!.trim();
    if (v === ">" || v === "|" || v === ">-" || v === "|-") {
      // folded / literal block: the indented lines after it
      const after = block.slice(block.indexOf(m[0]) + m[0].length).split("\n");
      v = after.filter((l, i) => i > 0 && /^\s+/.test(l)).map((l) => l.trim()).join(" ");
    }
    return v.replace(/^["']|["']$/g, "");
  };
  return { name: field("name"), description: field("description") };
}

/** A SKILL.md with the frontmatter Claude needs, whatever it came with. */
export function withFrontmatter(name: string, description: string, body: string): string {
  const fm = frontmatter(body);
  if (fm.name && fm.description) return body;
  const rest = body.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  const desc = (fm.description || description || rest.replace(/^#.*$/m, "").trim().split(/\n\s*\n/)[0] || name).replace(/\s+/g, " ").slice(0, 900);
  return `---\nname: ${slug(fm.name || name)}\ndescription: ${JSON.stringify(desc)}\n---\n\n${rest.trim()}\n`;
}

export class Skills {
  private catalogCache?: { at: number; tree: Array<{ path: string; type: string; size?: number }>; entries: CatalogEntry[] };
  private unsubscribe: () => void;
  readonly dir: string;

  constructor(
    private store: EventStore,
    readonly root: string,
    private http: Fetch = fetch,
  ) {
    this.dir = path.join(root, "skills");
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    mkdirSync(path.join(root, ".claude-plugin"), { recursive: true });
    writeFileSync(
      path.join(root, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "shuacrew", version: "1.0.0", description: "Skills installed in ShuaCrew — available to every crew session." }, null, 2),
    );
    // Skills memory proposed and you accepted become real skill folders; rejected ones go.
    this.unsubscribe = store.subscribe((e) => this.take(e));
  }

  stop() {
    this.unsubscribe();
  }

  /** What Claude sessions are given: this plugin, when it has any skills. */
  plugins(): Array<{ type: "local"; path: string; skipMcpDiscovery: boolean }> {
    return this.list().length ? [{ type: "local", path: this.root, skipMcpDiscovery: true }] : [];
  }

  list(): SkillInfo[] {
    const out: SkillInfo[] = [];
    for (const name of readdirSync(this.dir)) {
      const folder = path.join(this.dir, name);
      const file = path.join(folder, "SKILL.md");
      if (!existsSync(file)) continue;
      const fm = frontmatter(readFileSync(file, "utf8"));
      const { files, bytes } = measure(folder);
      const source = existsSync(path.join(folder, ".source")) ? (readFileSync(path.join(folder, ".source"), "utf8").trim() as SkillInfo["source"]) : "yours";
      out.push({ name, description: fm.description ?? "", files, bytes, source, updatedAt: statSync(file).mtimeMs });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  read(name: string): { name: string; body: string; files: string[] } {
    const folder = this.folder(name);
    return { name, body: readFileSync(path.join(folder, "SKILL.md"), "utf8"), files: walk(folder).map((f) => path.relative(folder, f)).filter((f) => f !== ".source") };
  }

  /** Anthropic's public skills, with their descriptions, marked when already installed. */
  async catalog(): Promise<CatalogEntry[]> {
    if (this.catalogCache && Date.now() - this.catalogCache.at < 60 * 60_000) {
      const have = new Set(this.list().map((s) => s.name));
      return this.catalogCache.entries.map((e) => ({ ...e, installed: have.has(e.name) }));
    }
    const response = await this.http(TREE, { headers: { Accept: "application/vnd.github+json", "User-Agent": "shuacrew" }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`GitHub didn't answer (${response.status})`);
    const tree = ((await response.json()) as { tree: Array<{ path: string; type: string; size?: number }> }).tree;
    const names = [...new Set(tree.filter((t) => /^skills\/[^/]+\/SKILL\.md$/.test(t.path)).map((t) => t.path.split("/")[1]!))];
    const entries = await Promise.all(
      names.map(async (name) => {
        const md = await this.text(`${RAW}/skills/${name}/SKILL.md`).catch(() => "");
        return { name, description: frontmatter(md).description ?? "", files: tree.filter((t) => t.type === "blob" && t.path.startsWith(`skills/${name}/`)).length, installed: false };
      }),
    );
    this.catalogCache = { at: Date.now(), tree, entries };
    const have = new Set(this.list().map((s) => s.name));
    return entries.map((e) => ({ ...e, installed: have.has(e.name) }));
  }

  /** Install a whole skill folder from the catalog — SKILL.md and everything it uses. */
  async install(name: string): Promise<SkillInfo> {
    if (!/^[a-z0-9-]+$/.test(name)) throw new Error("unknown skill");
    if (!this.catalogCache) await this.catalog();
    const blobs = this.catalogCache!.tree.filter((t) => t.type === "blob" && t.path.startsWith(`skills/${name}/`));
    if (!blobs.some((b) => b.path === `skills/${name}/SKILL.md`)) throw new Error(`there's no skill called ${name}`);
    if (blobs.length > MAX_FILES) throw new Error(`that skill has ${blobs.length} files — more than ShuaCrew installs (${MAX_FILES})`);
    if (blobs.reduce((n, b) => n + (b.size ?? 0), 0) > MAX_BYTES) throw new Error("that skill is too large to install");
    const staging = path.join(this.root, `.staging-${randomUUID().slice(0, 8)}`);
    try {
      for (const blob of blobs) {
        const rel = blob.path.slice(`skills/${name}/`.length);
        const target = path.join(staging, rel);
        if (!target.startsWith(staging + path.sep)) continue; // never outside the skill's folder
        mkdirSync(path.dirname(target), { recursive: true });
        const response = await this.http(`${RAW}/${blob.path.split("/").map(encodeURIComponent).join("/")}`, { headers: { "User-Agent": "shuacrew" }, signal: AbortSignal.timeout(20_000) });
        if (!response.ok) throw new Error(`couldn't download ${rel}`);
        writeFileSync(target, Buffer.from(await response.arrayBuffer()), { mode: 0o600 });
      }
      writeFileSync(path.join(staging, ".source"), "catalog");
      const folder = path.join(this.dir, name);
      rmSync(folder, { recursive: true, force: true });
      mkdirSync(path.dirname(folder), { recursive: true });
      await import("node:fs/promises").then((fs) => fs.rename(staging, folder));
    } finally {
      rmSync(staging, { recursive: true, force: true });
    }
    this.record(name, readFileSync(path.join(this.dir, name, "SKILL.md"), "utf8"));
    return this.list().find((s) => s.name === name)!;
  }

  /** A skill you write: what it's for (Claude decides when to use it from this) and how to do it. */
  create(input: { name: string; description: string; instructions: string }): SkillInfo {
    const name = slug(input.name);
    if (!name) throw new Error("give the skill a name");
    if (!input.description.trim()) throw new Error("say when the skill should be used — that's how the agent picks it");
    if (!input.instructions.trim()) throw new Error("write the instructions");
    const folder = path.join(this.dir, name);
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    const body = `---\nname: ${name}\ndescription: ${JSON.stringify(input.description.trim().replace(/\s+/g, " "))}\n---\n\n# ${input.name.trim()}\n\n${input.instructions.trim()}\n`;
    writeFileSync(path.join(folder, "SKILL.md"), body, { mode: 0o600 });
    writeFileSync(path.join(folder, ".source"), "yours");
    this.record(name, body);
    return this.list().find((s) => s.name === name)!;
  }

  remove(name: string) {
    const folder = this.folder(name);
    rmSync(folder, { recursive: true, force: true });
    // Memory stops handing it to Codex too.
    for (const e of this.store.ofKinds("skill.proposed")) {
      if (e.kind === "skill.proposed" && slug(e.body.name) === name) this.store.append("skill.decided", { id: e.body.id, accept: false });
    }
  }

  private folder(name: string): string {
    if (!/^[a-z0-9-]+$/.test(name)) throw new Error("unknown skill");
    const folder = path.join(this.dir, name);
    if (!existsSync(path.join(folder, "SKILL.md"))) throw new Error(`no skill ${name}`);
    return folder;
  }

  private record(name: string, body: string) {
    const id = `sk_${randomUUID().slice(0, 8)}`;
    this.recording = true;
    try {
      this.store.append("skill.proposed", { id, name, body: body.slice(0, 8000), from: [] });
      this.store.append("skill.decided", { id, accept: true });
    } finally {
      this.recording = false;
    }
  }

  private recording = false;
  private proposed = new Map<string, { name: string; body: string }>();

  private take(e: AnyEvent) {
    if (e.kind === "skill.proposed") this.proposed.set(e.body.id, { name: e.body.name, body: e.body.body });
    if (e.kind !== "skill.decided" || this.recording) return;
    const skill = this.proposed.get(e.body.id);
    if (!skill) return;
    const name = slug(skill.name);
    const folder = path.join(this.dir, name);
    if (e.body.accept && name && !existsSync(folder)) {
      mkdirSync(folder, { recursive: true, mode: 0o700 });
      writeFileSync(path.join(folder, "SKILL.md"), withFrontmatter(name, "", skill.body), { mode: 0o600 });
      writeFileSync(path.join(folder, ".source"), "learned");
    }
    if (!e.body.accept && existsSync(path.join(folder, ".source")) && readFileSync(path.join(folder, ".source"), "utf8").trim() === "learned") rmSync(folder, { recursive: true, force: true });
  }

  private async text(url: string): Promise<string> {
    const response = await this.http(url, { headers: { "User-Agent": "shuacrew" }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`${response.status}`);
    return response.text();
  }
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function measure(dir: string): { files: number; bytes: number } {
  const files = walk(dir).filter((f) => !f.endsWith(".source"));
  return { files: files.length, bytes: files.reduce((n, f) => n + statSync(f).size, 0) };
}
