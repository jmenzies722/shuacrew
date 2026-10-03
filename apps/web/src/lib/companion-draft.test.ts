import { afterEach, expect, it, vi } from "vitest";
import { acceptCompanionDraft, clearCompanionDraft, getCompanionDraft, getCompanionDraftRevision, restoreCompanionDraft, setCompanionDraft, subscribeCompanionDraft } from "./companion-draft";

afterEach(() => { setCompanionDraft(""); vi.unstubAllGlobals(); });

it("keeps one draft available when a conversation surface remounts", () => {
  setCompanionDraft("A question with\nmultiple lines");
  expect(getCompanionDraft()).toBe("A question with\nmultiple lines");
});

it("preserves a newer draft when an earlier submission finishes", () => {
  setCompanionDraft("First question");
  const revision = getCompanionDraftRevision();
  setCompanionDraft("Next question");
  clearCompanionDraft("First question", revision);
  expect(getCompanionDraft()).toBe("Next question");
});

it("clears the submitted draft without clearing another surface's edit", () => {
  setCompanionDraft("Send this");
  clearCompanionDraft("Send this", getCompanionDraftRevision());
  expect(getCompanionDraft()).toBe("");
  setCompanionDraft("Keep this");
  setCompanionDraft(current => `${current}\nAnd this`);
  expect(getCompanionDraft()).toBe("Keep this\nAnd this");
});

it("preserves a retyped draft even when its text matches the pending submission", () => {
  setCompanionDraft("Repeat this");
  const revision = getCompanionDraftRevision();
  setCompanionDraft("");
  setCompanionDraft("Repeat this");
  clearCompanionDraft("Repeat this", revision);
  expect(getCompanionDraft()).toBe("Repeat this");
});

it("keeps a failed voice request available for editing", () => {
  const revision = getCompanionDraftRevision();
  restoreCompanionDraft("Please explain that", revision);
  expect(getCompanionDraft()).toBe("Please explain that");
});

it("does not undo intentional deletion after a failed request", () => {
  setCompanionDraft("Delete my draft");
  const revision = getCompanionDraftRevision();
  setCompanionDraft("");
  restoreCompanionDraft("Delete my draft", revision);
  expect(getCompanionDraft()).toBe("");
});

function browserStorage() {
  const values = new Map<string, string>();
  let writable = true;
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { if (!writable) throw new Error("Quota exceeded"); values.set(key, value); },
  };
  const window = Object.assign(new EventTarget(), { localStorage });
  vi.stubGlobal("window", window);
  return { window, localStorage, failWrites: () => { writable = false; } };
}

it("retains new edits when storage can be read but cannot be written", () => {
  const storage = browserStorage();
  setCompanionDraft("Saved draft");
  storage.failWrites();
  setCompanionDraft("New unsaved edit");
  const revision = getCompanionDraftRevision();
  expect(getCompanionDraft()).toBe("New unsaved edit");
  setCompanionDraft(current => `${current}\nStill editing`);
  clearCompanionDraft("New unsaved edit", revision);
  expect(getCompanionDraft()).toBe("New unsaved edit\nStill editing");
});

it("follows another window's draft and protects it from an older completion", () => {
  const storage = browserStorage();
  setCompanionDraft("Earlier submission");
  const revision = getCompanionDraftRevision();
  const unsubscribe = subscribeCompanionDraft(() => {});
  storage.localStorage.setItem("shuacrew.companionDraft", JSON.stringify({ text: "Other window's edit", revision: "external-edit" }));
  storage.window.dispatchEvent(Object.assign(new Event("storage"), { key: "shuacrew.companionDraft" }));
  expect(getCompanionDraft()).toBe("Other window's edit");
  clearCompanionDraft("Earlier submission", revision);
  expect(getCompanionDraft()).toBe("Other window's edit");
  unsubscribe();
});
it("acknowledges immediately and restores a failed submission without overwriting later edits", () => {
  browserStorage();
  setCompanionDraft("Explain queues");
  const revision = acceptCompanionDraft("Explain queues");
  expect(getCompanionDraft()).toBe("");
  restoreCompanionDraft("Explain queues", revision);
  expect(getCompanionDraft()).toBe("Explain queues");
  const next = acceptCompanionDraft("Explain queues");
  setCompanionDraft("New question");
  restoreCompanionDraft("Explain queues", next);
  expect(getCompanionDraft()).toBe("New question");
});
