import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { useLive } from "../lib/live";
import { usePower } from "../lib/power";
import { newWins } from "../lib/wins";
import "./wins.css";

/** A small, optional celebration when a session you started finishes. Off by default (Settings → Power). */
export function WinsHost() {
  const { wins, winSound } = usePower();
  const runs = useLive((s) => s.crew.runs);
  const seen = useRef<Map<string, string> | null>(null);
  const [burst, setBurst] = useState<{ key: number; title: string } | null>(null);
  useEffect(() => {
    const { wins: fresh, next } = newWins(seen.current, runs);
    seen.current = next;
    if (wins === "off" || !fresh.length) return;
    setBurst({ key: Date.now(), title: fresh.length > 1 ? `${fresh.length} sessions finished` : fresh[0]!.title });
    if (winSound) chime();
  }, [runs, wins, winSound]);
  useEffect(() => { if (!burst) return; const t = setTimeout(() => setBurst(null), 2600); return () => clearTimeout(t); }, [burst]);
  if (!burst || wins === "off") return null;
  const n = wins === "party" ? 28 : 12;
  return <div className={`wins wins-${wins}`} key={burst.key} role="status" aria-live="polite">
    <div className="wins-sparks" aria-hidden="true">{Array.from({ length: n }, (_, i) => <i key={i} style={{ "--a": `${(360 / n) * i}deg`, "--d": `${60 + ((i * 37) % 70)}px`, "--h": `${(i * 47) % 360}` } as React.CSSProperties} />)}</div>
    <span className="wins-toast"><Check size={13} /> {burst.title}</span>
  </div>;
}

let audio: AudioContext | null = null;
function chime() {
  try {
    audio ??= new AudioContext();
    const t = audio.currentTime;
    for (const [i, f] of [659.25, 987.77].entries()) {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0, t + i * 0.09); g.gain.linearRampToValueAtTime(0.08, t + i * 0.09 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.5);
      o.connect(g).connect(audio.destination); o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.55);
    }
  } catch { /* no audio device: silent */ }
}
