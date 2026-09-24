/**
 * What ShuaCrew has learned, folded from the log like everything else. Nothing here is stored on
 * its own: a lesson is a `lesson.learned` fact, its confidence moves with the outcomes of the runs
 * it was injected into, and forgetting is a `lesson.retired` fact. Delete the log and memory goes
 * with it; replay the log and memory comes back exactly.
 */
import type { AnyEvent } from "@shuacrew/core";

export type Origin = "correction" | "recovery" | "review" | "stated";

export interface Lesson {
  id: string;
  text: string;
  scope: "global" | "project";
  project?: string;
  origin: Origin;
  /** Where it started. */
  base: number;
  /** Where it is now, after the runs it was used in were approved or rejected. */
  confidence: number;
  learnedAt: number;
  expires?: number;
  /** The run it was learned from, for provenance. */
  from?: string;
  applied: number;
  wins: number;
  losses: number;
  retired?: string;
}

export interface Skill {
  id: string;
  name: string;
  body: string;
  from: string[];
  status: "proposed" | "accepted" | "rejected";
  at: number;
}

export interface MemoryView {
  lessons: Record<string, Lesson>;
  skills: Record<string, Skill>;
  /** Which lessons each run was given, so its review can move their confidence. */
  appliedTo: Record<string, string[]>;
  asks: Array<{ run: string; text: string; repo?: string; at: number }>;
}

export const emptyMemory = (): MemoryView => ({ lessons: {}, skills: {}, appliedTo: {}, asks: [] });

const WIN = 0.08;
const LOSS = 0.15; // one bad review costs more than one good one earns

export function applyMemory(m: MemoryView, e: AnyEvent): MemoryView {
  switch (e.kind) {
    case "lesson.learned": {
      const b = e.body;
      m.lessons[b.id] = {
        id: b.id,
        text: b.text,
        scope: b.scope,
        project: b.project,
        origin: b.origin,
        base: b.confidence,
        confidence: b.confidence,
        learnedAt: e.at,
        expires: b.expires,
        from: e.run ?? undefined,
        applied: 0,
        wins: 0,
        losses: 0,
      };
      break;
    }
    case "lesson.applied": {
      const l = m.lessons[e.body.id];
      if (!l) break;
      l.applied += 1;
      if (e.run) (m.appliedTo[e.run] ??= []).push(l.id);
      break;
    }
    case "lesson.retired": {
      const l = m.lessons[e.body.id];
      if (l) l.retired = e.body.reason || "retired";
      break;
    }
    case "review.decided": {
      for (const id of (e.run && m.appliedTo[e.run]) || []) {
        const l = m.lessons[id];
        if (!l) continue;
        if (e.body.approve) l.wins += 1;
        else l.losses += 1;
        l.confidence = clamp(l.base + l.wins * WIN - l.losses * LOSS);
      }
      break;
    }
    case "skill.proposed":
      m.skills[e.body.id] = { id: e.body.id, name: e.body.name, body: e.body.body, from: e.body.from, status: "proposed", at: e.at };
      break;
    case "skill.decided": {
      const s = m.skills[e.body.id];
      if (s) s.status = e.body.accept ? "accepted" : "rejected";
      break;
    }
    case "run.created":
      // Step and subagent runs belong to their parent; incognito runs are never learned from.
      if (e.run && !e.body.parent && !e.body.incognito) m.asks.push({ run: e.run, text: e.body.ask, repo: e.body.repo, at: e.at });
      break;
  }
  return m;
}

export const foldMemory = (events: Iterable<AnyEvent>) => {
  const m = emptyMemory();
  for (const e of events) applyMemory(m, e);
  return m;
};

const clamp = (n: number) => Math.max(0, Math.min(1, Math.round(n * 100) / 100));

/** A lesson still in force: not retired, not expired, not argued down to nothing. */
export const live = (l: Lesson, now = Date.now()) => !l.retired && (!l.expires || l.expires > now) && l.confidence >= 0.25;
