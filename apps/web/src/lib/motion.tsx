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
 * The ShuaCrew mark, alive: Shua's visor and two amber eyes on a black tile, the app icon's drawing
 * (apps/web/public/icon.svg) at 64. `bare` drops the tile for inline use and draws the visor in the text colour;
 * `spin` lets Shua blink now and then.
 */
export function LogoMark({ size = 56, spin = true, bare = false }: { size?: number; spin?: boolean; bare?: boolean }) {
  const id = useId().replace(/:/g, "");
  const stop = (offset: string, color: string, opacity?: number) => <stop offset={offset} style={{ stopColor: color, ...(opacity === undefined ? {} : { stopOpacity: opacity }) }} />;
  // Two stacked layers: the eyes live in their own HTML box, so the browser blinks them on the GPU.
  // Animating shapes inside one SVG re-laid-out the page every frame.
  const layer = { position: "absolute", inset: 0, width: size, height: size } as const;
  return (
    <span className={`logo-mark ${spin ? "is-live" : ""} ${bare ? "is-bare" : ""}`} style={{ position: "relative", display: "inline-block", width: size, height: size, flex: "none" }} aria-hidden>
      <svg width={size} height={size} viewBox="0 0 64 64" style={layer}>
        <defs>
          <linearGradient id={`${id}-tile`} x1="0" y1="0" x2="0" y2="1">{stop("0", "var(--logo-tile-a)")}{stop(".5", "var(--logo-tile-b)")}{stop("1", "var(--logo-tile-c)")}</linearGradient>
          <radialGradient id={`${id}-sheen`} cx=".5" cy="0" r=".75">{stop("0", "#fff", 0.09)}{stop("1", "#fff", 0)}</radialGradient>
        </defs>
        {!bare && <rect width="64" height="64" rx="14.4" fill={`url(#${id}-tile)`} />}
        {!bare && <rect width="64" height="64" rx="14.4" fill={`url(#${id}-sheen)`} />}
        {!bare && <rect x=".4" y=".4" width="63.2" height="63.2" rx="14" fill="none" stroke="#fff" strokeOpacity=".08" strokeWidth=".8" />}
        <rect x="10.75" y="18.75" width="42.5" height="26.5" rx="12.25" fill={bare ? "none" : "#050506"} stroke={bare ? "var(--text)" : "#3a3a3f"} strokeOpacity={bare ? 0.8 : 1} strokeWidth={bare ? 2.2 : 0.9} />
        {!bare && <rect x="12.25" y="20.25" width="39.5" height="23.5" rx="10.75" fill="none" stroke="#fff" strokeOpacity=".06" strokeWidth=".25" />}
        {!bare && <path d="M18.75 22 H35" stroke="#fff" strokeOpacity=".16" strokeWidth="1.1" strokeLinecap="round" />}
      </svg>
      <span className="logo-core" style={layer}><svg width={size} height={size} viewBox="0 0 64 64">
        <defs>
          <radialGradient id={`${id}-eye`} cx=".5" cy=".4" r=".6">{stop("0", "#ffd27a")}{stop(".6", "#ffab2e")}{stop("1", "#e07b00")}</radialGradient>
        </defs>
        <rect x="22" y="27.4" width="4.6" height="9.25" rx="2.3" fill={`url(#${id}-eye)`} />
        <rect x="37.4" y="27.4" width="4.6" height="9.25" rx="2.3" fill={`url(#${id}-eye)`} />
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
