import { Kbd } from "@shuacrew/ui";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, launchRun, launchTask } from "../lib/api";
import { useLive } from "../lib/live";

interface RuntimeInfo {
  id: string;
  label: string;
  authMode: string;
  models: Array<{ id: string; label: string; tier: string }>;
  status: { installed: boolean; signedIn: boolean | null; detail: string };
  limitedUntil: number | null;
}

const RECENT_REPOS = "shuacrew.recentRepos";

/**
 * ⌘N: one field for the ask, chips for everything else, ⌘↵ to launch. It should feel like sending
 * a message, not filling a form — every chip has a sensible default and can be ignored.
 */
export function LaunchSheet() {
  const open = useLive((s) => s.launchOpen);
  const draft = useLive((s) => s.launchDraft);
  const close = useLive((s) => s.closeLaunch);
  const navigate = useNavigate();
  const [ask, setAsk] = useState("");
  const [repo, setRepo] = useState("");
  const [runtime, setRuntime] = useState("");
  const [model, setModel] = useState("");
  const [approveAll, setApproveAll] = useState(false);
  const [taskMode, setTaskMode] = useState(false);
  const [runtimes, setRuntimes] = useState<RuntimeInfo[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setAsk(draft);
    setError("");
    api<RuntimeInfo[]>("/api/runtimes")
      .then((list) => {
        setRuntimes(list);
        setRuntime((current) => current || list.find((r) => r.id === "claude")?.id || list[0]?.id || "");
      })
      .catch(() => undefined);
    requestAnimationFrame(() => field.current?.focus());
  }, [open, draft]);

  const recentRepos = useMemo<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(RECENT_REPOS) ?? "[]");
    } catch {
      return [];
    }
  }, [open]);

  const chosen = runtimes.find((r) => r.id === runtime);
  const estimate = useMemo(() => estimateOf(ask), [ask]);

  const submit = async () => {
    if (!ask.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const { id } = taskMode
        ? await launchTask({ markdown: ask.startsWith("#") ? ask : `# ${ask.split("\n")[0]}\n${ask}`, repo: repo || undefined, runtime: runtime || undefined, model: model || undefined })
        : await launchRun({ ask, repo: repo || undefined, runtime: runtime || undefined, model: model || undefined, approveAll });
      if (repo) localStorage.setItem(RECENT_REPOS, JSON.stringify([repo, ...recentRepos.filter((r) => r !== repo)].slice(0, 8)));
      close();
      setAsk("");
      navigate({ to: "/sessions/$id", params: { id } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onMouseDown={(e) => e.target === e.currentTarget && close()}
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Launch a run"
        >
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.985 }}
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
            className="w-[680px] max-w-[94vw] rounded-[var(--radius-l)] border border-line-strong p-4 backdrop-blur-xl"
            style={{ background: "var(--glass)", boxShadow: "0 30px 90px rgba(0,0,0,.5)" }}
          >
            <textarea
              ref={field}
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
              rows={4}
              placeholder="What should the crew do? e.g. “Find why the upload retry test is flaky on CI and fix it”"
              className="w-full resize-none bg-transparent text-[15px] leading-relaxed text-fg outline-none placeholder:text-fg-3"
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <ChipInput label="repo" value={repo} onChange={setRepo} placeholder="no repo — scratch workspace" suggestions={recentRepos} />
              <ChipSelect
                label="runtime"
                value={runtime}
                onChange={(v) => {
                  setRuntime(v);
                  setModel("");
                }}
                options={runtimes.map((r) => ({ value: r.id, label: r.label + (r.limitedUntil ? " · limited" : "") }))}
              />
              <ChipSelect
                label="model"
                value={model}
                onChange={setModel}
                options={[{ value: "", label: "auto" }, ...(chosen?.models ?? []).map((m) => ({ value: m.id, label: m.label }))]}
              />
              <button
                onClick={() => setApproveAll((v) => !v)}
                className={`h-7 rounded-[var(--radius-s)] border px-2 text-[12px] ${approveAll ? "border-amber text-amber" : "border-line-strong text-fg-2"}`}
                aria-pressed={approveAll}
                title="Approve everything the policy would ask about. Deny rules still apply."
              >
                approve-all {approveAll ? "on" : "off"}
              </button>
              <button
                onClick={() => setTaskMode((v) => !v)}
                className={`h-7 rounded-[var(--radius-s)] border px-2 text-[12px] ${taskMode ? "border-amber text-amber" : "border-line-strong text-fg-2"}`}
                aria-pressed={taskMode}
                title="Plan → run each step → validate → retry → checkpoint. Paste a TASK.md (## Steps, ## Validate) or just describe the goal."
              >
                task mode {taskMode ? "on" : "off"}
              </button>
            </div>
            <div className="mt-4 flex items-center gap-3 border-t border-line pt-3 text-[12px] text-fg-3">
              <span title="A rough guide from the ask's size and shape — real usage shows on the run">
                est. <span className="mono text-fg-2">{estimate.tokens}</span> tokens ·{" "}
                {chosen?.authMode === "subscription" ? "on your plan" : `≈ $${estimate.dollars}`}
              </span>
              {chosen?.limitedUntil && <span className="text-amber">limited until {new Date(chosen.limitedUntil).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} — it will queue</span>}
              {error && <span className="text-bad">{error}</span>}
              <button
                onClick={() => void submit()}
                disabled={!ask.trim() || busy}
                className="ml-auto flex h-8.5 items-center gap-2 rounded-[var(--radius-m)] bg-amber px-3.5 text-[13px] font-semibold text-[#1a1204] disabled:opacity-40"
              >
                Launch <Kbd>⌘↵</Kbd>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function estimateOf(ask: string): { tokens: string; dollars: string } {
  const words = ask.trim().split(/\s+/).filter(Boolean).length;
  const heavy = /refactor|migrate|implement|build|redesign|across|every/i.test(ask);
  const tokens = Math.round((heavy ? 180_000 : 60_000) + words * 800);
  return { tokens: tokens >= 1000 ? `${Math.round(tokens / 1000)}k` : String(tokens), dollars: ((tokens / 1_000_000) * 6).toFixed(2) };
}

function ChipSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <label className="flex h-7 items-center gap-1.5 rounded-[var(--radius-s)] border border-line-strong bg-raised px-2 text-[12px] text-fg-2">
      <span className="text-fg-3">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="bg-transparent text-fg outline-none">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ChipInput({ label, value, onChange, placeholder, suggestions }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; suggestions: string[] }) {
  return (
    <label className="flex h-7 min-w-[240px] flex-1 items-center gap-1.5 rounded-[var(--radius-s)] border border-line-strong bg-raised px-2 text-[12px] text-fg-2">
      <span className="text-fg-3">{label}</span>
      <input list="recent-repos" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mono min-w-0 flex-1 bg-transparent text-[11.5px] text-fg outline-none placeholder:text-fg-3" />
      <datalist id="recent-repos">
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </label>
  );
}
