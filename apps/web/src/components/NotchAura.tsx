import { useEffect, useRef } from "react";
import { voiceEnvelope } from "../lib/voice-envelope";
import "./notch-aura.css";

export function NotchAura({ speaking, listening, processing, level }: { speaking: boolean; listening: boolean; processing: boolean; level: () => number }) {
  const host = useRef<HTMLDivElement>(null), source = useRef(level);
  source.current = level;
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let energy = 0, frame = 0, last = performance.now();
    element.style.setProperty("--voice-energy", "0");
    if (!speaking && !listening) return;
    const tick = (now: number) => {
      // Match the display clock, cap DOM writes at 30Hz, and let RAF sleep in hidden windows.
      if (now - last >= 32) {
        const raw = source.current();
        const target = Number.isFinite(raw) ? Math.min(1, Math.sqrt(Math.max(0, raw)) * 3) : 0;
        energy = voiceEnvelope(energy, target, now - last); last = now;
        element.style.setProperty("--voice-energy", energy.toFixed(3));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [speaking, listening]);
  return <div ref={host} className={`notch-aura ${speaking ? "is-speaking" : listening ? "is-listening" : processing ? "is-thinking" : "is-idle"}`} aria-hidden="true"><i /><i /><i /><b /></div>;
}
