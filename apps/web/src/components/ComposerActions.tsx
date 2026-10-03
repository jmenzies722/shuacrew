import { ArrowUp, Square } from "lucide-react";
import { useCompanionDraft } from "../lib/companion-draft";

/**
 * Shared controls for the conversation and notch quick ask. They read the draft themselves, so typing re-renders
 * these buttons and the text box — not the whole notch (measured: 29 ms → 10 ms a keystroke on a busy CPU).
 */
export function ComposerActions({ draft: given, active, onStop, compact = false, tabIndex }: {
  /** Normally read from the shared draft; pass it to render a specific text (tests, previews). */
  draft?: string; active: boolean; onStop: () => void; compact?: boolean; tabIndex?: number;
}) {
  const [stored] = useCompanionDraft();
  const draft = given ?? stored;
  return <span className="composer-actions">
    {active && <button type="button" className={compact ? "is-stop" : "buddy-send is-stop"} tabIndex={tabIndex} aria-label="Stop" title="Stop (Esc)" onClick={onStop}><Square size={compact ? 11 : 13} fill="currentColor" /></button>}
    {(!active || !!draft.trim()) && <button type="submit" className={compact ? undefined : "buddy-send"} tabIndex={tabIndex} disabled={!draft.trim()} aria-label="Send" title="Send (Enter)"><ArrowUp size={compact ? 14 : 16} /></button>}
  </span>;
}
