import { useEffect, useMemo, useState } from "react";
import { Check, History, Moon, PiggyBank, RotateCcw, Sparkles, Target, Zap } from "lucide-react";
import { api } from "../lib/api";
import { useWorkspace } from "../lib/workspace-prefs";
import { enterMode, leaveMode, useActiveMode, type Mode } from "../lib/modes";
import { focusMinutes } from "../lib/focus-stats";
import { useLive } from "../lib/live";
import { useGatewaySettings } from "./BatchSettings";
import "./settings-command.css";

/** Your real setup, graded — each item checks a real setting and links to where you fix it. */
function useChecks() {
  const { value } = useGatewaySettings();
  const ws = useWorkspace();
  const [extra, setExtra] = useState<{ backupAt: number | null; goal: boolean }>({ backupAt: null, goal: false });
  useEffect(() => {
    void Promise.all([api<{ last?: { at?: number } | null }>("/api/backups").catch(() => null), api<{ profile: { goal: string } }>("/api/learning").catch(() => null)])
      .then(([b, l]) => setExtra({ backupAt: b?.last?.at ?? null, goal: Boolean(l?.profile.goal) }));
  }, []);
  if (!value) return null;
  const v = value as unknown as { instructions: { global: string }; protectedPaths: string[]; caps: { maxMinutes: number | null; maxTokens: number | null }; router: unknown[]; hooks: { onDone: string; onFailed: string } };
  return [
    { id: "instructions", label: "Standing instructions", done: Boolean(v.instructions.global.trim()), hint: "Tell every agent how you work." },
    { id: "protected", label: "Private folders protected", done: v.protectedPaths.length > 0, hint: "Add folders agents must never touch." },
    { id: "budget", label: "Daily token budget", done: ws.dailyTokenBudget !== null, hint: "Know when a day runs hot." },
    { id: "caps", label: "Session caps", done: v.caps.maxMinutes !== null || v.caps.maxTokens !== null, hint: "Stop runaway sessions." },
    { id: "router", label: "Model router rules", done: v.router.length > 0, hint: "Cheap models for simple work." },
    { id: "backups", label: "Backup in the last 48h", done: extra.backupAt !== null && Date.now() - extra.backupAt < 48 * 3_600_000, hint: "Encrypted nightly backups." },
    { id: "hooks", label: "A hook on finish or fail", done: Boolean(v.hooks.onDone.trim() || v.hooks.onFailed.trim()), hint: "Automate what happens next." },
    { id: "learn", label: "Career goal for Learning", done: extra.goal, hint: "Lessons pitched to where you're headed.", href: "/learn" },
  ];
}

const MODES: Array<{ id: Mode; icon: typeof Zap; name: string; blurb: string }> = [
  { id: "deep", icon: Target, name: "Deep work", blurb: "Flow mode, brown noise, only approval sounds." },
  { id: "saver", icon: PiggyBank, name: "Cost saver", blurb: "Haiku at low effort by default, 250k session cap, 500k daily budget." },
  { id: "wind", icon: Moon, name: "Wind down", blurb: "Quiet hours for automation, no sounds or celebrations." },
];

export function SettingsCommand({ go }: { go: (hash: string) => void }) {
  const checks = useChecks();
  const active = useActiveMode();
  const runs = useLive((st) => st.crew.runs);
  const finishedToday = useMemo(() => { const start = new Date(); start.setHours(0, 0, 0, 0); return Object.values(runs).filter((r) => !r.parent && !r.labels.includes("learning") && !r.labels.includes("buddy") && ["done", "merged"].includes(r.status) && r.updatedAt >= start.getTime()).length; }, [runs]);
  const focus = focusMinutes(7), today = focus.at(-1)!.minutes, maxFocus = Math.max(30, ...focus.map((f) => f.minutes));
  const [history, setHistory] = useState<Array<{ at: number; changed: string[] }> | null>(null);
  const [notice, setNotice] = useState("");
  const score = checks ? Math.round((checks.filter((c) => c.done).length / checks.length) * 100) : 0;
  const next = checks?.find((c) => !c.done);

  const enter = async (mode: Mode) => { await enterMode(mode); setNotice(`${MODES.find((m) => m.id === mode)!.name} on. Everything it changed comes back when you turn it off.`); };
  const leave = async () => { await leaveMode(); setNotice("Back to your usual settings."); };
  const restore = async (at: number) => {
    await api("/api/settings/restore", { body: { at } });
    setNotice("Restored that version. Your previous settings are in the history too, if you change your mind.");
    setHistory(await api("/api/settings/history")); window.location.reload();
  };
  const ring = useMemo(() => ({ "--p": score } as React.CSSProperties), [score]);
  return <section className="cmd" aria-label="Settings command center">
    <div className="cmd-score">
      <div className="cmd-ring" style={ring}><strong>{score}</strong><small>setup</small></div>
      <div className="cmd-checks">
        <h3>Your setup</h3>
        <ul>{checks?.map((c) => <li key={c.id} className={c.done ? "is-done" : ""}><span className="cmd-tick">{c.done ? <Check size={11} /> : null}</span>{c.label}
          {!c.done && <button type="button" onClick={() => (c.href ? (window.location.href = c.href) : go(c.id))}>Fix</button>}</li>)}</ul>
        {next ? <p className="cmd-next"><Sparkles size={12} /> Next: {next.hint}</p> : <p className="cmd-next is-done"><Sparkles size={12} /> Fully set up.</p>}
      </div>
    </div>
    <div className="cmd-modes">
      <h3>Modes</h3>
      <div className="cmd-mode-grid">{MODES.map((m) => { const on = active?.mode === m.id; return <button key={m.id} type="button" className={`cmd-mode ${on ? "is-on" : ""}`} aria-pressed={on} onClick={() => void (on ? leave() : enter(m.id))}>
        <m.icon size={16} /><strong>{m.name}</strong><small>{m.blurb}</small><span className="cmd-mode-state">{on ? (active?.auto ? "On schedule · tap to stop" : "On · tap to restore") : "Turn on"}</span>
      </button>; })}</div>
      <div className="cmd-history">
        <button type="button" className="settings-reset" onClick={async () => setHistory(history ? null : await api("/api/settings/history"))}><History size={13} /> {history ? "Hide" : "Time machine"}</button>
        {history && <ol>{history.length ? history.slice(0, 12).map((h) => <li key={h.at}><time>{new Date(h.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time><span>{h.changed.join(", ") || "no change"}</span>
          <button type="button" onClick={() => void restore(h.at)}><RotateCcw size={11} /> Restore</button></li>) : <li className="cmd-muted">No changes yet — every save of gateway settings lands here.</li>}</ol>}
      </div>
      {notice && <p role="status" className="cmd-notice">{notice}</p>}
    </div>
    <div className="cmd-today">
      <h3>Today</h3>
      <div className="cmd-today-stats"><div><strong>{today}<small>min</small></strong><span>in Flow</span></div><div><strong>{finishedToday}</strong><span>sessions shipped</span></div>{active && <div><strong className="cmd-mode-name">{MODES.find((m) => m.id === active.mode)?.name}</strong><span>{active.auto ? "on schedule" : "mode on"}</span></div>}</div>
      <div className="cmd-focus-bars" aria-label="Minutes in Flow, last 7 days">{focus.map((f) => <i key={f.day} title={`${f.day}: ${f.minutes} min`} style={{ height: `${Math.max(4, (f.minutes / maxFocus) * 100)}%` }} className={f.minutes ? "is-on" : ""} />)}</div>
    </div>
  </section>;
}
