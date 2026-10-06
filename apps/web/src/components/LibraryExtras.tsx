/**
 * Library, the friendly parts: drop files anywhere to teach the crew, a "second brain" start when it's empty, and
 * asking Shua a question answered from your own library.
 */
import { useEffect, useRef, useState } from "react";
import { BrainCircuit, FolderOpen, NotebookPen, Sparkles, Upload } from "lucide-react";
import { api } from "../lib/api";
import { upload } from "../lib/attachments";
import { isMac, pickFolder } from "../lib/native";
import { post } from "../screens/spark/bridge";

/** Files dropped anywhere on the page become knowledge every agent can search. */
export function useDropToLearn() {
  const [over, setOver] = useState(false), [status, setStatus] = useState("");
  const depth = useRef(0);
  useEffect(() => { if (!status) return; const t = setTimeout(() => setStatus(""), 4000); return () => clearTimeout(t); }, [status]);
  const has = (e: React.DragEvent) => [...e.dataTransfer.types].includes("Files");
  const bind = {
    onDragEnter: (e: React.DragEvent) => { if (!has(e)) return; depth.current += 1; setOver(true); },
    onDragLeave: () => { depth.current = Math.max(0, depth.current - 1); if (!depth.current) setOver(false); },
    onDragOver: (e: React.DragEvent) => { if (has(e)) e.preventDefault(); },
    onDrop: (e: React.DragEvent) => {
      if (!has(e)) return;
      e.preventDefault(); depth.current = 0; setOver(false);
      const files = [...e.dataTransfer.files].slice(0, 20);
      setStatus(`Reading ${files.length} file${files.length === 1 ? "" : "s"}…`);
      void (async () => {
        let ok = 0;
        for (const f of files) { try { const done = await upload(f); await api("/api/library/knowledge", { body: { upload: done.id } }); ok += 1; } catch { /* the count says what landed */ } }
        setStatus(ok === files.length ? `Added ${ok} file${ok === 1 ? "" : "s"}: the crew can search ${ok === 1 ? "it" : "them"} now` : `Added ${ok} of ${files.length}; some files couldn't be read`);
      })();
    },
  };
  return { over, status, bind };
}

export function DropLayer({ over, status }: { over: boolean; status: string }) {
  return <>
    {over && <div className="lx-drop" aria-hidden><div><Upload size={28} /><strong>Drop to teach the crew</strong><span>Notes, docs, PDFs, decks. Every agent can search them.</span></div></div>}
    {status && <div className="lx-toast" role="status">{status}</div>}
  </>;
}

export function SecondBrain({ onWrite, onAdded }: { onWrite: () => void; onAdded: () => void }) {
  const [busy, setBusy] = useState(false);
  const folder = async () => {
    const path = await pickFolder(); if (!path) return;
    setBusy(true);
    try { await api("/api/library/knowledge", { body: { path } }); onAdded(); } finally { setBusy(false); }
  };
  return <section className="lx-brain" aria-label="Start your library">
    <div className="lx-brain-head"><i><BrainCircuit size={22} /></i><div><h2>Your second brain</h2><p>What you know and what the crew makes, in one place. Agents search it before they start, so nobody asks you twice.</p></div></div>
    <div className="lx-brain-ways">
      <button type="button" onClick={onWrite}><NotebookPen size={18} /><strong>Write a note</strong><small>Your pricing, your voice, how you like things done</small></button>
      <button type="button" disabled={!isMac() || busy} onClick={() => void folder()}><FolderOpen size={18} /><strong>{busy ? "Reading the folder…" : "Add a folder"}</strong><small>An Obsidian vault, docs, a project's notes</small></button>
      <div className="lx-brain-drop"><Upload size={18} /><strong>Drop files here</strong><small>Anywhere on this page, up to 20 at once</small></div>
    </div>
  </section>;
}

export function AskLibrary({ query }: { query: string }) {
  if (!query.trim()) return null;
  return <button type="button" className="lx-ask" onClick={() => post({ type: "shuaAsk", text: `Search my ShuaCrew library first (my knowledge and what the crew made), then answer from it, citing which item each fact came from: ${query.trim()}` })}>
    <Sparkles size={13} />Ask Shua
  </button>;
}
