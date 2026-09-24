/**
 * The gateway's side of memory: keeps the folded view current, hands each fresh conversation its
 * lessons (recording which, so the review can move their confidence), writes down corrections the
 * person makes, and runs the weekly Evolve pass. Every change is a fact in the log.
 */
import { randomUUID } from "node:crypto";
import type { AnyEvent } from "@shuacrew/core";
import { applyMemory, correctionIn, foldMemory, live, recall, relevantSkills, render, runRecallEval, skillCandidates, type MemoryView } from "@shuacrew/memory";
import { Cron } from "croner";
import type { EventStore } from "./store.js";

export interface EvolveReport {
  retired: Array<{ id: string; reason: string }>;
  proposed: string[];
  eval: { precision: number; recall: number; exact: number };
  at: number;
}

export class Memory {
  view: MemoryView;
  private projects = new Map<string, string | undefined>();
  private unsubscribe: () => void;
  private weekly?: Cron;
  lastEvolve?: EvolveReport;

  constructor(private store: EventStore) {
    const events = [...store.read(0)];
    this.view = foldMemory(events);
    for (const e of events) this.track(e);
    this.unsubscribe = store.subscribe((e) => {
      applyMemory(this.view, e);
      this.track(e);
      if (e.kind === "run.followup" && e.run && e.body.by === "you") this.hear(e.run, e.body.text);
    });
  }

  private track(e: AnyEvent) {
    if (e.kind === "run.created" && e.run) this.projects.set(e.run, e.body.parent ? this.projects.get(e.body.parent) : (e.body.project ?? e.body.repo));
  }

  /** The system addendum for a conversation that is starting, or undefined when memory has nothing to add. */
  systemFor(run: string, ask: string): string | undefined {
    const created = this.store.forRun(run).find((e) => e.kind === "run.created");
    if (created?.kind === "run.created" && created.body.incognito) return undefined; // incognito: nothing in, nothing out
    const recalled = recall(this.view, ask, this.projects.get(run));
    const skills = relevantSkills(this.view, ask);
    for (const r of recalled) this.store.append("lesson.applied", { id: r.lesson.id }, { run });
    const text = render(recalled, skills);
    return text || undefined;
  }

  teach(text: string, project?: string, origin: "stated" | "correction" = "stated", run?: string): string {
    const id = `l_${randomUUID().slice(0, 8)}`;
    this.store.append(
      "lesson.learned",
      { id, text: text.trim(), scope: project ? "project" : "global", project, origin, confidence: origin === "stated" ? 0.8 : 0.6, evidence: [this.store.head] },
      { run },
    );
    return id;
  }

  retire(id: string, reason = "removed by you") {
    if (!this.view.lessons[id]) throw new Error(`no lesson ${id}`);
    this.store.append("lesson.retired", { id, reason });
  }

  decideSkill(id: string, accept: boolean) {
    if (!this.view.skills[id]) throw new Error(`no skill ${id}`);
    this.store.append("skill.decided", { id, accept });
  }

  /** A correction in a follow-up becomes a lesson for this repo — once. */
  private hear(run: string, text: string) {
    const lesson = correctionIn(text);
    if (!lesson) return;
    const project = this.projects.get(run);
    const known = Object.values(this.view.lessons).some((l) => !l.retired && l.text.toLowerCase() === lesson.toLowerCase() && l.project === project);
    if (!known) this.teach(lesson, project, "correction", run);
  }

  /**
   * Forget what stopped being true, propose skills for what keeps coming back, and check recall
   * still passes its eval. Safe to run any time; the weekly schedule is a floor, not a gate.
   */
  evolve(now = Date.now()): EvolveReport {
    const retired: EvolveReport["retired"] = [];
    for (const l of Object.values(this.view.lessons)) {
      if (l.retired || live(l, now)) continue;
      const reason = l.expires && l.expires <= now ? "expired" : `confidence fell to ${l.confidence} after ${l.losses} rejected run(s)`;
      this.store.append("lesson.retired", { id: l.id, reason });
      retired.push({ id: l.id, reason });
    }
    const proposed: string[] = [];
    for (const c of skillCandidates(this.view)) {
      const id = `s_${randomUUID().slice(0, 8)}`;
      this.store.append("skill.proposed", { id, ...c });
      proposed.push(id);
    }
    const { precision, recall, exact } = runRecallEval();
    this.lastEvolve = { retired, proposed, eval: { precision, recall, exact }, at: now };
    return this.lastEvolve;
  }

  /** Sundays at 03:00 local time. */
  schedule() {
    this.weekly = new Cron("0 3 * * 0", () => void this.evolve());
  }

  stop() {
    this.weekly?.stop();
    this.unsubscribe();
  }
}
