/**
 * The notch's one line when nothing is being said or done: the single most useful next move for you, not a greeting.
 * Pure (notchFocus) plus a small hook for the learning side, so the island can show "12 cards due" without each
 * open of the notch hitting the gateway.
 */
import { useEffect, useState } from "react";
import { api } from "./api";
import { dayGreeting } from "./greeting";

export { dayGreeting };

export interface FocusInputs {
  /** Crew actions waiting on your yes/no. */
  approvals: number;
  /** Top-level sessions running or planning now. */
  working: number;
  /** The most recent session that finished in the last two hours, if any. */
  justFinished: { id: string; title: string } | null;
  /** Spaced-review cards due today across every track. */
  due: number;
  /** The track you're weakest in, by graded answers. */
  weakest: string | null;
  /** Local hour, 0–23. */
  hour: number;
}

export interface Focus {
  text: string;
  sub?: string;
  /** What tapping the chip asks Shua to do. Absent: no chip. */
  ask?: string;
  tone: "needs" | "live" | "done" | "learn" | "calm";
}

/** Rough minutes for a review session: ~25 s a card, never "0 min". */
export const reviewMinutes = (due: number) => Math.max(1, Math.round(due * 0.4));

/** A track's name as the notch can say it: "AWS DOP-02 for AI Platform…" → "AWS DOP-02". */
export function shortTrack(name: string): string {
  const head = name.split(/\s+(?:for|in|with|to)\s+|\s*[:(—–]\s*|\s+-\s+/i)[0]!.trim();
  return head.length <= 32 ? head : `${head.slice(0, 31).trimEnd()}…`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Most urgent first: you blocking the crew, the crew working, what just landed, then getting better yourself.
 * Learning nudges stay out of the small hours; then the island just says hello.
 */
export function notchFocus(i: FocusInputs): Focus {
  if (i.approvals > 0) return { tone: "needs", text: `${plural(i.approvals, "thing")} waiting on you`, sub: i.working ? `${i.working} working` : undefined, ask: "What needs my OK right now?" };
  if (i.working > 0) return { tone: "live", text: `${plural(i.working, "session")} working`, sub: "I'll tell you when it lands", ask: "How's the crew doing?" };
  if (i.justFinished) return { tone: "done", text: `Done: ${i.justFinished.title}`, sub: "Want the short version?", ask: `What did "${i.justFinished.title}" change, in three lines?` };
  if (i.due > 0 && i.hour >= 6 && i.hour < 23) {
    const track = i.weakest ? shortTrack(i.weakest) : null;
    return { tone: "learn", text: `${plural(i.due, "card")} due`, sub: [track, `~${reviewMinutes(i.due)} min`].filter(Boolean).join(" · "), ask: track ? `Quiz me on ${track}` : "Quiz me on what's due" };
  }
  return { tone: "calm", text: dayGreeting(new Date(2000, 0, 1, i.hour)), sub: "Talk, type, or let me look" };
}

/**
 * A turn paused by a plan limit, said plainly: "claude-opus-5-5 usage window — resumes 10:50 PM" becomes
 * "I'll answer at 10:50 PM" / "Claude's usage window is full right now". Shua must never just go quiet.
 */
export function pausedLine(reason: string | undefined): { text: string; sub: string } {
  const r = reason ?? "";
  const when = /resumes\s+(.+?)\s*$/i.exec(r)?.[1];
  const who = /\bclaude\b/i.test(r) ? "Claude" : /\b(codex|gpt)\b/i.test(r) ? "Codex" : "Your model";
  const why = /usage|limit|window/i.test(r) ? `${who}'s usage window is full right now` : r || "Paused";
  return { text: when ? `I'll answer at ${when}` : "Paused for now", sub: why };
}

type Insights = { due: number; weakest: { name: string } | null };
let cache: { at: number; value: Insights } | null = null;

/** Learning's due count and weakest track, refreshed at most every 10 minutes and shared by every notch open. */
export function useLearningFocus(): Pick<FocusInputs, "due" | "weakest"> {
  const [value, setValue] = useState<Insights | null>(cache?.value ?? null);
  useEffect(() => {
    if (cache && Date.now() - cache.at < 10 * 60_000) return;
    let live = true;
    api<Insights>("/api/learning/insights")
      .then((v) => { cache = { at: Date.now(), value: v }; if (live) setValue(v); })
      .catch(() => undefined);
    return () => { live = false; };
  }, []);
  return { due: value?.due ?? 0, weakest: value?.weakest?.name ?? null };
}
