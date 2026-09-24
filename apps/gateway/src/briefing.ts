/**
 * The morning briefing: one short digest a day of what happened while you were away and what
 * needs you now. It is built from the log — no model, no usage — so it's instant, exact, and free.
 * It runs at 8:00 local time, and catches up at the next start if the Mac was asleep then.
 */
import { randomUUID } from "node:crypto";
import { Cron } from "croner";
import type { BriefingView, CrewState } from "@shuacrew/core";
import type { EventStore } from "./store.js";
import { formatMoney, NEXT } from "./ventures.js";

type Section = BriefingView["sections"][number];
type Item = Section["items"][number];

const NEXT_LABEL: Record<string, string> = {
  "validate-idea": "Validate the idea",
  "landing-page": "Build the landing page",
  mvp: "Spec and build the MVP",
  launch: "Plan the launch",
  "growth-review": "Run the weekly growth review",
};

export function localDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Compose the briefing from the current state: everything since `since`, and what's waiting now. */
export function compose(state: CrewState, now: number, since: number): Omit<BriefingView, "id" | "at" | "day"> & { day: string } {
  const sections: Section[] = [];
  const more = (items: Item[], max: number, noun: string): Item[] => (items.length > max ? [...items.slice(0, max), { text: `and ${items.length - max} more ${noun}`, tone: "idle" }] : items);

  // What needs you — first, because it's the only part that's blocking anything.
  const needs: Item[] = [];
  for (const play of Object.values(state.plays)) {
    const gate = play.phases.find((p) => p.status === "review");
    if (play.status === "waiting" && gate) needs.push({ text: `Review “${gate.name}” — ${play.title}`, href: `/plays/${play.id}`, tone: "wait" });
    if (play.status === "failed") needs.push({ text: `${play.title} stopped: ${play.reason ?? "a phase failed"}`, href: `/plays/${play.id}`, tone: "bad" });
  }
  for (const a of Object.values(state.approvals)) {
    needs.push({ text: `Allow ${a.tool}? — ${(a.run && state.runs[a.run]?.title) || "a session"}`, href: a.run ? `/sessions/${a.run}` : undefined, tone: "wait" });
  }
  for (const run of Object.values(state.runs)) {
    if (run.status === "reviewing" && !run.parent) needs.push({ text: `Review the changes in “${run.title}” (${run.files.length} file${run.files.length === 1 ? "" : "s"})`, href: `/sessions/${run.id}`, tone: "wait" });
  }
  if (needs.length) sections.push({ title: "Needs you", items: more(needs, 6, "items") });

  // What got done.
  const finished = Object.values(state.runs)
    .filter((r) => !r.parent && r.updatedAt >= since && ["done", "reviewing", "merged", "failed"].includes(r.status) && !r.labels.includes("held"))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const done: Item[] = finished.map((r) => ({
    text: r.status === "failed" ? `${r.title} — failed${r.statusReason ? `: ${r.statusReason.slice(0, 80)}` : ""}` : r.status === "merged" ? `${r.title} — merged` : r.title,
    href: `/sessions/${r.id}`,
    tone: r.status === "failed" ? "bad" : "ok",
  }));
  if (done.length) sections.push({ title: "Finished", items: more(done, 6, "sessions") });

  // What the crew made.
  const made = Object.values(state.artifacts)
    .filter((a) => a.updatedAt >= since)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((a): Item => {
      const who = a.member ? state.members[a.member]?.name : undefined;
      return { text: `${a.title}${a.version > 1 ? ` (v${a.version})` : ""}${who ? ` — ${who}` : ""}`, href: `/library#${a.id}`, tone: "live" };
    });
  if (made.length) sections.push({ title: "Saved to the Library", items: more(made, 5, "items") });

  // Each venture: its numbers, how they moved this week, and its next step.
  const ventures: Item[] = [];
  let totalMrr = 0;
  let totalDelta = 0;
  let currency = "usd";
  for (const v of Object.values(state.ventures)) {
    if (v.stage === "stopped") continue;
    const m = v.metrics;
    const weekAgo = [...v.history].reverse().find((h) => h.at <= now - 6.5 * 86_400_000 && h.mrr !== undefined);
    let line = `${v.emoji} ${v.name} · ${v.stage}`;
    if (m?.mrr !== undefined) {
      currency = m.currency;
      totalMrr += m.mrr;
      const delta = weekAgo?.mrr !== undefined ? m.mrr - weekAgo.mrr : undefined;
      if (delta !== undefined) totalDelta += delta;
      line += ` · MRR ${formatMoney(m.mrr, m.currency)}${delta ? ` (${delta > 0 ? "+" : "−"}${formatMoney(Math.abs(delta), m.currency)} this week)` : ""}`;
      if (m.customers !== undefined) line += ` · ${m.customers} customer${m.customers === 1 ? "" : "s"}`;
    }
    if (v.goalMrr && m?.mrr !== undefined) line += ` · ${Math.round((m.mrr / v.goalMrr) * 100)}% of goal`;
    ventures.push({ text: line, href: `/ventures/${v.id}`, tone: "live" });
    const next = NEXT[v.stage];
    const running = Object.values(state.plays).some((p) => p.venture === v.id && p.playbook === next?.playbook && (p.status === "running" || p.status === "waiting"));
    if (next && !running) ventures.push({ text: `Next for ${v.name}: ${NEXT_LABEL[next.playbook] ?? next.playbook}`, href: `/ventures/${v.id}`, tone: "idle" });
  }
  if (ventures.length) sections.push({ title: "Ventures", items: ventures });

  // Heads-up: a usage window that's closed.
  const limited = Object.entries(state.limited).filter(([, l]) => !l.credits && l.until > now);
  if (limited.length) {
    sections.push({ title: "Heads-up", items: limited.map(([key, l]) => ({ text: `${key} is out of usage until ${new Date(l.until).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} — work moves to another model`, tone: "wait" })) });
  }

  const parts: string[] = [];
  if (needs.length) parts.push(`${needs.length} thing${needs.length === 1 ? "" : "s"} need${needs.length === 1 ? "s" : ""} you`);
  if (finished.length) parts.push(`${finished.length} session${finished.length === 1 ? "" : "s"} finished`);
  if (made.length) parts.push(`${made.length} saved to the Library`);
  if (totalMrr) parts.push(`MRR ${formatMoney(totalMrr, currency)}${totalDelta ? ` (${totalDelta > 0 ? "+" : "−"}${formatMoney(Math.abs(totalDelta), currency)} this week)` : ""}`);
  return { day: localDay(now), since, headline: parts.length ? parts.join(" · ") : "All quiet — nothing waiting on you", sections };
}

export class Briefing {
  private cron?: Cron;

  constructor(
    private store: EventStore,
    private state: () => CrewState,
    private at = "0 8 * * *",
  ) {}

  /** Make today's briefing now (or again), from everything since the last one. */
  create(now = Date.now()): BriefingView {
    const last = this.state().briefing;
    const since = last && last.day !== localDay(now) ? last.at : Math.min(last?.since ?? Infinity, now - 24 * 3_600_000);
    const body = compose(this.state(), now, since);
    this.store.append("briefing.created", { id: `b_${randomUUID().slice(0, 8)}`, ...body });
    return this.state().briefing!;
  }

  /** Daily at 8:00 local; and if today's was missed (asleep, off), make it at start. */
  schedule(now = Date.now()) {
    this.cron = new Cron(this.at, () => void this.create());
    const due = new Date(now);
    due.setHours(8, 0, 0, 0);
    if (now >= due.getTime() && this.state().briefing?.day !== localDay(now)) this.create(now);
  }

  stop() {
    this.cron?.stop();
  }
}

export { NEXT };
