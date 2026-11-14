import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fold, inbox } from "@shuacrew/core";
import { afterEach, expect, it } from "vitest";
import { Knowledge } from "./knowledge.js";
import { NOTES_PENDING_MAX, Notes } from "./notes.js";
import { EventStore } from "./store.js";
import { ToolServer } from "./toolserver.js";

const cleanups: Array<() => void> = [];
afterEach(() => { for (const c of cleanups.splice(0)) c(); });

function setup() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "shua-notes-"));
  const store = new EventStore(path.join(dir, "events.db"));
  cleanups.push(() => store.close());
  const knowledge = new Knowledge(path.join(dir, "knowledge"));
  knowledge.ensure();
  const state = () => fold(store.read(0));
  return { store, knowledge, state, notes: new Notes(store, state, knowledge) };
}

it("a suggestion changes no file: it waits in the Inbox until you answer", () => {
  const { notes, knowledge, state } = setup();
  const before = knowledge.read("projects");
  const { id } = notes.suggest({ file: "projects", text: "Harbor ships its widget on Friday.", why: "You said so today." }, "run_1");
  expect(knowledge.read("projects")).toBe(before);
  expect(inbox(state()).map((i) => [i.kind, i.title, i.detail, i.note?.text])).toEqual([["note", "Add to projects?", "You said so today.", "Harbor ships its widget on Friday."]]);

  notes.resolve(id!, false);
  expect(knowledge.read("projects")).toBe(before); // dismissed: still nothing written
  expect(inbox(state())).toEqual([]);
});

it("accepting adds the line to the end of the file, as you reworded it, and keeps what was there", () => {
  const { notes, knowledge, state } = setup();
  knowledge.write("commitments", "# Commitments\n- Send Dana the deck by Tuesday.\n");
  const a = notes.suggest({ file: "commitments", text: "Reply to the beta testers by Nov 20." });
  notes.resolve(a.id!, true);
  expect(knowledge.read("commitments")).toBe("# Commitments\n- Send Dana the deck by Tuesday.\n- Reply to the beta testers by Nov 20.\n");

  const b = notes.suggest({ file: "commitments", text: "Ship v2 soon." });
  notes.resolve(b.id!, true, "  Ship v2 by Dec 1.  ");
  expect(knowledge.read("commitments").trimEnd().split("\n").at(-1)).toBe("- Ship v2 by Dec 1.");
  expect(knowledge.profile()).toContain("Ship v2 by Dec 1."); // and from now on every session reads it
  expect(state().suggestions).toEqual({});
  expect(() => notes.resolve(b.id!, true)).toThrow(/No such suggestion/); // answered once
});

it("refuses what should never be a note: secrets, essays, unknown files, nothing at all", () => {
  const { notes, state } = setup();
  expect(() => notes.suggest({ file: "me", text: `My key is ${"sk-ant-" + "api03-"}AbCdEfGhIjKlMnOpQrStUvWxYz0123456789` })).toThrow(/secret/);
  expect(() => notes.suggest({ file: "me", text: "x".repeat(401) })).toThrow(/Too long/);
  expect(() => notes.suggest({ file: "../../etc/passwd", text: "hi" })).toThrow(/file must be one of/);
  expect(() => notes.suggest({ file: "me", text: "   " })).toThrow(/text is required/);
  expect(state().suggestions ?? {}).toEqual({});
});

it("never suggests the same thing twice, or something the file already says", () => {
  const { notes, knowledge, state } = setup();
  knowledge.write("people", "# People\n- Dana runs design at Harbor.\n");
  expect(notes.suggest({ file: "people", text: "dana runs design at Harbor" }).message).toMatch(/Already in people/);
  const first = notes.suggest({ file: "people", text: "Lee reviews every release." });
  expect(notes.suggest({ file: "people", text: "- Lee reviews every release" })).toEqual({ id: first.id, message: "Already suggested and waiting for an answer." });
  expect(Object.keys(state().suggestions ?? {})).toHaveLength(1);
});

it("holds a bounded number of unanswered suggestions, so a runaway agent cannot bury the Inbox", () => {
  const { notes } = setup();
  for (let i = 0; i < NOTES_PENDING_MAX; i++) notes.suggest({ file: "me", text: `Fact number ${i}` });
  expect(() => notes.suggest({ file: "me", text: "One more" })).toThrow(/already waiting/);
});

it("is offered to agents as a tool only once notes are attached, and records which session suggested it", async () => {
  const { notes, store, state } = setup();
  const tools = new ToolServer({} as never, state);
  const list = async () => ((await tools.handle({ jsonrpc: "2.0", id: 1, method: "tools/list" }, "run_7")) as { result: { tools: Array<{ name: string }> } }).result.tools.map((t) => t.name);
  expect(await list()).not.toContain("suggest_note");
  tools.notes = notes;
  expect(await list()).toContain("suggest_note");

  store.append("run.created", { title: "Plan the launch", ask: "Plan it", runtime: "claude" }, { run: "run_7" });
  const reply = (await tools.handle({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "suggest_note", arguments: { file: "projects", text: "Launch day is Dec 4." } } }, "run_7")) as { result: { content: Array<{ text: string }>; isError?: boolean } };
  expect(reply.result.isError).toBeUndefined();
  expect(reply.result.content[0]!.text).toMatch(/only if the user accepts/);
  expect(Object.values(state().suggestions ?? {})).toMatchObject([{ file: "projects", text: "Launch day is Dec 4.", run: "run_7" }]);
});
