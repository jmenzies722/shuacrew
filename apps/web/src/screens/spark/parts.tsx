import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { waveBars } from "../../lib/wave";
import { getMicLevel, setMicLevel, subscribeMicLevel } from "../../lib/mic-level";
export { getMicLevel, setMicLevel };
import { motion } from "motion/react";
import { formatLeft, remaining } from "../../lib/timers";
import { SparkCharacter } from "../../components/SparkCharacter";
import type { useCompanion } from "../../lib/companion";
import type { GuideStep } from "../../lib/buddy";

/** The fn quick card: just what matters right now, beside your pointer. Idle for a while, it tucks itself away. */
export function MiniCard({ name, prefs, mood, state, heard, guide, reply, onCheck, onStopGuide, onOpen, onClose }: {
  name: string; prefs: ReturnType<typeof useCompanion>; mood: Parameters<typeof SparkCharacter>[0]["mood"]; state: "listening" | "thinking" | "speaking" | "ready";
  heard: string; guide: GuideStep | null; reply: string; onCheck: () => void; onStopGuide: () => void; onOpen: () => void; onClose: () => void;
}) {
  const quiet = state === "ready" && !guide;
  useEffect(() => { if (!quiet) return; const t = setTimeout(onClose, 20_000); return () => clearTimeout(t); }, [quiet, reply]);
  const label = { listening: "Listening… let go of fn to send", thinking: "Thinking…", speaking: "Speaking", ready: `Hold fn to ask ${name}` }[state];
  return <motion.div className={`spk-mini-card is-${state}`} role="dialog" aria-label={`${name} quick view`} initial={{ opacity: 0, y: 8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 460, damping: 34 }}>
    <header><span className="spk-mini-face"><SparkCharacter preferences={prefs} mood={mood} size={26} crop="portrait" /></span><b>{name}</b><small>{label}</small>
      <button type="button" aria-label="Close" onClick={onClose}>×</button></header>
    {state === "listening" ? <p className="spk-mini-live">{heard || "…"}</p>
      : guide ? <div className="spk-mini-step"><span>Step {guide.step}</span><p>{guide.label}</p><div><button type="button" className="is-go" onClick={onCheck}>Done, next</button><button type="button" onClick={onStopGuide}>Stop</button></div></div>
      : reply ? <p>{reply}</p>
      : <p className="spk-mini-hint">Ask anything about what you're doing. If it's something to click through, I'll show you one step at a time.</p>}
    <footer><button type="button" onClick={onOpen}>Open chat</button></footer>
  </motion.div>;
}

/** A small live meter: bars that follow your voice while listening, and Spark's while it speaks. */
export function VoiceBars({ level, active }: { level: number; active: boolean }) {
  return <span className={`spk-bars ${active ? "is-on" : ""}`} aria-hidden="true">{[0.55, 1, 0.75, 0.9, 0.5].map((k, i) => <i key={i} style={{ transform: `scaleY(${active ? Math.max(0.18, Math.min(1, level * 1.6 * k + 0.12 * (i % 2))) : 0.18})` }} />)}</span>;
}

/**
 * The mic level lives outside React state: it changes ~23 times a second while the mic is open, and as state it
 * re-rendered all of Spark (chat, notch, activities) every time. Now only the meters that show it update.
 */
export function useMicLevel() { return useSyncExternalStore(subscribeMicLevel, getMicLevel, getMicLevel); }
/** Bars fed straight from the mic; `floor` keeps them moving gently while Spark talks. */
export function MicBars({ floor = 0 }: { floor?: number }) { const level = useMicLevel(); return <VoiceBars level={Math.max(level, floor)} active />; }
/** Keeps a `--lvl` CSS variable on an element in step with the mic, without re-rendering anything. */
export function useMicLevelVar(ref: RefObject<HTMLElement | null>) {
  useEffect(() => { const on = () => ref.current?.style.setProperty("--lvl", String(getMicLevel())); on(); return subscribeMicLevel(on); }, [ref]);
}


/**
 * The notch's waveform while you talk: 17 bars moving with your voice (lib/wave). It animates itself — each frame
 * writes the bars' scale straight to the DOM — so nothing else in Spark re-renders 60 times a second.
 */
export function NotchWave({ bars = 17 }: { bars?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const still = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, level = 0, last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      level += (getMicLevel() - level) * (1 - Math.exp(-dt / 0.07));
      const h = waveBars(level, still ? 0 : now / 1000, bars);
      for (let i = 0; i < el.children.length; i++) (el.children[i] as HTMLElement).style.transform = `scaleY(${h[i]!.toFixed(3)})`;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [bars]);
  return <span className="notch-wave" ref={ref} role="img" aria-label="Listening">{Array.from({ length: bars }, (_, i) => <i key={i} />)}</span>;
}

/** Working on what you said: the bars become a wave travelling through them, in the theme's accent. */
export function ThinkWave() {
  return <span className="spk-think" role="status" aria-label="Working on it">{[0, 1, 2, 3, 4].map((i) => <i key={i} style={{ animationDelay: `${i * 0.11}s` }} />)}</span>;
}

/** A soft three-note chime for a timer or alarm (Web Audio: no file, plays over whatever else is on). */
export function chime(times = 2) {
  try {
    const ctx = new AudioContext(), t0 = ctx.currentTime + 0.05;
    for (let r = 0; r < times; r++) [880, 1175, 1568].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), at = t0 + r * 1.1 + i * 0.16;
      o.type = "sine"; o.frequency.value = f; g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.18, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.9);
      o.connect(g).connect(ctx.destination); o.start(at); o.stop(at + 1);
    });
    setTimeout(() => void ctx.close(), (times * 1.1 + 1.2) * 1000);
  } catch { /* no audio: the spoken line and the notification still happen */ }
}

/** A timer's time left, ticking every second on its own — the rest of Spark doesn't re-render for it. */
export function TimeLeft({ t }: { t: import("../../lib/timers").Timer }) {
  const [, tick] = useState(0);
  useEffect(() => { if (t.paused !== undefined) return; const i = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(i); }, [t.paused]);
  return <>{formatLeft(remaining(t, Date.now()))}</>;
}
