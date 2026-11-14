/**
 * The Inbox: everything that is waiting on you, in one list, worked out from the log. Nothing is stored for it, so
 * it can never disagree with the sessions it describes; an item disappears when the thing it is about changes.
 *
 * In order of how much it blocks:
 *   approval     an agent stopped to ask before doing something
 *   failed       a session stopped with an error
 *   failing      a session finished but its last check fails
 *   unverified   a session changed code and nothing checked it
 *   race         a race ended with no clear winner: your call
 *   review       a reviewer's reply could not be read as a verdict
 *   note         Shua suggests adding something to what it knows about you
 *   ready        a session is verified and waiting for you to merge it
 */
import type { CrewState, RunView } from "./projections.js";

export type InboxKind = "approval" | "failed" | "failing" | "unverified" | "race" | "review" | "note" | "ready";
export interface InboxItem {
  /** Stable while the thing it describes is unchanged: `${kind}:${subject}`. */
  id: string;
  kind: InboxKind;
  title: string;
  detail: string;
  /** The session to open. */
  run?: string;
  at: number;
  tone: "wait" | "bad" | "idle" | "ok";
  /** For a suggested note: what would be added, and where. */
  note?: { id: string; file: string; text: string };
}

const ORDER: InboxKind[] = ["approval", "failed", "failing", "unverified", "race", "review", "note", "ready"];
const DAY = 86_400_000;
/** Sessions that are not yours to act on: Shua's own conversation, a reviewer's session, a task's parent. */
const HIDDEN = new Set(["buddy", "learning", "review", "held"]);

function mine(run: RunView): boolean {
  return !run.parent && !run.labels.some((l) => HIDDEN.has(l)) && !(run as { archived?: boolean }).archived;
}

export function inbox(state: CrewState, now = Date.now()): InboxItem[] {
  const items: InboxItem[] = [];
  for (const a of Object.values(state.approvals)) {
    const run = a.run ? state.runs[a.run] : undefined;
    items.push({ id: `approval:${a.id}`, kind: "approval", title: `Allow ${a.tool}?`, detail: [run?.title, a.reason].filter(Boolean).join(" · "), run: a.run ?? undefined, at: a.at, tone: "wait" });
  }
  const races = new Set<string>();
  for (const run of Object.values(state.runs)) {
    if (!mine(run) || now - run.updatedAt > 7 * DAY) continue;
    const at = run.updatedAt, atRest = run.status === "reviewing" || run.status === "done";
    if (run.status === "failed") {
      if (now - at <= 3 * DAY) items.push({ id: `failed:${run.id}`, kind: "failed", title: run.title, detail: run.statusReason?.split("\n")[0] || "Stopped with an error.", run: run.id, at, tone: "bad" });
    } else if (atRest && run.verification?.state === "failing") {
      items.push({ id: `failing:${run.id}`, kind: "failing", title: run.title, detail: `${run.verification.command ?? "A check"} fails after its last edit.`, run: run.id, at, tone: "bad" });
    } else if (atRest && run.verification?.state === "unverified") {
      items.push({ id: `unverified:${run.id}`, kind: "unverified", title: run.title, detail: "It changed code and nothing checked it.", run: run.id, at, tone: "wait" });
    } else if (atRest && run.race?.outcome === "open") {
      if (!races.has(run.race.id)) { races.add(run.race.id); items.push({ id: `race:${run.race.id}`, kind: "race", title: run.title.replace(/^Race · [^·]+ · /, "Race: "), detail: run.race.reason ?? "No clear winner.", run: run.id, at, tone: "wait" }); }
    } else if (atRest && run.reviewPass?.state === "unclear") {
      items.push({ id: `review:${run.id}`, kind: "review", title: run.title, detail: "The reviewer's reply gave no clear verdict. Read it and decide.", run: run.reviewPass.run, at, tone: "idle" });
    } else if (run.status === "reviewing" && run.verification?.state === "verified" && run.race?.outcome !== "lost") {
      items.push({ id: `ready:${run.id}`, kind: "ready", title: run.title, detail: `Verified${run.verification.command ? ` by ${run.verification.command}` : ""}${run.reviewPass?.state === "passed" ? ", review passed" : ""}. Ready for you to merge.`, run: run.id, at, tone: "ok" });
    }
  }
  for (const n of Object.values(state.suggestions ?? {})) {
    items.push({ id: `note:${n.id}`, kind: "note", title: `Add to ${n.file}?`, detail: n.why || n.text.split("\n")[0]!, run: n.run ?? undefined, at: n.at, tone: "idle", note: { id: n.id, file: n.file, text: n.text } });
  }
  // What blocks most comes first; within a kind, approvals oldest first (they have waited longest), the rest newest first.
  return items.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || (a.kind === "approval" ? a.at - b.at : b.at - a.at));
}

/** How many items need a decision (everything except "ready", which is good news). */
export function inboxCount(items: InboxItem[]): number {
  return items.filter((i) => i.kind !== "ready").length;
}
