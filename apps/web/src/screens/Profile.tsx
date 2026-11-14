import { useCallback, useEffect, useState } from "react";
import { since } from "@shuacrew/ui";
import { api } from "../lib/api";
import { PaneHeader, PaneLayout, PaneState } from "../components/Pane";
import "./profile.css";

interface KnowledgeFile { name: string; title: string; text: string; updatedAt: number | null; filled: boolean }
interface KnowledgeView { dir: string; maxChars: number; files: KnowledgeFile[]; profileChars: number }

/** What each file is for, in a line: the same intent as the hint inside the file, without making you read Markdown comments. */
const PURPOSE: Record<string, string> = {
  me: "Who you are, what you're aiming at, how you like to work.",
  projects: "What each project is, where it lives, and what done means right now.",
  commitments: "What you've promised, and by when.",
  people: "Who matters to the work, and how you talk to them.",
  style: "A few messages you wrote and like. Shua drafts in this voice.",
};

/**
 * About you: the plain files Shua and every session read (gateway/knowledge.ts). You are the only author. Each file
 * saves on its own, and what you haven't filled in is never sent to a model.
 */
export function Profile() {
  const [view, setView] = useState<KnowledgeView | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => api<KnowledgeView>("/api/knowledge").then((v) => { setView(v); setError(""); }, (e: Error) => setError(e.message)), []);
  useEffect(() => { void load(); }, [load]);

  if (error && !view) return <PaneLayout><PaneHeader title="About you" /><PaneState kind="error" title="Couldn't read your notes" detail={error} /></PaneLayout>;
  if (!view) return <PaneLayout><PaneHeader title="About you" /><PaneState kind="loading" title="Reading your notes" /></PaneLayout>;

  const filled = view.files.filter((f) => f.filled).length;
  return <PaneLayout>
    <PaneHeader title="About you" tone={filled ? "ok" : "idle"}
      status={filled ? `${filled} of ${view.files.length} filled in · read by Shua and by every session` : "Nothing filled in yet, so nothing is sent"}
      description={<>Plain files on this Mac, in <code>{view.dir.replace(/^\/Users\/[^/]+/, "~")}</code>. Edit them here or in any editor. Only what you write is used; empty labels and hints are left out.</>} />
    <div className="profile-files">
      {view.files.map((file) => <FileEditor key={file.name} file={file} maxChars={view.maxChars} onSaved={load} />)}
    </div>
  </PaneLayout>;
}

function FileEditor({ file, maxChars, onSaved }: { file: KnowledgeFile; maxChars: number; onSaved: () => Promise<void> | void }) {
  const [draft, setDraft] = useState(file.text);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // A file edited elsewhere (another window, an editor) replaces the draft only when you haven't changed it here.
  const [base, setBase] = useState(file.text);
  useEffect(() => { if (file.text !== base) { if (draft === base) setDraft(file.text); setBase(file.text); } }, [file.text]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = draft !== base, tooLong = draft.length > maxChars;
  const save = async () => {
    setSaving(true); setError("");
    try { await api(`/api/knowledge/${file.name}`, { method: "PUT", body: { text: draft } }); setBase(draft); await onSaved(); }
    catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };
  return <section className="profile-file" aria-labelledby={`profile-${file.name}`}>
    <header>
      <h2 id={`profile-${file.name}`}>{file.title}</h2>
      <p>{PURPOSE[file.name]}</p>
    </header>
    <textarea value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck rows={Math.min(18, Math.max(5, draft.split("\n").length + 1))} aria-label={file.title}
      onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); if (dirty && !tooLong) void save(); } }} />
    <footer>
      <span className={error || tooLong ? "is-bad" : ""} role={error ? "alert" : undefined}>
        {error || (tooLong ? `Too long by ${(draft.length - maxChars).toLocaleString()} characters` : dirty ? "Not saved" : file.updatedAt ? `Saved ${since(file.updatedAt)}` : "Empty")}
      </span>
      <button type="button" onClick={() => void save()} disabled={!dirty || saving || tooLong}>{saving ? "Saving…" : "Save"}</button>
    </footer>
  </section>;
}
