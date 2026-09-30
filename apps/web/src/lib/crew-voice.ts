/**
 * Spark as the voice of the crew (the "Jarvis" bridge): what the crew is doing and what's waiting on you, in a form
 * Spark can act on by voice — answer an approval, stop a session, open one — and a spoken heads-up the moment crew
 * work finishes. Short refs (A1, S1) stand in for real ids so Spark never has to read or say one.
 */

export interface CrewRun { id: string; title: string; status: string; member?: string; labels?: string[]; reason?: string }
export interface CrewApproval { id: string; run: string | null; tool: string; input: unknown; risk: string }

const ACTIVE = new Set(["queued", "planning", "running", "awaiting_approval", "paused"]);
/** A1 → approval id, S1 → run id: rebuilt each time Spark is told about the crew. */
const refs = new Map<string, string>();
/** The real id behind a ref Spark used (A1, S2), or the text itself if it already was an id. */
export const crewRef = (ref: string) => refs.get(ref.trim().toUpperCase()) ?? ref.trim();

/** What a waiting tool call would do, in a few words: the command, the file, or the tool's input. */
export function whatItDoes(tool: string, input: unknown): string {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const pick = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : "");
  const text = pick("command") || pick("file_path") || pick("path") || pick("url") || pick("query") || JSON.stringify(input ?? "");
  return `${tool.replace(/^mcp__[^_]+__/, "")}: ${text.replace(/\s+/g, " ").slice(0, 90)}`;
}

/** The crew right now, for Spark's instructions: what's waiting on you, what's working, what's ready for review. */
export function crewDetail(runs: Record<string, CrewRun>, approvals: Record<string, CrewApproval>, names: Record<string, string> = {}): string {
  refs.clear();
  const crew = Object.values(runs).filter((r) => !r.labels?.includes("buddy"));
  const who = (r?: CrewRun) => (r?.member ? names[r.member] ?? r.member : "the crew");
  const out: string[] = [];
  const waiting = Object.values(approvals).slice(0, 6).map((a, i) => {
    const ref = `A${i + 1}`, run = a.run ? runs[a.run] : undefined; refs.set(ref, a.id);
    return `${ref} — ${who(run)} wants ${whatItDoes(a.tool, a.input)}${run ? ` in “${run.title}”` : ""} (risk ${a.risk})`;
  });
  if (waiting.length) out.push(`WAITING ON YOU: ${waiting.join(" · ")}`);
  let n = 0;
  const session = (r: CrewRun, note: string) => { const ref = `S${++n}`; refs.set(ref, r.id); return `${ref} “${r.title.slice(0, 60)}” (${who(r)}${note ? `, ${note}` : ""})`; };
  const working = crew.filter((r) => ACTIVE.has(r.status)).slice(0, 6).map((r) => session(r, r.status.replace("_", " ")));
  if (working.length) out.push(`WORKING: ${working.join(" · ")}`);
  const review = crew.filter((r) => r.status === "reviewing").slice(0, 4).map((r) => session(r, "ready for review"));
  if (review.length) out.push(`READY FOR REVIEW: ${review.join(" · ")}`);
  return out.join("\n");
}

/** How Spark is told to run the crew by voice (part of its instructions). */
export const CREW_CONTROL = [
  "RUNNING THE CREW (you're its voice): answer an approval they decide on — ```do [{\"type\":\"crew_decide\",\"ref\":\"A1\",\"allow\":true}]``` (allow false to decline);",
  "stop a session ```do [{\"type\":\"crew_stop\",\"ref\":\"S1\"}]```; show one ```do [{\"type\":\"crew_open\",\"ref\":\"S1\"}]```.",
  "Only refs listed above, only when they say so (\"approve it\", \"stop the dark-mode one\"); if it's unclear which, ask. Say it like a teammate: \"Approved — Eli's running the tests.\" Never read refs or ids aloud.",
].join(" ");

/**
 * Crew work that just finished, as spoken lines: compares each run's last status with its new one. Only real crew
 * work (not Spark's own turns), only the moment it leaves active work.
 */
export function crewFinished(before: Record<string, string>, runs: Record<string, CrewRun>, names: Record<string, string> = {}): Array<{ ok: boolean; line: string }> {
  const out: Array<{ ok: boolean; line: string }> = [];
  for (const r of Object.values(runs)) {
    const was = before[r.id];
    if (!was || !ACTIVE.has(was) || ACTIVE.has(r.status) || r.labels?.includes("buddy")) continue;
    const who = r.member ? names[r.member] ?? "The crew" : "The crew", title = `“${r.title.slice(0, 60)}”`;
    if (r.status === "reviewing") out.push({ ok: true, line: `${who} finished ${title}. It's ready for your review.` });
    else if (r.status === "done" || r.status === "merged") out.push({ ok: true, line: `${who} finished ${title}.` });
    else if (r.status === "failed") out.push({ ok: false, line: `${title} hit a problem${r.reason ? `: ${r.reason.slice(0, 80)}` : ""}.` });
  }
  return out.slice(0, 3);
}

/** Each run's status, to compare against next time. */
export const statuses = (runs: Record<string, CrewRun>) => Object.fromEntries(Object.values(runs).map((r) => [r.id, r.status]));
