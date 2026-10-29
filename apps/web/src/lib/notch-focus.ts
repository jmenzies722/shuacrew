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
  /** Local hour, 0–23. */
  hour: number;
}

export interface Focus {
  text: string;
  sub?: string;
  /** What tapping the chip asks Shua to do. Absent: no chip. */
  ask?: string;
  tone: "needs" | "live" | "done" | "calm";
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
