/**
 * The app's motion: small, quick and purposeful. Everything here stands down when the Mac's
 * "Reduce motion" setting is on.
 */
import { Flag, Globe2, Rocket, Trophy, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { useLive } from "./live";

export const reduced = () => typeof document !== "undefined" && document.documentElement.dataset.motion === "reduced";

/**
 * The ShuaCrew mark, alive — Shua's voice inside the crew's orbit, three crew on the ring, on an obsidian tile
 * (the app icon's drawing, scripts/brand/mark.mjs). Chrome on black; the glow is the theme's accent. `bare`
 * drops the tile and draws in the text colour for inline use; `spin` lets the crew orbit and the voice breathe.
 */
export function LogoMark({ size = 56, spin = true, bare = false }: { size?: number; spin?: boolean; bare?: boolean }) {
  const id = useId().replace(/:/g, "");
  const stop = (offset: string, color: string, opacity?: number) => <stop offset={offset} style={{ stopColor: color, ...(opacity === undefined ? {} : { stopOpacity: opacity }) }} />;
  // Three stacked layers of one drawing: the moving parts (voice, crew) live in their own HTML boxes, so the browser
  // spins and breathes them on the GPU. Animating shapes inside one SVG re-laid-out the page every frame.
  const layer = { position: "absolute", inset: 0, width: size, height: size } as const;
  // The icon's geometry (1024 grid, full-bleed tile) scaled to 64: ring r 15.4, five bars, crew at -90°, 30°, 150°.
  const R = 15.4, bars: Array<[number, number]> = [[-9.8, 9.3], [-4.9, 16.2], [0, 21.3], [4.9, 16.2], [9.8, 9.3]];
  const crew = [-90, 30, 150].map((a) => [32 + R * Math.cos((a * Math.PI) / 180), 32 + R * Math.sin((a * Math.PI) / 180)] as const);
  const metal = bare ? "var(--text)" : `url(#${id}-bar)`;
  return (
    <span className={`logo-mark ${spin ? "is-live" : ""} ${bare ? "is-bare" : ""}`} style={{ position: "relative", display: "inline-block", width: size, height: size, flex: "none" }} aria-hidden>
      <svg width={size} height={size} viewBox="0 0 64 64" style={layer}>
        <defs>
          <radialGradient id={`${id}-tile`} cx=".5" cy=".3" r=".85">{stop("0", "var(--logo-tile-a)")}{stop(".38", "var(--logo-tile-b)")}{stop("1", "var(--logo-tile-c)")}</radialGradient>
          <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="0" y2="1">{stop("0", "#fff", 0.46)}{stop(".45", "#fff", 0.07)}{stop("1", "#fff", 0.16)}</linearGradient>
          <linearGradient id={`${id}-bar`} x1="0" y1="0" x2="0" y2="1">{stop("0", "#fff")}{stop(".44", "#e8e9ef")}{stop(".56", "#c3c6d0")}{stop("1", "#f2f3f7")}</linearGradient>
          <radialGradient id={`${id}-glow`} cx=".5" cy=".56" r=".5">{stop("0", "var(--amber)", bare ? 0.22 : 0.34)}{stop("1", "var(--amber)", 0)}</radialGradient>
        </defs>
        {!bare && <rect width="64" height="64" rx="15" fill={`url(#${id}-rim)`} />}
        {!bare && <rect x=".6" y=".6" width="62.8" height="62.8" rx="14.4" fill={`url(#${id}-tile)`} />}
        <circle cx="32" cy="34" r={bare ? 30 : 25} fill={`url(#${id}-glow)`} />
      </svg>
      <span className="logo-core" style={layer}><svg width={size} height={size} viewBox="0 0 64 64">
        {bars.map(([dx, h]) => <rect key={dx} x={32 + dx - 1.85} y={32 - h / 2} width="3.7" height={h} rx="1.85" fill={metal} />)}
      </svg></span>
      <span className="logo-orbit" style={layer}><svg width={size} height={size} viewBox="0 0 64 64">
        <defs>
          <linearGradient id={`${id}-ring2`} x1="0" y1="0" x2="0" y2="1">{stop("0", "#fbfbfd")}{stop(".5", "#9da1ae")}{stop("1", "#d7d9e1")}</linearGradient>
          <radialGradient id={`${id}-node2`} cx=".4" cy=".34" r=".7">{stop("0", "#fff")}{stop(".55", "#eceaf6")}{stop("1", "var(--logo-hi)")}</radialGradient>
        </defs>
        <circle cx="32" cy="32" r={R} fill="none" stroke={bare ? "var(--text)" : `url(#${id}-ring2)`} strokeOpacity={bare ? 0.85 : 1} strokeWidth="2.3" />
        {crew.map(([x, y]) => <g key={`${x}`}>{!bare && <circle cx={x} cy={y} r="3.6" fill="#09090b" />}<circle cx={x} cy={y} r="2.6" fill={bare ? "var(--text)" : `url(#${id}-node2)`} /></g>)}
      </svg></span>
    </span>
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
