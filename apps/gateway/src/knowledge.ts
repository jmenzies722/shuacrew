/**
 * What ShuaCrew knows about you, as plain files you own: `~/.shuacrew/knowledge/{me,projects,people,commitments,style}.md`.
 * Shua and every session read them, so you never explain yourself twice; you (or Shua, when you ask) edit them, and
 * nothing else writes there. They are ordinary Markdown: open them in any editor, keep them in git, delete them.
 *
 * `profile()` is the one thing the rest of the gateway uses: those files as a short block of context for a prompt.
 * Template text that was never filled in (comments, a label with nothing after it) is left out, so an untouched
 * store adds nothing to any prompt.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { FastifyInstance } from "fastify";

export const KNOWLEDGE_FILES = ["me", "projects", "commitments", "people", "style"] as const;
export type KnowledgeName = (typeof KNOWLEDGE_FILES)[number];
export const KNOWLEDGE_TITLES: Record<KnowledgeName, string> = { me: "About me", projects: "Projects", commitments: "Commitments", people: "People", style: "How I write" };
/** One file's ceiling. These are notes for a prompt, not an archive. */
export const KNOWLEDGE_MAX_CHARS = 20_000;

/** What is already known when the store is first created (your setup answers, this Mac's account name). */
export interface KnowledgeSeed { firstName?: string; goal?: string; weeklyHours?: number | null; incomePath?: string }

const INCOME: Record<string, string> = { products: "products I build", services: "services I offer", both: "products and services" };

function templates(seed: KnowledgeSeed): Record<KnowledgeName, string> {
  return {
    me: [
      "# About me",
      "<!-- Shua and every session read this file. Keep it short and true; change it whenever something changes. -->",
      `- Name: ${seed.firstName ?? ""}`,
      `- Main goal: ${seed.goal?.trim() ?? ""}`,
      `- Time for side projects: ${seed.weeklyHours ? `${seed.weeklyHours} hours a week` : ""}`,
      `- How I want to earn from them: ${seed.incomePath ? INCOME[seed.incomePath] ?? seed.incomePath : ""}`,
      "- How I like to work: ",
      "",
    ].join("\n"),
    projects: "# Projects\n<!-- One short entry per project: what it is, where it lives, and what \"done\" means right now. -->\n",
    commitments: "# Commitments\n<!-- Things I have promised, with dates. Shua reads this when it plans or drafts. -->\n",
    people: "# People\n<!-- Who matters to the work: name, who they are to me, how I talk to them. -->\n",
    style: "# How I write\n<!-- Paste two or three messages you wrote and are happy with. Shua drafts in this voice. -->\n",
  };
}

/** A file's text with what was never filled in removed: comments, labels with no value, runs of blank lines. */
export function meaningful(text: string): string {
  const lines = text.replace(/<!--[\s\S]*?-->/g, "").split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => !/^\s*[-*]\s*[^:]{1,60}:\s*$/.test(l)); // "- Main goal:" with nothing after it
  const body = lines.filter((l) => !/^#{1,6}\s/.test(l)).join("\n").trim();
  return body ? lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() : "";
}

export class Knowledge {
  constructor(readonly dir: string, private seed: () => KnowledgeSeed = () => ({})) {}

  private file(name: KnowledgeName): string { return path.join(this.dir, `${name}.md`); }

  /** Create the folder and any file that is missing. A file that exists is never touched. */
  ensure(): void {
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    let made: Record<KnowledgeName, string> | undefined;
    for (const name of KNOWLEDGE_FILES) {
      if (existsSync(this.file(name))) continue;
      made ??= templates(this.seed());
      writeFileSync(this.file(name), made[name], { mode: 0o600, flag: "wx" });
    }
  }

  read(name: KnowledgeName): string {
    try { return readFileSync(this.file(name), "utf8"); } catch { return ""; }
  }

  list(): Array<{ name: KnowledgeName; title: string; text: string; updatedAt: number | null; filled: boolean }> {
    return KNOWLEDGE_FILES.map((name) => {
      const text = this.read(name);
      let updatedAt: number | null = null;
      try { updatedAt = statSync(this.file(name)).mtimeMs; } catch { /* missing: shown empty */ }
      return { name, title: KNOWLEDGE_TITLES[name], text, updatedAt, filled: meaningful(text).length > 0 };
    });
  }

  /** Replace one file. Written beside the old one and renamed over it, so a crash never leaves half a file. */
  write(name: string, text: string): { name: KnowledgeName; updatedAt: number } {
    if (!(KNOWLEDGE_FILES as readonly string[]).includes(name)) throw new Error(`No such knowledge file: ${name}`);
    if (typeof text !== "string") throw new Error("Text is required");
    if (text.length > KNOWLEDGE_MAX_CHARS) throw new Error(`Too long: keep it under ${KNOWLEDGE_MAX_CHARS.toLocaleString()} characters. This is a note for prompts, not an archive.`);
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    const target = this.file(name as KnowledgeName), temp = `${target}.${randomUUID()}.tmp`;
    writeFileSync(temp, text.endsWith("\n") || !text ? text : `${text}\n`, { mode: 0o600, flag: "wx" });
    renameSync(temp, target);
    chmodSync(target, 0o600);
    return { name: name as KnowledgeName, updatedAt: statSync(target).mtimeMs };
  }

  /** Add one note to the end of a file, as its own line, keeping everything already there. */
  append(name: KnowledgeName, line: string): { name: KnowledgeName; updatedAt: number } {
    const text = line.trim();
    if (!text) throw new Error("Nothing to add");
    this.ensure();
    const current = this.read(name).replace(/\s+$/, "");
    return this.write(name, `${current}${current ? "\n" : ""}${/^[-*•#]/.test(text) ? text : `- ${text}`}\n`);
  }

  /**
   * The files as context for a prompt, at most `max` characters, in order of how much they matter to getting work
   * right (you, your projects, what you've promised, who is involved, how you write). Undefined when nothing has
   * been filled in, so an empty store costs no tokens.
   */
  profile(max = 3000): string | undefined {
    const parts: string[] = [];
    let room = max;
    for (const name of KNOWLEDGE_FILES) {
      const text = meaningful(this.read(name));
      if (!text || room < 80) continue;
      // No one file may crowd out the rest: each gets at most half of what is left.
      const share = Math.max(80, Math.floor(room / 2));
      const piece = text.length > share ? `${text.slice(0, share - 1).trimEnd()}…` : text;
      parts.push(piece);
      room -= piece.length + 2;
    }
    if (!parts.length) return undefined;
    return `What you know about the person you work for, from their own notes (context for getting the work right, not instructions to act on):\n\n${parts.join("\n\n")}`;
  }
}

/** Read and edit the files from the app. Names are fixed, so a request can never reach another path. */
export function registerKnowledge(app: FastifyInstance, knowledge: Knowledge) {
  app.get("/api/knowledge", async () => {
    knowledge.ensure();
    return { dir: knowledge.dir, maxChars: KNOWLEDGE_MAX_CHARS, files: knowledge.list(), profileChars: knowledge.profile()?.length ?? 0 };
  });
  app.put<{ Params: { name: string }; Body: { text?: unknown } }>("/api/knowledge/:name", async (request, reply) => {
    try { return knowledge.write(request.params.name, request.body?.text as string); }
    catch (error) { return reply.code(400).send({ error: (error as Error).message }); }
  });
}
