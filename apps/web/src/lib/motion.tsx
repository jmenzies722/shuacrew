/**
 * The app's motion: small, quick and purposeful. Everything here stands down when the Mac's
 * "Reduce motion" setting is on.
 */
import { Flag, Globe2, Rocket, Trophy, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { useLive } from "./live";

export const reduced = () => typeof document !== "undefined" && document.documentElement.dataset.motion === "reduced";

/** The ShuaCrew mark, alive: the three agents drift around their orbit and the core breathes. */
/**
 * The ShuaCrew mark — a lit core, an orbit, three crew — drawn in the theme's own accent (and a second
 * tint derived from it), so it matches every palette. `bare` drops the tile for inline use (sidebar, top
 * bar); `spin` lets the crew orbit and the core breathe.
 */
export function LogoMark({ size = 56, spin = true, bare = false }: { size?: number; spin?: boolean; bare?: boolean }) {
  const id = useId().replace(/:/g, "");
  const stop = (offset: string, color: string, opacity?: number) => <stop offset={offset} style={{ stopColor: color, ...(opacity === undefined ? {} : { stopOpacity: opacity }) }} />;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={`logo-mark ${spin ? "is-live" : ""} ${bare ? "is-bare" : ""}`} aria-hidden>
      <defs>
        <linearGradient id={`${id}-tile`} x1="0" y1="0" x2="0" y2="1">{stop("0", "var(--logo-tile-a)")}{stop(".5", "var(--logo-tile-b)")}{stop("1", "var(--logo-tile-c)")}</linearGradient>
        <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="1">{stop("0", "var(--logo-hi)", 0.55)}{stop(".55", "var(--amber)", 0.12)}{stop("1", "var(--accent-2)", 0.35)}</linearGradient>
        <linearGradient id={`${id}-core`} x1="0" y1="0" x2="1" y2="1">{stop("0", "var(--logo-hi)")}{stop(".5", "var(--amber)")}{stop("1", "var(--accent-2)")}</linearGradient>
        <linearGradient id={`${id}-crew`} x1="0" y1="0" x2="0" y2="1">{stop("0", "#fff")}{stop("1", "var(--logo-hi)")}</linearGradient>
        <radialGradient id={`${id}-glow`} cx=".5" cy=".5" r=".5">{stop("0", "var(--amber)", 0.42)}{stop("1", "var(--amber)", 0)}</radialGradient>
      </defs>
      {!bare && <rect width="64" height="64" rx="15" fill={`url(#${id}-rim)`} />}
      {!bare && <rect x=".8" y=".8" width="62.4" height="62.4" rx="14.2" fill={`url(#${id}-tile)`} />}
      <circle cx="32" cy="32" r={bare ? 30 : 24} fill={`url(#${id}-glow)`} />
      <circle cx="32" cy="32" r="16" fill="none" stroke="var(--logo-hi)" strokeOpacity=".32" strokeWidth={bare ? 1.6 : 0.9} />
      <circle className="logo-core" cx="32" cy="32" r="7.7" fill="none" stroke={`url(#${id}-core)`} strokeWidth={bare ? 4.4 : 3.4} />
      <g className="logo-orbit">
        <circle cx="32" cy="16" r={bare ? 4.2 : 3.3} fill={`url(#${id}-crew)`} />
        <circle cx="45.9" cy="40" r={bare ? 4.2 : 3.3} fill={`url(#${id}-crew)`} />
        <circle cx="18.1" cy="40" r={bare ? 4.2 : 3.3} fill={`url(#${id}-crew)`} />
      </g>
    </svg>
  );
}

/** A number that counts to its new value instead of jumping. */
export function CountUp({ value, format = (n) => String(Math.round(n)), duration = 800 }: { value: number; format?: (n: number) => string; duration?: number }) {
  const preference = useLive((s) => s.appearance.motion);
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const first = useRef(true);
  useEffect(() => {
    // The first render counts up from zero; later changes count from where it was.
    const start = first.current ? 0 : from.current;
    first.current = false;
    if (reduced() || start === value) {
      setShown(value);
      from.current = value;
      return;
    }
    const t0 = performance.now();
    let frame = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(start + (value - start) * eased);
      if (p < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, preference]);
  return <>{format(shown)}</>;
}

/** Cards light up under the cursor: a soft spotlight that follows it (see `.spot` in styles). */
const SPOT = ".vn-card,.pb-card,.member-card,.art-card,.tl-card,.lib-row,.pb-row,.hero-idea,.vn-panel,.pb-phase-card,.brief,.getting-started,.vn-site,.lib-hit,.theme-card,.crew-cta-role";
export function useSpotlight() {
  const preference = useLive((s) => s.appearance.motion);
  useEffect(() => {
    if (reduced()) return;
    let last: HTMLElement | null = null;
    const move = (e: PointerEvent) => {
      if (reduced()) { last?.classList.remove("is-lit"); return; }
      const el = (e.target as HTMLElement | null)?.closest?.(SPOT) as HTMLElement | null;
      if (last && last !== el) last.classList.remove("is-lit");
      last = el;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
      el.classList.add("spot", "is-lit");
    };
    const leave = () => last?.classList.remove("is-lit");
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    return () => { last?.classList.remove("is-lit"); window.removeEventListener("pointermove", move); document.removeEventListener("pointerleave", leave); };
  }, [preference]);
}

interface Milestone {
  id: string;
  title: string;
  detail: string;
  kind: "stage" | "site" | "play";
}

/**
 * Moments worth marking: a venture reaching a new stage, a first signup, a playbook finishing.
 * A card rises at the top with a burst of light, then gets out of the way.
 */
export function Milestones() {
  const ventures = useLive((s) => s.crew.ventures);
  const sites = useLive((s) => s.crew.sites);
  const plays = useLive((s) => s.crew.plays);
  const [shown, setShown] = useState<Milestone[]>([]);
  const seen = useRef<{ stages: Record<string, string>; signups: Record<string, number>; plays: Record<string, string> } | null>(null);

  useEffect(() => {
    const now = {
      stages: Object.fromEntries(Object.values(ventures).map((v) => [v.id, v.stage])),
      signups: Object.fromEntries(Object.values(sites).map((s) => [s.id, s.signups?.count ?? 0])),
      plays: Object.fromEntries(Object.values(plays).map((p) => [p.id, p.status])),
    };
    const was = seen.current;
    seen.current = now;
    if (!was) return; // what was already true when you opened the app isn't news
    const fresh: Milestone[] = [];
    for (const v of Object.values(ventures)) {
      const before = was.stages[v.id];
      if (before && before !== v.stage && ["validating", "building", "launching", "earning"].includes(v.stage)) {
        fresh.push({ id: `stage:${v.id}:${v.stage}`, kind: "stage", title: v.stage === "earning" ? `${v.name} is earning` : `${v.name} moved to ${v.stage}`, detail: v.stages.at(-1)?.note ?? "" });
      }
    }
    for (const s of Object.values(sites)) {
      const before = was.signups[s.id] ?? 0;
      const count = s.signups?.count ?? 0;
      if (count > before) fresh.push({ id: `site:${s.id}:${count}`, kind: "site", title: before === 0 ? "Your first signup" : `+${count - before} on the waitlist`, detail: `${count} joined · ${s.url.replace(/^https:\/\//, "")}` });
    }
    for (const p of Object.values(plays)) {
      if (was.plays[p.id] && was.plays[p.id] !== "done" && p.status === "done") fresh.push({ id: `play:${p.id}`, kind: "play", title: `${p.name} — done`, detail: p.title });
    }
    if (fresh.length) setShown((cur) => [...cur, ...fresh].slice(-3));
  }, [ventures, sites, plays]);

  useEffect(() => {
    if (!shown.length) return;
    const t = setTimeout(() => setShown((cur) => cur.slice(1)), 5200);
    return () => clearTimeout(t);
  }, [shown]);

  return (
    <div className="milestones" aria-live="polite">
      <AnimatePresence>
        {shown.map((m) => {
          const Icon = m.kind === "stage" ? (m.title.endsWith("earning") ? Trophy : Flag) : m.kind === "site" ? Globe2 : Rocket;
          return (
            <motion.div key={m.id} className="milestone" initial={{ opacity: 0, y: -18, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.98 }} transition={{ type: "spring", stiffness: 380, damping: 30 }}>
              <span className="milestone-burst" aria-hidden>
                {Array.from({ length: 10 }, (_, i) => (
                  <i key={i} style={{ "--a": `${i * 36}deg` } as React.CSSProperties} />
                ))}
              </span>
              <span className="milestone-icon">
                <Icon size={16} strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold text-fg">{m.title}</span>
                {m.detail && <span className="block truncate text-[12px] text-fg-3">{m.detail}</span>}
              </span>
              <button className="member-icon" onClick={() => setShown((cur) => cur.filter((x) => x.id !== m.id))} aria-label="Dismiss">
                <X size={13} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
