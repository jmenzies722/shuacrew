/**
 * What a lesson's ```quiz and ```cards blocks become in any reply: questions you click (feedback the moment you
 * choose, with why — retrieval with immediate feedback is what makes it stick) and flashcards you flip. Raw JSON
 * never shows; a block that doesn't parse falls back to code.
 */
import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, RotateCcw, X } from "lucide-react";
import "./quiz-block.css";

export interface QuizItem { stem: string; options: Array<{ id: string; text: string }>; answer: string[]; explain: string; why: Record<string, string> }
export interface FlashCard { front: string; back: string }

const LETTERS = "ABCDEFGH";
const text = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

/** A quiz in the shapes models write: options as strings or {id, text}; the answer as letters, indexes or the option's text. */
export function parseQuiz(code: string): QuizItem[] | null {
  let raw: unknown;
  try { raw = JSON.parse(code); } catch { return null; }
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { questions?: unknown }).questions) ? (raw as { questions: unknown[] }).questions : null;
  if (!list) return null;
  const items = list.flatMap((x): QuizItem[] => {
    const o = (x ?? {}) as Record<string, unknown>, stem = text(o.stem ?? o.question ?? o.q);
    const opts = Array.isArray(o.options ?? o.choices) ? (o.options ?? o.choices) as unknown[] : [];
    const options = opts.slice(0, 8).map((v, i) => (v && typeof v === "object" ? { id: LETTERS[i]!, text: text((v as { text?: unknown }).text) } : { id: LETTERS[i]!, text: text(v) })).filter((v) => v.text);
    if (!stem || options.length < 2) return [];
    const given = Array.isArray(o.answer) ? o.answer : [o.answer ?? o.correct];
    const answer = [...new Set(given.flatMap((a): string[] => {
      if (typeof a === "number") return options[a] ? [options[a]!.id] : [];
      const t = text(a); if (/^[A-H]$/i.test(t)) return [t.toUpperCase()];
      const hit = options.find((v) => v.text.toLowerCase() === t.toLowerCase()); return hit ? [hit.id] : [];
    }))].filter((a) => options.some((v) => v.id === a));
    if (!answer.length) return [];
    const why = o.why && typeof o.why === "object" ? Object.fromEntries(Object.entries(o.why as Record<string, unknown>).filter(([k]) => /^[A-H]$/.test(k)).map(([k, v]) => [k, text(v)])) : {};
    return [{ stem, options, answer: answer.sort(), explain: text(o.explain ?? o.explanation), why }];
  });
  return items.length ? items : null;
}

export function parseCards(code: string): FlashCard[] | null {
  let raw: unknown;
  try { raw = JSON.parse(code); } catch { return null; }
  if (!Array.isArray(raw)) return null;
  const cards = raw.flatMap((x) => { const o = (x ?? {}) as Record<string, unknown>, front = text(o.front ?? o.q), back = text(o.back ?? o.a); return front && back ? [{ front, back }] : []; });
  return cards.length ? cards : null;
}

/** The questions, each answered by clicking: one answer checks as you click it; "choose two" checks when you have two. */
export function QuizBlock({ items }: { items: QuizItem[] }) {
  const [chosen, setChosen] = useState<string[][]>(() => items.map(() => [])), reduce = useReducedMotion();
  const done = (i: number) => chosen[i]!.length === items[i]!.answer.length;
  const right = (i: number) => done(i) && [...chosen[i]!].sort().join() === items[i]!.answer.join();
  const answered = items.filter((_, i) => done(i)).length, score = items.filter((_, i) => right(i)).length;
  const pick = (i: number, id: string) => setChosen((all) => all.map((c, k) => {
    if (k !== i || done(i)) return c;
    return c.includes(id) ? c.filter((x) => x !== id) : [...c, id];
  }));
  return <div className="qb not-prose">
    <header className="qb-head"><span>Check yourself</span><em>{answered < items.length ? `${answered} of ${items.length} answered` : `${score} of ${items.length} right`}</em>
      {answered > 0 && <button type="button" onClick={() => setChosen(items.map(() => []))} aria-label="Try again"><RotateCcw size={12} /> Again</button>}</header>
    {items.map((q, i) => {
      const isDone = done(i), need = q.answer.length;
      return <motion.section key={i} className={`qb-q${isDone ? (right(i) ? " is-right" : " is-wrong") : ""}`} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 5) * 0.05 }}>
        <p className="qb-stem"><b>{i + 1}.</b> {q.stem}{need > 1 && <small> Choose {need}.</small>}</p>
        <ol className="qb-options">{q.options.map((o) => {
          const on = chosen[i]!.includes(o.id), ok = q.answer.includes(o.id);
          const state = isDone ? (ok ? "is-correct" : on ? "is-missed" : "is-other") : on ? "is-on" : "";
          return <li key={o.id}>
            <button type="button" className={`qb-option ${state}`} disabled={isDone} aria-pressed={on} onClick={() => pick(i, o.id)}>
              <span className="qb-letter">{isDone && ok ? <Check size={13} /> : isDone && on ? <X size={13} /> : o.id}</span><span>{o.text}</span>
            </button>
            {isDone && q.why[o.id] && (on || ok) && <p className="qb-why">{q.why[o.id]}</p>}
          </li>;
        })}</ol>
        {isDone && q.explain && <motion.p className="qb-explain" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }}>{right(i) ? "Right. " : `It's ${q.answer.join(" and ")}. `}{q.explain}</motion.p>}
      </motion.section>;
    })}
  </div>;
}

/** Flashcards from a lesson: tap one to see the back. */
export function CardsBlock({ cards }: { cards: FlashCard[] }) {
  const [flipped, setFlipped] = useState<Set<number>>(() => new Set());
  return <div className="qc not-prose">
    <header className="qb-head"><span>Flashcards</span><em>{cards.length} · tap to flip</em></header>
    <div className="qc-grid">{cards.map((c, i) => {
      const on = flipped.has(i);
      return <button key={i} type="button" className={`qc-card${on ? " is-back" : ""}`} aria-pressed={on}
        onClick={() => setFlipped((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })}>
        <small>{on ? "Answer" : "Question"}</small><span>{on ? c.back : c.front}</span>
      </button>;
    })}</div>
  </div>;
}
