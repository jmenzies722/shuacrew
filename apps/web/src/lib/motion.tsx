/**
 * The app's motion: small, quick and purposeful. Everything here stands down when the Mac's
 * "Reduce motion" setting is on.
 */
import { useEffect, useRef, useState } from "react";
import { useLive } from "./live";
import { SPRING } from "./spring-easing";
import { ShuaMark } from "../components/Mark";

export const reduced = () => typeof document !== "undefined" && document.documentElement.dataset.motion === "reduced";

/**
 * The ShuaCrew mark on its tile (see components/Mark.tsx): the app icon's drawing, at any size. `bare` drops the tile
 * for inline use; `spin` lets the dot breathe while the crew is working.
 */
export function LogoMark({ size = 56, spin = true, bare = false }: { size?: number; spin?: boolean; bare?: boolean }) {
  const working = useLive((s) => spin && Object.values(s.crew.runs).some((r) => r.status === "running" || r.status === "planning"));
  const waiting = useLive((s) => Object.keys(s.crew.approvals).length > 0);
  return <ShuaMark size={size} tile={!bare} tone={waiting ? "wait" : working ? "live" : "idle"} />;
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
