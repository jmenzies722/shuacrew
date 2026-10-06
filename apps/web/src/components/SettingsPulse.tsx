/**
 * Settings, live: what each section is set to right now (in one line), a status panel for the machinery underneath,
 * the Updates panel, and an "On this page" guide that follows you down a long section.
 */
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, GitCommitHorizontal, RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import { ACCENTS, PALETTES, type Appearance } from "../lib/appearance";
import type { Tone } from "./ControlRoom";

export interface Pulse {
  health: { ok: boolean; build: string; uptimeS: number; service: boolean; version: string } | null;
  backup: { at: number; bytes: number; error?: string } | null | undefined;
  runtimes: Array<{ id: string; label: string; limitedUntil: number | null; status: { installed: boolean; signedIn: boolean | null; overridingKeys: string[] } }> | null;
  schedules: number | null;
  updates: { version: string; build: string; branch: string | null; commit: string | null; changes: Array<{ hash: string; subject: string; at: number }> } | null;
}

/** Reads the gateway once, then every minute and whenever ShuaCrew comes back to the front. Missing pieces stay null. */
export function usePulse(): Pulse & { refresh: () => void } {
  const [pulse, setPulse] = useState<Pulse>({ health: null, backup: undefined, runtimes: null, schedules: null, updates: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    const soft = <T,>(p: Promise<T>) => p.catch(() => null);
    const load = () => void Promise.all([
      soft(api<Pulse["health"]>("/api/health")), soft(api<{ last: Pulse["backup"] }>("/api/backups")), soft(api<NonNullable<Pulse["runtimes"]>>("/api/runtimes")),
      soft(api<unknown[]>("/api/schedules")), soft(api<Pulse["updates"]>("/api/updates")),
    ]).then(([health, backups, runtimes, schedules, updates]) => {
      if (alive) setPulse({ health, backup: backups ? backups.last ?? null : undefined, runtimes, schedules: Array.isArray(schedules) ? schedules.length : null, updates });
    });
    load();
    const t = setInterval(load, 60_000);
    window.addEventListener("focus", load);
    return () => { alive = false; clearInterval(t); window.removeEventListener("focus", load); };
  }, [tick]);
  return { ...pulse, refresh: () => setTick((n) => n + 1) };
}

export const ago = (t: number, now = Date.now()) => {
  const m = Math.round((now - t) / 60_000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};
const uptime = (s: number) => (s < 3600 ? `${Math.max(1, Math.round(s / 60))} min` : s < 86400 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86400)} days`);
const connected = (r: NonNullable<Pulse["runtimes"]>[number]) => r.status.installed && r.status.signedIn === true && !r.status.overridingKeys.length;

export interface SummaryInput {
  pulse: Pulse;
  appearance: Appearance;
  companion: { name: string; placement: "free" | "notch"; control: "off" | "ask" | "auto" };
  budget: number | null;
  now?: number;
}
/** One line per section saying what it's set to right now, and whether anything needs you. */
export function sectionSummary(id: string, input: SummaryInput): { text: string; tone: Tone } {
  const { pulse, appearance: a, companion: c, budget } = input, now = input.now ?? Date.now();
  const palette = (pid: string) => PALETTES.find((p) => p.id === pid)?.name ?? pid;
  switch (id) {
    case "appearance": {
      const accent = ACCENTS.find((x) => x.id === a.accent)?.name ?? a.accent;
      return { text: a.palette === "system" ? `${palette(a.dark)} at night, ${palette(a.light)} by day · ${accent}` : `${palette(a.palette)} · ${accent}`, tone: "ok" };
    }
    case "shua":
      return { text: `${c.name} ${c.placement === "notch" ? "lives in your notch" : "floats on your desktop"} · ${c.control === "off" ? "Mac control off" : c.control === "ask" ? "asks before each step" : "acts on its own"}`, tone: c.control === "off" ? "idle" : "ok" };
    case "workspace":
      return { text: `${a.density === "compact" ? "Compact" : "Comfortable"} · Enter ${a.sendShortcut === "enter" ? "sends" : "adds a line"} · ${budget ? `${Math.round(budget / 1000)}k daily budget` : "no daily budget"}`, tone: "ok" };
    case "agents": {
      if (!pulse.runtimes) return { text: "Checking your models…", tone: "idle" };
      const on = pulse.runtimes.filter(connected), resting = pulse.runtimes.filter((r) => r.limitedUntil && r.limitedUntil > now);
      if (!on.length) return { text: "No model connected yet", tone: "wait" };
      const name = (r: { label: string }) => r.label.replace(/\s*\(.*\)\s*$/, "");
      return { text: `${on.map(name).join(" and ")} connected${resting.length ? ` · ${resting.map(name).join(", ")} resting on a limit` : ""}`, tone: resting.length ? "wait" : "ok" };
    }
    case "automation":
      return pulse.schedules === null ? { text: "Schedules, hooks, snippets and presets", tone: "idle" } : { text: pulse.schedules ? `${pulse.schedules} schedule${pulse.schedules === 1 ? "" : "s"} set up` : "Nothing scheduled yet", tone: pulse.schedules ? "ok" : "idle" };
    case "system": {
      if (!pulse.health) return { text: "Checking the gateway…", tone: "idle" };
      const b = pulse.backup;
      const backup = b === undefined ? "" : !b ? " · no backup yet" : b.error ? " · last backup failed" : ` · backed up ${ago(b.at, now)}`;
      return { text: `${pulse.health.service ? "Always on" : "Running while open"} · up ${uptime(pulse.health.uptimeS)}${backup}`, tone: b?.error || (b && now - b.at > 36 * 3_600_000) ? "wait" : pulse.health.ok ? "ok" : "bad" };
    }
    case "access": return { text: "Everything Shua can reach on this Mac, one switch each", tone: "idle" };
    case "safety": return { text: "Protected folders and branches, and how work lands in git", tone: "idle" };
    case "notifications": return { text: "Desktop alerts, sounds and the menu bar", tone: "idle" };
    case "mobile": return { text: "iPhone and Apple Watch · off until you pair", tone: "idle" };
    default: return { text: "", tone: "idle" };
  }
}

/** System → Updates: what this install runs, when it was built, and what changed most recently. */
export function UpdatesPanel({ pulse, onRefresh }: { pulse: Pulse; onRefresh: () => void }) {
  const u = pulse.updates, built = Number(pulse.health?.build);
  // The build this window started on is the first one we hear about; a later, different one means a newer build landed.
  const loaded = useRef<string | null>(null);
  if (!loaded.current && pulse.health?.build) loaded.current = pulse.health.build;
  const newer = !!(loaded.current && pulse.health?.build && pulse.health.build !== loaded.current);
  return <div className="settings-card upd">
    <div className="upd-head">
      <div><strong>ShuaCrew {u?.version ?? pulse.health?.version ?? ""}</strong>
        <small>{u?.branch ? <><GitCommitHorizontal size={12} /> {u.branch} @ {u.commit}</> : "Version details unavailable"}{Number.isFinite(built) && built > 0 ? ` · built ${ago(built)}` : ""}</small></div>
      {newer ? <button type="button" className="cr-btn is-primary" onClick={() => location.reload()}>Reload to update</button>
        : <span className="upd-ok"><i /> This window is on the latest build</span>}
      <button type="button" className="cr-btn" onClick={onRefresh} aria-label="Check again" title="Check again"><RefreshCw size={13} /></button>
    </div>
    {u?.changes.length ? <ol className="upd-log">{u.changes.slice(0, 8).map((c) => <li key={c.hash}><code>{c.hash}</code><span>{c.subject}</span><time>{ago(c.at)}</time></li>)}</ol>
      : <p className="dim">The change history shows when ShuaCrew runs from its own repository.</p>}
    <p className="dim">Pages reload themselves when a new build lands, and the gateway restarts on its own. Nothing here fetches from the internet.</p>
  </div>;
}

/** "On this page": the section's groups, with the one you're reading lit. Clicking scrolls there smoothly. */
export function OnThisPage({ groups, root }: { groups: Array<{ id: string; title: string }>; root: () => HTMLElement | null }) {
  const [current, setCurrent] = useState(groups[0]?.id ?? "");
  const ids = groups.map((g) => g.id).join(",");
  const seen = useRef(new Map<string, number>());
  useEffect(() => {
    const scroller = root();
    if (!scroller) return;
    seen.current.clear();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) seen.current.set(e.target.id.replace(/^g-/, ""), e.isIntersecting ? e.boundingClientRect.top : Infinity);
      const best = [...seen.current.entries()].filter(([, top]) => top !== Infinity).sort((a, b) => a[1] - b[1])[0];
      if (best) setCurrent(best[0]);
    }, { root: scroller, rootMargin: "0px 0px -55% 0px" });
    for (const g of groups) { const el = document.getElementById(`g-${g.id}`); if (el) io.observe(el); }
    return () => io.disconnect();
  }, [ids]);
  if (groups.length < 3) return null;
  return <nav className="settings-toc" aria-label="On this page"><span>On this page</span>
    {groups.map((g) => <button key={g.id} type="button" className={current === g.id ? "is-on" : ""} aria-current={current === g.id ? "location" : undefined}
      onClick={() => document.getElementById(`g-${g.id}`)?.scrollIntoView({ behavior: document.documentElement.dataset.motion === "reduced" ? "auto" : "smooth", block: "start" })}>{g.title}</button>)}
  </nav>;
}

/** The sidebar's live corner: the machinery underneath, in three lines. */
export function SystemPulse({ pulse, go }: { pulse: Pulse; go: (hash: string) => void }) {
  const b = pulse.backup, h = pulse.health, u = pulse.updates;
  const rows: Array<{ k: string; label: string; value: string; tone: Tone; hash: string }> = [
    { k: "gw", label: "Gateway", value: !h ? "checking…" : `${h.ok ? "up" : "down"} ${uptime(h.uptimeS)}`, tone: !h ? "idle" : h.ok ? "ok" : "bad", hash: "service" },
    { k: "bk", label: "Backup", value: b === undefined ? "checking…" : !b ? "none yet" : b.error ? "failed" : ago(b.at), tone: b === undefined ? "idle" : !b || b.error ? "wait" : "ok", hash: "backups" },
    { k: "up", label: "Build", value: u?.commit ? `${u.commit}` : "—", tone: u?.commit ? "ok" : "idle", hash: "updates" },
  ];
  return <div className="settings-pulse" aria-label="System status">{rows.map((r) => <button key={r.k} type="button" onClick={() => go(r.hash)}>
    <i className={`is-${r.tone}`} /><span>{r.label}</span><b>{r.value}</b><ArrowUpRight size={11} /></button>)}</div>;
}
