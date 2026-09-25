import { useEffect, useRef } from "react";
import type { RunView } from "@shuacrew/core/projections";
import { useLive } from "../lib/live";
import { useLook } from "../lib/look";

export type SoundKind = "approval" | "done" | "failed";
const NOTES: Record<SoundKind, number[]> = { approval: [880, 880], done: [659.25, 987.77], failed: [392, 311.13] };
let audio: AudioContext | null = null;
/** A short synthesized cue — no audio files, nothing downloaded. */
export function playSound(kind: SoundKind, volume: number) {
  try {
    audio ??= new AudioContext();
    const t = audio.currentTime, peak = Math.max(0.0002, Math.min(1, volume) * 0.16);
    NOTES[kind].forEach((f, i) => {
      const o = audio!.createOscillator(), g = audio!.createGain(), at = t + i * (kind === "approval" ? 0.14 : 0.1);
      o.type = kind === "failed" ? "triangle" : "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(peak, at + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.45);
      o.connect(g).connect(audio!.destination); o.start(at); o.stop(at + 0.5);
    });
  } catch { /* no audio device */ }
}

/** Plays your chosen cues for live changes only: a new approval, or a session of yours finishing or failing. */
export function SoundsHost() {
  const { sounds } = useLook();
  const runs = useLive((s) => s.crew.runs), approvals = useLive((s) => s.crew.approvals);
  const seenRuns = useRef<Map<string, string> | null>(null), seenApprovals = useRef<Set<string> | null>(null);
  useEffect(() => {
    const prev = seenRuns.current;
    seenRuns.current = new Map(Object.values(runs).map((r: RunView) => [r.id, r.status]));
    if (!prev) return;
    const changed = Object.values(runs).filter((r) => !r.parent && prev.has(r.id) && prev.get(r.id) !== r.status);
    if (sounds.failed && changed.some((r) => r.status === "failed")) playSound("failed", sounds.volume);
    else if (sounds.done && changed.some((r) => r.status === "done" || r.status === "merged")) playSound("done", sounds.volume);
  }, [runs, sounds]);
  useEffect(() => {
    const prev = seenApprovals.current, ids = Object.keys(approvals);
    seenApprovals.current = new Set(ids);
    if (prev && sounds.approval && ids.some((id) => !prev.has(id))) playSound("approval", sounds.volume);
  }, [approvals, sounds]);
  return null;
}
