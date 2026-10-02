import { useEffect, useState } from "react";
import { Check, Clipboard } from "lucide-react";
import type { PasteHint } from "../lib/paste-hint";
import "./paste-chip.css";

/** "Copied — ⌘V to paste into Terminal": shown when Shua put something on the clipboard for you. */
export function PasteChip({ copyAgain }: { copyAgain: (hint: PasteHint) => void }) {
  const [hint, setHint] = useState<PasteHint | null>(null), [again, setAgain] = useState(false);
  useEffect(() => {
    let hide: ReturnType<typeof setTimeout> | undefined;
    const on = (e: Event) => {
      setHint((e as CustomEvent<PasteHint>).detail); setAgain(false);
      clearTimeout(hide); hide = setTimeout(() => setHint(null), 15_000);
    };
    window.addEventListener("shuacrew:copied", on);
    return () => { window.removeEventListener("shuacrew:copied", on); clearTimeout(hide); };
  }, []);
  if (!hint) return null;
  const preview = hint.text.split("\n")[0]!.slice(0, 48) + (hint.text.length > 48 || hint.text.includes("\n") ? "…" : "");
  return (
    <div className="paste-chip" role="status">
      <span className="paste-chip-icon">{again ? <Check size={13} /> : <Clipboard size={13} />}</span>
      <span className="paste-chip-text">
        <b>Copied</b> · press <kbd>⌘V</kbd> to paste{hint.where ? ` into ${hint.where}` : ""}
        <code title={hint.text}>{preview}</code>
      </span>
      <button type="button" onClick={() => { copyAgain(hint); setAgain(true); }}>{again ? "Copied" : "Copy again"}</button>
      <button type="button" aria-label="Dismiss" className="paste-chip-x" onClick={() => setHint(null)}>×</button>
    </div>
  );
}
