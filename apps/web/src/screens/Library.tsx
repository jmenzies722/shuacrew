import "./library-extra.css";
import type { ArtifactView, KnowledgeView } from "@shuacrew/core/projections";
import { Button } from "@shuacrew/ui";
import { useNavigate } from "@tanstack/react-router";
import { BookMarked, Code2, Copy, Database, Download, FileText, FolderOpen, Globe, Image, NotebookPen, Package, Plus, Search, Trash2, Upload, X, LibraryBig } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Markdown } from "../components/Markdown";
import { api } from "../lib/api";
import { upload } from "../lib/attachments";
import { KIND } from "../lib/kinds";
import { PublishButton } from "../components/Publish";
import { SendMenu } from "../components/SendMenu";
import { useLive } from "../lib/live";
import { recentlyPlayed } from "../lib/studio";
import { isMac, pickFolder } from "../lib/native";
import { AskLibrary, DropLayer, SecondBrain, useDropToLearn } from "../components/LibraryExtras";
import "./library-extras.css";
import { Glyph } from "../lib/glyphs";
import { PaneHeader } from "../components/Pane";
import { StatStrip } from "../components/StatStrip";
import "../components/studio-desk.css";

type Kind = ArtifactView["kind"];
interface Hit {
  id: string;
  type: "artifact" | "knowledge";
  title: string;
  where: string;
  snippet: string;
}


const ago = (at: number) => {
  const s = (Date.now() - at) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};
const bytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** Everything the crew made, and everything you gave it to know — one place, one search. */
export function Library() {
  const artifacts = useLive((s) => s.crew.artifacts);
  const knowledge = useLive((s) => s.crew.knowledge);
  const [tab, setTab] = useState<"made" | "known">("made");
  const [kind, setKind] = useState<Kind | "all">("all");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [open, setOpen] = useState<{ type: "artifact" | "knowledge"; id: string; file?: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const drop = useDropToLearn();

  const made = useMemo(() => Object.values(artifacts).sort((a, b) => b.updatedAt - a.updatedAt), [artifacts]);
  const crate = useMemo(() => recentlyPlayed(made, Date.now(), 8), [made]);
  const known = useMemo(() => Object.values(knowledge).sort((a, b) => b.addedAt - a.addedAt), [knowledge]);
  const shown = kind === "all" ? made : made.filter((a) => a.kind === kind);

  // Deep link from a chat card: /library#a_123
  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id.startsWith("a_")) setOpen({ type: "artifact", id });
  }, []);

  useEffect(() => {
    if (!query.trim()) return setHits(null);
    const t = setTimeout(() => void api<Hit[]>(`/api/library/search?q=${encodeURIComponent(query)}`).then(setHits).catch(() => setHits([])), 180);
    return () => clearTimeout(t);
  }, [query, artifacts, knowledge]);

  const empty = !Object.keys(artifacts).length && !Object.keys(knowledge).length;
  return (
    <div className="h-full overflow-y-auto relative" {...drop.bind}>
      <DropLayer over={drop.over} status={drop.status} />
      <div className="mx-auto max-w-[1440px] px-8 pb-12 pt-8">
        <PaneHeader {...(() => { const made = Object.keys(artifacts).length, known = Object.keys(knowledge).length; return made + known ? { status: `${made} made by the crew · ${known} you gave it to know`, tone: "ok" as const } : { status: "Empty for now. Everything the crew makes, and anything you add, lands here.", tone: "idle" as const }; })()} children={<StatStrip stats={[{ value: Object.keys(artifacts).length, label: "made by the crew" }, { value: Object.keys(knowledge).length, label: "in your knowledge" }, { value: Object.values(artifacts).filter((a) => a.createdAt > Date.now() - 7 * 86_400_000).length, label: "saved this week", tone: "ok" }]} />} eyebrow="Your collected work" icon={LibraryBig} title="Library" description="What the crew made, and what you gave it to know. Agents search it before they start and save their deliverables here."
          actions={<Button onClick={() => setAdding(true)}><Plus size={14} /> Add knowledge</Button>} />

        <label className="lib-search">
          <Search size={15} className="text-fg-3" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search everything — reports, pages, your notes and docs…" aria-label="Search the library" />
          <AskLibrary query={query} />
          {query && (
            <button onClick={() => setQuery("")} className="member-icon" aria-label="Clear search">
              <X size={13} />
            </button>
          )}
        </label>

        {empty && !hits && <SecondBrain onWrite={() => setAdding(true)} onAdded={() => undefined} />}
        {hits ? (
          <SearchResults hits={hits} onOpen={(h) => setOpen({ type: h.type, id: h.id, file: h.type === "knowledge" && h.where !== "note" ? h.where : undefined })} />
        ) : empty ? null : (
          <>
            <div className="mb-4 mt-5 flex flex-wrap items-center gap-2">
              <div className="seg" role="tablist">
                <button role="tab" aria-selected={tab === "made"} className={tab === "made" ? "is-on" : ""} onClick={() => setTab("made")}>
                  Made by the crew <span className="seg-count">{made.length}</span>
                </button>
                <button role="tab" aria-selected={tab === "known"} className={tab === "known" ? "is-on" : ""} onClick={() => setTab("known")}>
                  Your knowledge <span className="seg-count">{known.length}</span>
                </button>
              </div>
              {tab === "made" && made.length > 0 && (
                <div className="ml-auto flex flex-wrap gap-1.5">
                  {(["all", ...Object.keys(KIND)] as Array<Kind | "all">)
                    .filter((k) => k === "all" || made.some((a) => a.kind === k))
                    .map((k) => (
                      <button key={k} onClick={() => setKind(k)} className={`lib-filter ${kind === k ? "is-on" : ""}`}>
                        {k === "all" ? "All" : KIND[k].label}
                      </button>
                    ))}
                </div>
              )}
            </div>
            {tab === "made" && crate.length > 0 && !query && shown.length > 9 && (
              <div className="lib-crate" aria-label="Recently played">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[.14em] text-amber">Recently played</div>
                <div className="sd-crate">
                  {crate.map((a) => {
                    const K = KIND[a.kind];
                    return <button key={a.id} type="button" className="sd-sleeve-card" onClick={() => setOpen({ type: "artifact", id: a.id })}>
                      <span className="sd-cover" style={{ "--c": K.tone } as React.CSSProperties}>{a.kind === "image" ? <img src={`/api/library/artifacts/${a.id}/raw`} alt="" /> : <K.icon size={26} strokeWidth={1.6} />}</span>
                      <b>{a.title}</b>
                    </button>;
                  })}
                </div>
              </div>
            )}
            {tab === "made" ? (
              shown.length ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3.5">
                  <AnimatePresence initial={false}>
                    {shown.map((a) => (
                      <motion.div key={a.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}>
                        <ArtifactCard artifact={a} onOpen={() => setOpen({ type: "artifact", id: a.id })} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              ) : (
                <Empty icon={BookMarked} title="Nothing made yet" body="When a crew member writes a report, a spec, a landing page or copy, it's saved here — versioned, searchable, and linked to the session that made it." />
              )
            ) : known.length ? (
              <div className="flex flex-col gap-2">
                {known.map((k) => (
                  <SourceRow key={k.id} source={k} onOpen={() => setOpen({ type: "knowledge", id: k.id })} />
                ))}
              </div>
            ) : (
              <Empty icon={NotebookPen} title="Teach the crew what you know" body="Add your notes, a folder of docs, research or a pitch deck's text. Every agent can search it, so nobody asks you twice." action={<Button variant="primary" onClick={() => setAdding(true)}><Plus size={14} /> Add knowledge</Button>} />
            )}
          </>
        )}
      </div>
      <AnimatePresence>{open && <Viewer key={`${open.type}:${open.id}:${open.file ?? ""}`} target={open} onClose={() => (setOpen(null), history.replaceState(null, "", location.pathname))} />}</AnimatePresence>
      {adding && <AddKnowledge onClose={() => setAdding(false)} onAdded={() => (setAdding(false), setTab("known"))} />}
    </div>
  );
}

function ArtifactCard({ artifact: a, onOpen }: { artifact: ArtifactView; onOpen: () => void }) {
  const member = useLive((s) => (a.member ? s.crew.members[a.member] : undefined));
  const K = KIND[a.kind];
  return (
    <button onClick={onOpen} className="art-card" style={{ "--kind": K.tone } as React.CSSProperties}>
      <div className="art-thumb">
        {a.kind === "image" ? <img src={`/api/library/artifacts/${a.id}/raw`} alt="" loading="lazy" />
          : a.summary ? <div className="art-paper" aria-hidden="true"><b>{a.title}</b><p>{a.summary}</p></div>
          : <K.icon size={26} strokeWidth={1.6} />}
        <span className="art-kind">{K.label}</span>
        {a.version > 1 && <span className="art-version">v{a.version}</span>}
      </div>
      <div className="min-w-0 p-3.5 text-left">
        <div className="line-clamp-2 text-[14px] font-semibold leading-snug text-fg">{a.title}</div>
        {a.summary && <div className="mt-1 line-clamp-2 text-[12px] leading-snug text-fg-3">{a.summary}</div>}
        <div className="mt-2.5 flex items-center gap-2 text-[11.5px] text-fg-3">
          {member ? (
            <span className="member-chip" style={{ "--member": member.color } as React.CSSProperties}>
              <Glyph name={member.emoji} fallback={member.id} label={member.name} size={11} />
              {member.name}
            </span>
          ) : (
            <span>{a.by === "you" ? "You" : "Agent"}</span>
          )}
          <span className="ml-auto">{ago(a.updatedAt)}</span>
        </div>
      </div>
    </button>
  );
}

function SourceRow({ source: k, onOpen }: { source: KnowledgeView; onOpen: () => void }) {
  const Icon = k.source === "folder" ? FolderOpen : k.source === "note" ? NotebookPen : FileText;
  return (
    <div className="lib-row">
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[var(--amber-soft)] text-amber">
          <Icon size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold text-fg">{k.title}</span>
          <span className="mono block truncate text-[11px] text-fg-3">{k.origin ?? "note"}</span>
        </span>
        <span className="hidden shrink-0 text-right text-[11.5px] text-fg-3 sm:block">
          {k.source === "folder" ? `${k.files} files · ` : ""}
          {k.chunks} passages · {bytes(k.size)}
          <br />
          added {ago(k.addedAt)}
        </span>
      </button>
      <button className="member-icon" title="Remove from the library" aria-label={`Remove ${k.title}`} onClick={() => void api(`/api/library/knowledge/${k.id}`, { method: "DELETE" })}>
        <Trash2 size={13} />
      </button>
    </div>
  );
}

function SearchResults({ hits, onOpen }: { hits: Hit[]; onOpen: (h: Hit) => void }) {
  if (!hits.length) return <div className="mt-10 text-center text-[13px] text-fg-3">Nothing in the library matches that.</div>;
  return (
    <div className="mt-4 flex flex-col gap-2">
      {hits.map((h) => (
        <button key={`${h.id}:${h.where}`} onClick={() => onOpen(h)} className="lib-hit">
          <div className="flex items-center gap-2 text-[11.5px] text-fg-3">
            <span className={`lib-badge ${h.type === "artifact" ? "is-made" : ""}`}>{h.type === "artifact" ? "Made" : "Knowledge"}</span>
            <span className="truncate text-[13.5px] font-semibold text-fg">{h.title}</span>
            {h.where && h.where !== "note" && <span className="mono truncate">{h.where}</span>}
          </div>
          <div className="mt-1.5 text-[12.5px] leading-relaxed text-fg-2">
            {h.snippet.split(/(«[^»]*»)/).map((part, i) => (part.startsWith("«") ? <mark key={i}>{part.slice(1, -1)}</mark> : <span key={i}>{part}</span>))}
          </div>
        </button>
      ))}
    </div>
  );
}

function Viewer({ target, onClose }: { target: { type: "artifact" | "knowledge"; id: string; file?: string }; onClose: () => void }) {
  const navigate = useNavigate();
  const artifact = useLive((s) => (target.type === "artifact" ? s.crew.artifacts[target.id] : undefined));
  const source = useLive((s) => (target.type === "knowledge" ? s.crew.knowledge[target.id] : undefined));
  const member = useLive((s) => (artifact?.member ? s.crew.members[artifact.member] : undefined));
  const [version, setVersion] = useState<number | undefined>();
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const v = version ?? artifact?.version;

  useEffect(() => {
    const close = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  useEffect(() => {
    setText(null);
    setError("");
    if (target.type === "artifact") {
      if (!artifact || artifact.kind === "image" || artifact.kind === "file") return;
      void api<{ text: string }>(`/api/library/artifacts/${target.id}/text?v=${v}`).then((r) => setText(r.text), (e: Error) => setError(e.message));
    } else {
      void api<{ text: string }>(`/api/library/knowledge/${target.id}${target.file ? `?file=${encodeURIComponent(target.file)}` : ""}`).then((r) => setText(r.text), (e: Error) => setError(e.message));
    }
  }, [target.id, target.file, v, artifact?.kind]);

  const title = artifact?.title ?? source?.title ?? "Not found";
  const raw = artifact ? `/api/library/artifacts/${artifact.id}/raw?v=${v}` : "";
  const ext = artifact?.file.split(".").pop() ?? "";
  return (
    <motion.div className="fixed inset-0 z-50 flex justify-end bg-black/35 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="lib-viewer"
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 38 }}
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[11.5px] text-fg-3">
              {artifact ? <span className="lib-badge is-made">{KIND[artifact.kind].label}</span> : <span className="lib-badge">Knowledge</span>}
              {member && (
                <span className="member-chip" style={{ "--member": member.color } as React.CSSProperties}>
                  <Glyph name={member.emoji} fallback={member.id} label={member.name} size={11} />
                  {member.name}
                </span>
              )}
              {artifact && <span className="mono truncate">{artifact.file}</span>}
              {target.file && <span className="mono truncate">{target.file}</span>}
            </div>
            <h2 className="mt-1.5 text-[18px] font-semibold leading-snug tracking-[-0.01em]">{title}</h2>
            {artifact?.summary && <p className="mt-1 text-[12.5px] leading-relaxed text-fg-2">{artifact.summary}</p>}
          </div>
          <button onClick={onClose} className="member-icon" aria-label="Close">
            <X size={15} />
          </button>
        </header>
        {artifact && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-5 py-2.5">
            {artifact.version > 1 && (
              <select value={v} onChange={(e) => setVersion(Number(e.target.value))} className="lib-select" aria-label="Version">
                {Array.from({ length: artifact.version }, (_, i) => artifact.version - i).map((n) => (
                  <option key={n} value={n}>
                    v{n}
                    {n === artifact.version ? " · latest" : ""}
                  </option>
                ))}
              </select>
            )}
            {artifact.run && (
              <Button size="s" variant="ghost" onClick={() => navigate({ to: "/sessions/$id", params: { id: artifact.run! } })}>
                Open session
              </Button>
            )}
            <span className="flex-1" />
            {text !== null && artifact.kind === "doc" && <SendMenu title={artifact.title} text={text} />}
            {text !== null && (
              <Button size="s" variant="ghost" onClick={() => void navigator.clipboard.writeText(text).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1400)))}>
                <Copy size={13} /> {copied ? "Copied" : "Copy"}
              </Button>
            )}
            <a className="lib-link" href={`${raw}&download=1`} download={artifact.file}>
              <Download size={13} /> Download
            </a>
            {artifact.kind === "page" && (
              <a className="lib-link" href={raw} target="_blank" rel="noreferrer">
                <Globe size={13} /> Preview
              </a>
            )}
            {artifact.kind === "page" && <PublishButton artifact={artifact.id} version={artifact.version} />}
            {confirm ? (
              <Button size="s" variant="danger" onClick={() => void api(`/api/library/artifacts/${artifact.id}`, { method: "DELETE" }).then(onClose)}>
                Delete all versions?
              </Button>
            ) : (
              <Button size="s" variant="ghost" onClick={() => setConfirm(true)} title="Delete">
                <Trash2 size={13} />
              </Button>
            )}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {error ? (
            <div className="p-6 text-[13px] text-bad">{error}</div>
          ) : !artifact && !source ? (
            <div className="p-6 text-[13px] text-fg-3">This item was removed.</div>
          ) : artifact?.kind === "page" ? (
            <iframe title={title} src={raw} sandbox="allow-scripts" className="h-full min-h-[70vh] w-full bg-white" />
          ) : artifact?.kind === "image" ? (
            <div className="grid place-items-center p-6">
              <img src={raw} alt={title} className="max-h-[75vh] rounded-[10px]" />
            </div>
          ) : artifact?.kind === "file" ? (
            <div className="p-6 text-[13px] text-fg-3">No preview for this file type — download it to open it.</div>
          ) : text === null ? (
            <div className="p-6 text-[13px] text-fg-3">
              <span className="shimmer-text">Loading…</span>
            </div>
          ) : artifact && artifact.kind !== "doc" ? (
            <div className="prose-agent p-5">
              <Markdown text={`\`\`\`${ext}\n${text}\n\`\`\``} />
            </div>
          ) : (
            <div className="prose-agent px-6 py-5">
              <Markdown text={text} />
            </div>
          )}
        </div>
      </motion.aside>
    </motion.div>
  );
}

function AddKnowledge({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [mode, setMode] = useState<"files" | "folder" | "note">("files");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [folder, setFolder] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const picker = useRef<HTMLInputElement>(null);

  const run = async (work: () => Promise<unknown>, label: string) => {
    setBusy(label);
    setError("");
    try {
      await work();
      onAdded();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const addFiles = (files: FileList) =>
    run(async () => {
      for (const file of Array.from(files)) {
        const done = await upload(file);
        await api("/api/library/knowledge", { body: { upload: done.id, title: files.length === 1 && title ? title : undefined } });
      }
    }, `Reading ${files.length} file${files.length === 1 ? "" : "s"}…`);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label="Add knowledge">
      <motion.div initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="w-[560px] max-w-full rounded-[16px] border border-line-strong bg-panel p-5 shadow-[0_30px_90px_rgba(0,0,0,.45)]">
        <div className="mb-1 text-[16px] font-semibold">Add knowledge</div>
        <p className="mb-4 text-[12.5px] text-fg-3">Its text is copied into the library's search index. Secrets and protected folders are refused.</p>
        <div className="seg mb-4" role="tablist">
          {(
            [
              ["files", "Files", Upload],
              ["folder", "Folder", FolderOpen],
              ["note", "Note", NotebookPen],
            ] as const
          ).map(([m, label, Icon]) => (
            <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? "is-on" : ""} onClick={() => setMode(m)}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
        {mode !== "folder" && (
          <label className="field mb-3">
            <span>Title {mode === "files" ? "(optional)" : ""}</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={mode === "note" ? "Pricing thoughts" : "Defaults to the file name"} />
          </label>
        )}
        {mode === "files" && (
          <>
            <input ref={picker} type="file" multiple hidden accept=".md,.txt,.pdf,.docx,.doc,.rtf,.html,.csv,.json,.pages,.markdown" onChange={(e) => e.target.files?.length && void addFiles(e.target.files)} />
            <button className="lib-drop" onClick={() => picker.current?.click()} disabled={Boolean(busy)}>
              <Upload size={20} />
              <span className="text-[13.5px] font-medium text-fg">{busy || "Choose files"}</span>
              <span className="text-[11.5px] text-fg-3">Markdown, text, Word, Pages, RTF, HTML, CSV, JSON — PDFs with poppler installed</span>
            </button>
          </>
        )}
        {mode === "folder" && (
          <>
            <label className="field">
              <span>Folder</span>
              <div className="flex gap-2">
                <input className="mono flex-1" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="~/Documents/my-startup" />
                {isMac() && (
                  <Button variant="ghost" onClick={() => void pickFolder().then((p) => p && setFolder(p))}>
                    Choose…
                  </Button>
                )}
              </div>
            </label>
            <p className="mt-2 text-[11.5px] text-fg-3">Text files, docs and notes inside it (up to 3,000). Skips node_modules, .git, build output and dotfiles.</p>
          </>
        )}
        {mode === "note" && (
          <label className="field">
            <span>Note</span>
            <textarea rows={8} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What the crew should know — your idea, customers, constraints, voice…" />
          </label>
        )}
        {error && <div className="mt-3 text-[12px] text-bad">{error}</div>}
        <div className="mt-5 flex items-center gap-2">
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {mode === "folder" && (
            <Button variant="primary" disabled={!folder.trim() || Boolean(busy)} onClick={() => void run(() => api("/api/library/knowledge", { body: { path: folder.trim() } }), "Indexing…")}>
              {busy || "Add folder"}
            </Button>
          )}
          {mode === "note" && (
            <Button variant="primary" disabled={!note.trim() || Boolean(busy)} onClick={() => void run(() => api("/api/library/knowledge", { body: { note, title } }), "Saving…")}>
              {busy || "Save note"}
            </Button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function Empty({ icon: Icon, title, body, action }: { icon: typeof FileText; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="crew-cta flex flex-col items-center py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--amber-soft)] text-amber">
        <Icon size={22} />
      </span>
      <div className="mt-4 text-[16px] font-semibold">{title}</div>
      <p className="mt-1.5 max-w-[460px] text-[13px] leading-relaxed text-fg-3">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
