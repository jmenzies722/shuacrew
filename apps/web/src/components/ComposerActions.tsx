import { ArrowUp, Square } from "lucide-react";

/** Shared controls for the conversation and notch quick ask. */
export function ComposerActions({ draft, active, onStop, compact = false, tabIndex }: {
  draft: string; active: boolean; onStop: () => void; compact?: boolean; tabIndex?: number;
}) {
  return <span className="composer-actions">
    {active && <button type="button" className={compact ? "is-stop" : "buddy-send is-stop"} tabIndex={tabIndex} aria-label="Stop" title="Stop (Esc)" onClick={onStop}><Square size={compact ? 11 : 13} fill="currentColor" /></button>}
    {(!active || !!draft.trim()) && <button type="submit" className={compact ? undefined : "buddy-send"} tabIndex={tabIndex} disabled={!draft.trim()} aria-label="Send" title="Send (Enter)"><ArrowUp size={compact ? 14 : 16} /></button>}
  </span>;
}
