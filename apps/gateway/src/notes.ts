/**
 * Suggested notes: how what Shua learns about you reaches your knowledge files (knowledge.ts) without a model ever
 * writing to them. An agent may only suggest: one short line, for one file, with a reason. The suggestion waits in
 * your Inbox (core/inbox.ts); the file changes only when you accept it, and you can reword it first.
 *
 * That split matters because the files are read by every session: a line written there by a model that had just read
 * a hostile web page would be an instruction to all of them. So a suggestion is bounded, may not look like a secret,
 * is never a duplicate, and at most NOTES_PENDING_MAX wait at once.
 */
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { redact, type CrewState } from "@shuacrew/core";
import { KNOWLEDGE_FILES, type Knowledge, type KnowledgeName } from "./knowledge.js";
import type { EventStore } from "./store.js";

export const NOTE_MAX_CHARS = 400;
export const NOTES_PENDING_MAX = 20;

const same = (a: string, b: string) => squash(a) === squash(b);
const squash = (s: string) => s.toLowerCase().replace(/^[\s\-*•]+/, "").replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();

export class Notes {
  constructor(private store: Pick<EventStore, "append">, private state: () => CrewState, private knowledge: Knowledge) {}

  /** Record a suggestion. Returns what happened in a sentence, for the agent that asked. */
  suggest(input: { file?: unknown; text?: unknown; why?: unknown }, run?: string | null): { id?: string; message: string } {
    const file = String(input.file ?? "");
    if (!(KNOWLEDGE_FILES as readonly string[]).includes(file)) throw new Error(`file must be one of: ${KNOWLEDGE_FILES.join(", ")}`);
    const text = typeof input.text === "string" ? input.text.trim() : "";
    if (!text) throw new Error("text is required: the one line to add");
    if (text.length > NOTE_MAX_CHARS) throw new Error(`Too long: a note is one or two lines, under ${NOTE_MAX_CHARS} characters. Suggest the fact, not the story.`);
    if (redact(text) !== text) throw new Error("That looks like it contains a secret (a key, token or password). Secrets are never kept in notes.");
    const why = typeof input.why === "string" ? input.why.trim().replace(/\s+/g, " ").slice(0, 200) : "";
    if (this.knowledge.read(file as KnowledgeName).split("\n").some((line) => same(line, text))) return { message: `Already in ${file}: nothing to add.` };
    const pending = Object.values(this.state().suggestions ?? {});
    const twin = pending.find((n) => n.file === file && same(n.text, text));
    if (twin) return { id: twin.id, message: "Already suggested and waiting for an answer." };
    if (pending.length >= NOTES_PENDING_MAX) throw new Error(`${NOTES_PENDING_MAX} suggested notes are already waiting for an answer. Suggest more once those are answered.`);
    const id = `note_${randomUUID().slice(0, 8)}`;
    this.store.append("note.suggested", { id, file, text, why }, { run: run ?? null });
    return { id, message: `Suggested for ${file}. It is added only if the user accepts it in their Inbox.` };
  }

  /** Your answer. Accepting adds the line (as you reworded it, if you did) to the file; dismissing adds nothing. */
  resolve(id: string, accepted: boolean, reworded?: string): { id: string; accepted: boolean; file: string } {
    const note = this.state().suggestions?.[id];
    if (!note) throw new Error("No such suggestion: it may already have been answered.");
    if (accepted) {
      const text = (typeof reworded === "string" && reworded.trim() ? reworded : note.text).trim();
      this.knowledge.append(note.file as KnowledgeName, text);
    }
    this.store.append("note.resolved", { id, accepted }, { run: note.run });
    return { id, accepted, file: note.file };
  }
}

export function registerNotes(app: FastifyInstance, notes: Notes) {
  // Suggesting is open to anything that can reach the gateway (a routine's curl, Shua's tool); it changes no file.
  app.post<{ Body: { file?: unknown; text?: unknown; why?: unknown; run?: unknown } }>("/api/notes", async (request, reply) => {
    try { return notes.suggest(request.body ?? {}, typeof request.body?.run === "string" ? request.body.run : null); }
    catch (error) { return reply.code(400).send({ error: (error as Error).message }); }
  });
  app.post<{ Params: { id: string }; Body: { accept?: unknown; text?: unknown } }>("/api/notes/:id", async (request, reply) => {
    if (typeof request.body?.accept !== "boolean") return reply.code(400).send({ error: "accept must be true or false" });
    try { return notes.resolve(request.params.id, request.body.accept, typeof request.body.text === "string" ? request.body.text : undefined); }
    catch (error) { return reply.code(/No such/.test((error as Error).message) ? 404 : 400).send({ error: (error as Error).message }); }
  });
}
