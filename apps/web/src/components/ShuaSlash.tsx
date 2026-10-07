import { useEffect, useState, type MutableRefObject } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import { useCompanionDraft } from "../lib/companion-draft";
import "./shua-slash.css";

export type SlashCommand = { name: string; hint: string; icon: LucideIcon; run: () => void; state?: string; hidden?: boolean };
/** Handles a key from the composer while the menu is up; true when the menu used it. */
export type SlashKeys = MutableRefObject<((e: React.KeyboardEvent) => boolean) | null>;

/** Which commands a draft like "/mo" asks for: a lone slash-word, nothing after it. */
export function slashMatches(draft: string, commands: SlashCommand[]): SlashCommand[] {
  const m = /^\/(\w*)$/.exec(draft.trim());
  if (!m) return [];
  const q = m[1]!.toLowerCase();
  return commands.filter((c) => !c.hidden && c.name.startsWith(q));
}

/**
 * Shua's slash menu: type "/" in the composer for the conversation's controls (/model, /new, /voice …). It subscribes to
 * the draft itself, so typing re-renders only this menu, never the whole conversation.
 */
export function ShuaSlash({ commands, keys }: { commands: SlashCommand[]; keys: SlashKeys }) {
  const [draft, setDraft] = useCompanionDraft(), reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0), [dismissed, setDismissed] = useState<string | null>(null);
  const list = dismissed === draft ? [] : slashMatches(draft, commands);
  const active = Math.min(index, Math.max(0, list.length - 1));
  const query = draft.trim();
  useEffect(() => setIndex(0), [query]);
  const pick = (c: SlashCommand) => { setDraft(""); c.run(); };
  keys.current = list.length ? (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => (Math.min(i, list.length - 1) + (e.key === "ArrowDown" ? 1 : list.length - 1)) % list.length);
      return true;
    }
    if ((e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) || (e.key === "Tab" && !e.shiftKey)) { e.preventDefault(); pick(list[active]!); return true; }
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setDismissed(draft); return true; }
    return false;
  } : null;
  return <AnimatePresence>{list.length > 0 && (
    <motion.div className="shua-slash" role="listbox" aria-label="Shua commands" id="shua-slash"
      initial={reduceMotion ? false : { opacity: 0, y: 6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.98, transition: { duration: 0.12 } }}
      transition={{ type: "spring", stiffness: 620, damping: 38, mass: 0.6 }}>
      <header><span>Commands</span><kbd>↑↓</kbd><kbd>↵</kbd><kbd>esc</kbd></header>
      {list.map((c, i) => (
        <button key={c.name} type="button" role="option" aria-selected={i === active} className={i === active ? "is-active" : ""}
          onPointerEnter={() => setIndex(i)} onMouseDown={(e) => e.preventDefault() /* keep the composer focused */} onClick={() => pick(c)}>
          {i === active && <motion.i className="shua-slash-hl" layoutId="shua-slash-hl" aria-hidden transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 700, damping: 44, mass: 0.5 }} />}
          <span className="shua-slash-icon"><c.icon size={14} /></span>
          <b>/{c.name}</b><span className="shua-slash-hint">{c.hint}</span>{c.state && <em>{c.state}</em>}
        </button>
      ))}
    </motion.div>
  )}</AnimatePresence>;
}
