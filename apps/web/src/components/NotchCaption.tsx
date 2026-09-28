import { useEffect, useRef, useState } from "react";

/**
 * Live captions in the notch: what Spark is saying, word by word, as it says it. Each sentence arrives the moment its
 * sound starts (SpeechQueue.onCaption); words then light up at speaking pace, and the last sentence stays above, dimmed,
 * so the chain reads like a transcript scrolling past rather than a box that swaps text.
 */
const CHARS_PER_SEC = 14.5; // roughly the local voices' pace at speed 1; each sentence re-syncs on its first sound
/** When each word should appear (ms from the sentence's first sound), with a beat after commas and full stops. */
export function revealTimes(text: string, speed = 1): number[] {
  const words = text.split(/\s+/).filter(Boolean), out: number[] = [];
  let t = 0;
  for (const w of words) {
    out.push(Math.round(t));
    t += ((w.length + 1) / (CHARS_PER_SEC * speed)) * 1000 + (/[.!?]$/.test(w) ? 260 : /[,;:]$/.test(w) ? 120 : 0);
  }
  return out;
}

interface Said { id: number; text: string; speed: number }
export function NotchCaption({ line }: { line: { text: string; speed: number } | null }) {
  const [chain, setChain] = useState<Said[]>([]), [shown, setShown] = useState(0), seq = useRef(0);
  useEffect(() => {
    if (!line) { const t = setTimeout(() => setChain([]), 700); return () => clearTimeout(t); } // after the island tucks away
    const id = ++seq.current;
    setChain((c) => [...c.slice(-1), { id, ...line }]); setShown(0);
    const timers = revealTimes(line.text, line.speed).map((at, i) => setTimeout(() => setShown(i + 1), at));
    return () => timers.forEach(clearTimeout);
  }, [line]);
  if (!chain.length) return null;
  const current = chain.at(-1)!, words = current.text.split(/\s+/).filter(Boolean);
  return <div className="notch-caption" aria-live="polite">
    {chain.length > 1 && <p key={chain[0]!.id} className="notch-caption-past">{chain[0]!.text}</p>}
    <p key={current.id} className="notch-caption-now">{words.map((w, i) => <span key={i} className={i < shown ? "is-said" : ""}>{w} </span>)}</p>
  </div>;
}
