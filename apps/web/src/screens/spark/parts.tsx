import { useEffect } from "react";
import { motion } from "motion/react";
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

