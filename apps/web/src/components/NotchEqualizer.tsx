import { useEffect, useRef } from "react";
import { voiceEnvelope } from "../lib/voice-envelope";
import { onNextMusicLevels } from "../lib/music-meter";
import "./notch-presence.css";

/**
 * Audio bars sample real input/output; the travelling work light is not an audio signal.
 * Music: each bar is one frequency band of what's playing (low → high), measured by the Mac app. Without real levels
 * (no Audio Recording permission) it shows a calm "playing" motion instead, labelled as such — never fake data.
 */
export function NotchEqualizer({ state, readLevel, readBands, compact = false, external = false }: { state: string; readLevel?: () => number; readBands?: () => readonly number[] | null; compact?: boolean; external?: boolean }) {
  const root = useRef<HTMLSpanElement>(null), reader = useRef(readLevel), bandReader = useRef(readBands);
  reader.current = readLevel; bandReader.current = readBands;
  const audio = state === "listening" || state === "speaking";
  // `external`: the Mac app is drawing these bars natively right over this spot (the resting notch); draw nothing.
  const music = state === "music" && !external;
  const mode = audio ? state : state === "music" ? "music" : state === "music-ambient" ? "music-ambient" : ["thinking", "planning", "acting", "working", "preparing", "connecting"].includes(state) ? "working" : state === "failed" || state === "awaiting-approval" ? "attention" : state === "watching" ? "watching" : "idle";
  useEffect(() => {
    const bars = Array.from(root.current?.children ?? []) as HTMLElement[];
    if (!audio && !music) { bars.forEach(bar => bar.style.removeProperty("transform")); return; }
    let frame = 0, last = performance.now(), envelope = 0, sleeping: (() => void) | undefined;
    const each = bars.map(() => 0);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const tick = (now: number) => {
      const still = reduced.matches || document.documentElement.dataset.motion === "reduced";
      const dt = now - last; last = now;
      if (music) {
        const bands = bandReader.current?.() ?? null;
        bars.forEach((bar, i) => {
          const target = bands ? bands[i] ?? 0 : 0;
          // Snappier than a voice: a kick lands in ~one frame and falls away over ~0.1 s, like a real meter.
          each[i] = still ? target : each[i]! + (target - each[i]!) * (1 - Math.exp(-Math.max(0, dt) / (target > each[i]! ? 18 : 110)));
          if (!bands && each[i]! < 0.002) each[i] = 0;
          bar.style.transform = `scaleY(${(0.12 + each[i]! * 0.88).toFixed(3)})`;
        });
        // Nothing new and the bars have settled (paused, silent, between songs): stop drawing entirely and sleep
        // until the next levels arrive — an idle frame loop kept the whole notch rendering 60×/s.
        if (!bands && each.every(v => v === 0)) { frame = 0; sleeping = onNextMusicLevels(() => { sleeping = undefined; last = performance.now(); frame = requestAnimationFrame(tick); }); return; }
      } else {
        const raw = reader.current?.() ?? 0;
        const target = Number.isFinite(raw) ? Math.min(1, Math.sqrt(Math.max(0, raw)) * 3) : 0;
        envelope = still ? target : voiceEnvelope(envelope, target, dt);
        bars.forEach((bar, i) => { bar.style.transform = `scaleY(${0.14 + envelope * [0.38, 0.7, 1, 0.8, 0.48][i]! * 0.86})`; });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); sleeping?.(); };
  }, [audio, music]);
  const label = mode === "listening" ? "Live microphone level" : mode === "speaking" ? "Live voice level" : mode === "music" ? "Live music levels" : mode === "music-ambient" ? "Music playing" : mode === "working" ? "Working indicator" : mode === "watching" ? "Watching your demonstration" : mode === "attention" ? "Needs your attention" : "Ready · microphone inactive";
  return <span ref={root} className={`notch-equalizer is-${mode}${compact ? " is-compact" : ""}${external && state === "music" ? " is-external" : ""}`} role="img" aria-label={label}>
    {[0, 1, 2, 3, 4].map(i => <i key={i} style={{ animationDelay: `${i * 110}ms` }} />)}
  </span>;
}
