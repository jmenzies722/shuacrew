import { NotchEqualizer } from "./NotchEqualizer";
import { ArrowUpRight } from "lucide-react";
import "./notch-presence.css";

/** Fixed-height status surface: activity changes never move the composer. */
export function NotchPresence({ state, watching, app, onExpand, readLevel }: { state: string; watching: boolean; app?: string; onExpand: () => void; readLevel?: () => number }) {
  const mode = state === "failed" || state === "awaiting-approval" ? "attention" : watching ? "watching" : state === "listening" ? "listening" : state === "speaking" ? "speaking" : ["thinking", "planning", "acting", "working", "preparing", "connecting"].includes(state) ? "thinking" : "idle";
  const label = mode === "attention" ? (state === "failed" ? "Something needs attention" : "Waiting for your decision") : watching ? "Watching your demonstration" : mode === "listening" ? "Listening to you" : mode === "speaking" ? "Speaking" : mode === "thinking" ? "Working on your request" : "What’s on your mind?";
  return <div className={`notch-presence is-${mode}`}>
    <NotchEqualizer state={mode === "watching" ? "watching" : state} readLevel={readLevel} />
    <div className="notch-presence-copy"><strong>{label}</strong><small>{mode === "attention" ? "Review the details below" : watching ? app || "Switch to your task app" : mode === "idle" ? "Ask, talk, or say “watch me”" : "Your conversation stays here"}</small></div>
    <button type="button" onClick={onExpand} aria-label="Expand conversation" title="Expand conversation"><ArrowUpRight size={16} /></button>
  </div>;
}
