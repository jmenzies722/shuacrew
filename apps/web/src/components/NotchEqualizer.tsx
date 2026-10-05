import { useEffect, useRef } from "react";
import { voiceEnvelope } from "../lib/voice-envelope";
import "./notch-presence.css";

/** Audio bars sample real input/output; the travelling work light is not an audio signal. */
export function NotchEqualizer({ state, readLevel, compact = false }: { state: string; readLevel?: () => number; compact?: boolean }) {
  const root = useRef<HTMLSpanElement>(null), reader = useRef(readLevel);
  reader.current = readLevel;
  const audio = state === "listening" || state === "speaking";
  const mode = audio ? state : ["thinking", "planning", "acting", "working", "preparing", "connecting"].includes(state) ? "working" : state === "failed" || state === "awaiting-approval" ? "attention" : state === "watching" ? "watching" : "idle";
  useEffect(() => {
    const bars = Array.from(root.current?.children ?? []) as HTMLElement[];
    if (!audio) { bars.forEach(bar => bar.style.removeProperty("transform")); return; }
    let frame = 0, last = performance.now(), envelope = 0;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const tick = (now: number) => {
      const raw = reader.current?.() ?? 0;
      const target = Number.isFinite(raw) ? Math.min(1, Math.sqrt(Math.max(0, raw)) * 3) : 0;
      envelope = reduced.matches || document.documentElement.dataset.motion === "reduced" ? target : voiceEnvelope(envelope, target, now - last);
      last = now;
      bars.forEach((bar, i) => { bar.style.transform = `scaleY(${0.14 + envelope * [0.38, 0.7, 1, 0.8, 0.48][i]! * 0.86})`; });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [audio]);
  const label = mode === "listening" ? "Live microphone level" : mode === "speaking" ? "Live voice level" : mode === "working" ? "Working indicator" : mode === "watching" ? "Watching your demonstration" : mode === "attention" ? "Needs your attention" : "Ready · microphone inactive";
  return <span ref={root} className={`notch-equalizer is-${mode}${compact ? " is-compact" : ""}`} role="img" aria-label={label}>
    {[0, 1, 2, 3, 4].map(i => <i key={i} style={{ animationDelay: `${i * 110}ms` }} />)}
  </span>;
}
