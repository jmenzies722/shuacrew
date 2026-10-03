import { useEffect, useRef } from "react";
import { voiceEnvelope } from "../lib/notch-lesson";
import "./notch-aura.css";

export function NotchAura({ speaking, listening, processing, level }: { speaking: boolean; listening: boolean; processing: boolean; level: () => number }) {
  const host = useRef<HTMLDivElement>(null), source = useRef(level);
  source.current = level;
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let energy = 0;
    element.style.setProperty("--voice-energy", "0");
    if (!speaking && !listening) return;
    const timer = setInterval(() => {
      energy = voiceEnvelope(energy, source.current(), true);
      element.style.setProperty("--voice-energy", energy.toFixed(3));
    }, 50);
    return () => clearInterval(timer);
  }, [speaking, listening]);
  return <div ref={host} className={`notch-aura ${speaking ? "is-speaking" : listening ? "is-listening" : processing ? "is-thinking" : "is-idle"}`} aria-hidden="true"><i /><i /><i /><b /></div>;
}
