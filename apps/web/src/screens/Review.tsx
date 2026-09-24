import { Button, Chip, Eyebrow, Kbd, StatusGlyph, StatusPill } from "@shuacrew/ui";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useLive } from "../lib/live";

const MergeView = lazy(() => import("../components/MergeView"));

interface DiffFile {
  path: string;
  change: string;
  before: string;
  after: string;
}

interface Comment {
  file: string;
  line: number;
  text: string;
}

/**
 * The review cockpit: every file the run changed, side by side. Comment on any line and the
 * comments go back to the agent as one follow-up turn. Approve → the merge queue; reject → say what
 * it should learn.
 */
export function Review() {
  const { id } = useParams({ from: "/review/$id" });
  const run = useLive((s) => s.crew.runs[id]);
  const navigate = useNavigate();
  const [diff, setDiff] = useState<{ base: string; branch: string; files: DiffFile[] } | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(0);
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState<{ line: number; text: string } | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [lesson, setLesson] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    api<{ base: string; branch: string; files: DiffFile[] }>(`/api/runs/${id}/diff`)
      .then((d) => (setDiff(d), setError("")))
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    void load();
  }, [id, run?.lastSeq === undefined ? 0 : run.turns]);

  const file = diff?.files[selected];
  const stats = useMemo(() => (diff?.files ?? []).map((f) => lineStats(f.before, f.after)), [diff]);

  const send = async () => {
    setBusy(true);
    try {
      await api(`/api/runs/${id}/comments`, { body: { comments } });
      setComments([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const decide = async (approve: boolean) => {
    setBusy(true);
    try {
      await api(`/api/runs/${id}/review`, { body: { approve, lesson: approve ? undefined : lesson } });
      navigate({ to: "/runs/$id", params: { id } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      if (event.key === "j") setSelected((i) => Math.min((diff?.files.length ?? 1) - 1, i + 1));
      if (event.key === "k") setSelected((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [diff]);

  return (
    <div className="grid h-full grid-cols-[260px_minmax(0,1fr)_300px] grid-rows-[auto_1fr] max-[1100px]:grid-cols-[220px_minmax(0,1fr)]">
      <header className="col-span-3 flex items-center gap-3 border-b border-line bg-panel px-5 py-3.5 max-[1100px]:col-span-2">
        <div className="min-w-0">
          <div className="text-[11.5px] text-fg-3">
            <Link to="/runs/$id" params={{ id }} className="hover:text-fg-2">
              {run?.title ?? id}
            </Link>{" "}
            · review
          </div>
          <h1 className="mt-0.5 flex items-center gap-2 text-[16px] font-semibold">
            {diff ? `${diff.files.length} file${diff.files.length === 1 ? "" : "s"} changed` : "Loading changes…"}
            {diff && <Chip mono>{diff.branch} → {diff.base}</Chip>}
            {run && <StatusPill status={run.status} reason={run.statusReason} />}
          </h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {run?.review?.failed && <span className="max-w-[360px] truncate text-[12px] text-bad" title={run.review.failed}>{run.review.failed}</span>}
          {run?.review?.queued && <span className="text-[12px] text-amber">#{run.review.queued} in the merge queue</span>}
          <Button variant="danger" onClick={() => setRejecting(true)} disabled={busy}>
            Reject
          </Button>
          <Button variant="primary" onClick={() => void decide(true)} disabled={busy || !diff?.files.length || run?.status === "merged"}>
            Approve → merge queue
          </Button>
        </div>
      </header>

      <nav className="overflow-y-auto border-r border-line bg-panel p-2" aria-label="Changed files">
        <Eyebrow className="px-2 pb-2 pt-1">Files <Kbd>j</Kbd> <Kbd>k</Kbd></Eyebrow>
        {error && <div className="px-2 text-[12px] text-bad">{error}</div>}
        {diff?.files.map((f, i) => (
          <button
            key={f.path}
            onClick={() => setSelected(i)}
            className={`mb-0.5 flex w-full items-center gap-2 rounded-[var(--radius-m)] px-2 py-1.5 text-left text-[12px] ${i === selected ? "bg-raised text-fg shadow-[inset_2px_0_0_var(--amber)]" : "text-fg-2 hover:bg-raised"}`}
          >
            <span className={`mono w-3 text-[11px] ${f.change === "added" ? "text-ok" : f.change === "deleted" ? "text-bad" : "text-amber"}`}>{f.change[0]?.toUpperCase()}</span>
            <span className="mono min-w-0 flex-1 truncate">{f.path}</span>
            <span className="mono text-[10.5px] text-ok">+{stats[i]?.added}</span>
            <span className="mono text-[10.5px] text-bad">−{stats[i]?.removed}</span>
          </button>
        ))}
      </nav>

      <section className="relative min-h-0 overflow-hidden bg-panel" aria-label="Diff">
        {file ? (
          <Suspense fallback={<div className="p-6 text-fg-3">Loading the diff view…</div>}>
            <MergeView file={file.path} before={file.before} after={file.after} onLine={(line) => setDraft({ line, text: "" })} />
          </Suspense>
        ) : (
          <div className="p-6 text-fg-3">{diff ? "This run changed no files." : ""}</div>
        )}
        <AnimatePresence>
          {draft && file && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
              className="absolute bottom-4 left-1/2 w-[520px] max-w-[90%] -translate-x-1/2 rounded-[var(--radius-l)] border border-line-strong p-3 backdrop-blur-xl"
              style={{ background: "var(--glass)", boxShadow: "0 18px 50px rgba(0,0,0,.4)" }}
            >
              <div className="mb-1.5 text-[12px] text-fg-2">
                Comment on <span className="mono text-fg">{file.path}:{draft.line}</span>
              </div>
              <textarea
                autoFocus
                value={draft.text}
                onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setDraft(null);
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && draft.text.trim()) {
                    setComments((c) => [...c, { file: file.path, line: draft.line, text: draft.text.trim() }]);
                    setDraft(null);
                  }
                }}
                rows={3}
                placeholder="What should change here?"
                className="w-full resize-none rounded-[var(--radius-m)] border border-line-strong bg-raised px-2.5 py-2 text-[13px] outline-none focus:border-amber"
              />
              <div className="mt-2 flex justify-end gap-2">
                <Button size="s" variant="ghost" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
                <Button
                  size="s"
                  variant="primary"
                  disabled={!draft.text.trim()}
                  onClick={() => {
                    setComments((c) => [...c, { file: file.path, line: draft.line, text: draft.text.trim() }]);
                    setDraft(null);
                  }}
                >
                  Add comment <Kbd>⌘↵</Kbd>
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <aside className="flex min-h-0 flex-col border-l border-line bg-panel max-[1100px]:hidden" aria-label="Review comments">
        <div className="flex items-center border-b border-line px-4 py-3">
          <Eyebrow>Comments</Eyebrow>
          <span className="mono ml-auto text-[11px] text-fg-3">{comments.length} pending</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {comments.length === 0 && (
            <p className="px-1 text-[12.5px] leading-relaxed text-fg-3">
              Click a line number on the right-hand side to comment. Comments go back to the agent together, as one follow-up turn.
            </p>
          )}
          {comments.map((c, i) => (
            <div key={i} className="mb-2 rounded-[var(--radius-m)] border border-line bg-raised p-2.5 text-[12.5px]">
              <div className="mono mb-1 flex items-center text-[11px] text-fg-3">
                {c.file}:{c.line}
                <button onClick={() => setComments((all) => all.filter((_, j) => j !== i))} className="ml-auto hover:text-bad" aria-label="Remove comment">
                  ×
                </button>
              </div>
              {c.text}
            </div>
          ))}
        </div>
        <div className="border-t border-line p-3">
          <Button variant="quiet" className="w-full" onClick={() => void send()} disabled={!comments.length || busy}>
            <StatusGlyph tone="wait" size={7} /> Send {comments.length || ""} comment{comments.length === 1 ? "" : "s"} to the agent
          </Button>
        </div>
      </aside>

      <AnimatePresence>
        {rejecting && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div
              initial={{ scale: 0.97 }}
              animate={{ scale: 1 }}
              className="w-[520px] max-w-[92vw] rounded-[var(--radius-l)] border border-line-strong p-5 backdrop-blur-xl"
              style={{ background: "var(--glass)" }}
              role="dialog"
              aria-label="Reject this run"
            >
              <h2 className="text-[15px] font-semibold">What should it learn?</h2>
              <p className="mt-1 text-[12.5px] text-fg-2">This becomes a lesson for future runs in this project — e.g. “always run the frontend checks before calling it done”.</p>
              <textarea
                autoFocus
                value={lesson}
                onChange={(e) => setLesson(e.target.value)}
                rows={3}
                className="mt-3 w-full resize-none rounded-[var(--radius-m)] border border-line-strong bg-raised px-3 py-2 text-[13px] outline-none focus:border-amber"
              />
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setRejecting(false)}>
                  Cancel
                </Button>
                <Button variant="danger" onClick={() => void decide(false)} disabled={busy}>
                  Reject{lesson.trim() ? " and remember" : ""}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function lineStats(before: string, after: string): { added: number; removed: number } {
  const a = new Set(before.split("\n"));
  const b = new Set(after.split("\n"));
  let added = 0;
  let removed = 0;
  for (const line of b) if (!a.has(line)) added++;
  for (const line of a) if (!b.has(line)) removed++;
  return { added, removed };
}
