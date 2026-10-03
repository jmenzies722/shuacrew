import { approvalSummary } from "./approval-summary";
/**
 * Spark as the voice of the crew (the "Jarvis" bridge): what the crew is doing and what's waiting on you, in a form
 * Spark can act on by voice — answer an approval, stop a session, open one — and a spoken heads-up the moment crew
 * work finishes. Short refs (A1, S1) stand in for real ids so Spark never has to read or say one.
 */

export interface CrewRun { id: string; title: string; status: string; member?: string; labels?: string[]; reason?: string; updatedAt?: number; archived?: boolean }
export interface CrewPlay { id: string; title: string; name: string; status: string }
export interface CrewApproval { id: string; run: string | null; tool: string; input: unknown; risk: string }

const ACTIVE = new Set(["queued", "planning", "running", "awaiting_approval", "paused"]);
/** Only currently listed targets resolve. Ref numbers are never reassigned to different work. */
const refs = new Map<string, string>();
const assigned = new Map<string, string>();
try { for (const [id, ref] of JSON.parse(localStorage.getItem("shuacrew.crew-refs") ?? "[]")) if (typeof id === "string" && /^[AS]\d+$/.test(ref)) assigned.set(id, ref); } catch { /* fresh session */ }
const nextRef = { A: 0, S: 0 };
for (const ref of assigned.values()) { const k = ref[0] as "A" | "S"; nextRef[k] = Math.max(nextRef[k], Number(ref.slice(1))); }
function reference(kind: "A" | "S", id: string) {
  const key = `${kind}:${id}`;
  let ref = assigned.get(key);
  if (!ref) { ref = `${kind}${++nextRef[kind]}`; assigned.set(key, ref); try { localStorage.setItem("shuacrew.crew-refs", JSON.stringify([...assigned])); } catch { /* unavailable storage */ } }
  refs.set(ref, id);
  return ref;
}
/** Each session's status as Spark last saw it (for deleting: only finished ones can go). */
const statusOf = new Map<string, string>();
const titleOf = new Map<string, string>();
export const crewTitle = (ref: string) => titleOf.get(crewRef(ref, "S")) ?? "";
export const crewStatus = (id: string) => statusOf.get(id) ?? "";
/** Unknown, expired and wrong-kind targets fail closed, including raw ids not in this snapshot. */
export function crewRef(ref: string, kind?: "A" | "S"): string {
  const value = ref.trim();
  const entry = [...refs].find(([key, id]) => (!kind || key.startsWith(kind)) && (key === value.toUpperCase() || id === value));
  return entry?.[1] ?? "";
}

/** What a waiting tool call would do, in a few words: the command, the file, or the tool's input. */
export function whatItDoes(tool: string, input: unknown): string {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const pick = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : "");
  const text = pick("command") || pick("file_path") || pick("path") || pick("url") || pick("query") || JSON.stringify(input ?? "");
  return `${tool.replace(/^mcp__[^_]+__/, "")}: ${text.replace(/\s+/g, " ").slice(0, 90)}`;
}

/** The crew right now, for Spark's instructions: what's waiting on you, what's working, what's ready for review. */
export function crewDetail(runs: Record<string, CrewRun>, approvals: Record<string, CrewApproval>, names: Record<string, string> = {}, plays: Record<string, CrewPlay> = {}): string {
  refs.clear(); statusOf.clear(); titleOf.clear();
  const crew = Object.values(runs).filter((r) => !r.labels?.includes("buddy") && !r.archived);
  const who = (r?: CrewRun) => (r?.member ? names[r.member] ?? r.member : "the crew");
  const out: string[] = [];
  const waiting = Object.values(approvals).slice(0, 6).map((a) => {
    const ref = reference("A", a.id), run = a.run ? runs[a.run] : undefined;
    return `${ref} — ${who(run)} wants ${whatItDoes(a.tool, a.input)}${run ? ` in “${run.title}”` : ""} (risk ${a.risk})`;
  });
  if (waiting.length) out.push(`WAITING ON YOU: ${waiting.join(" · ")}`);
  const session = (r: CrewRun, note: string) => { const ref = reference("S", r.id); statusOf.set(r.id, r.status); titleOf.set(r.id, r.title.slice(0, 80)); return `${ref} “${r.title.slice(0, 60)}” (${who(r)}${note ? `, ${note}` : ""})`; };
  const working = crew.filter((r) => ACTIVE.has(r.status)).slice(0, 6).map((r) => session(r, r.status.replace("_", " ")));
  if (working.length) out.push(`WORKING: ${working.join(" · ")}`);
  const review = crew.filter((r) => r.status === "reviewing").slice(0, 4).map((r) => session(r, "ready for review"));
  if (review.length) out.push(`READY FOR REVIEW: ${review.join(" · ")}`);
  // Recent finished work too, so "delete the failed one" or "what did Rhea do?" has something to point at.
  const recent = crew.filter((r) => ["done", "merged", "failed", "cancelled"].includes(r.status)).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)).slice(0, 8)
    .map((r) => session(r, r.status === "failed" ? `failed${r.reason ? `: ${r.reason.slice(0, 50)}` : ""}` : r.status));
  if (recent.length) out.push(`RECENT: ${recent.join(" · ")}`);
  const live = Object.values(plays).filter((p) => p.status === "running" || p.status === "waiting").slice(0, 4).map((p) => `“${p.title || p.name}” (${p.status === "waiting" ? "waiting on you" : "running"})`);
  if (live.length) out.push(`PLAYBOOKS: ${live.join(" · ")}`);
  const askedRef = asked && Date.now() - asked.at < 90_000 ? [...refs].find(([, id]) => id === asked!.id)?.[0] : undefined;
  if (asked && askedRef && (askedRef.startsWith("A") || statusOf.get(asked.id) === "reviewing")) out.push(`YOU JUST ASKED THEM, OUT LOUD: “${asked.line}” — a bare "yes"/"go ahead" or "no" answers that (${askedRef}).`);
  return out.join("\n");
}

/** The last thing Spark asked about the crew out loud, so a bare "yes" can answer it. */
let asked: { at: number; line: string; id: string } | null = null;
export const lastAskedApproval = () => asked && Date.now() - asked.at < 90_000 ? asked.id : undefined;
export const noteAsked = (line: string, id: string) => { asked = { at: Date.now(), line, id }; };

/** How Spark is told to run the crew by voice (part of its instructions). */
export const CREW_CONTROL = [
  "SPOKEN APPROVALS: summarize what the command intends to do in one short plain-language sentence. Do not read command syntax, flags, paths, code, or raw tool inputs aloud. Mention material effects such as deleting files, installing dependencies, or pushing commits. For unclear scripts, say the purpose is unclear and ask them to review the full command in the approval card. Never invent a benign purpose.",
  "RUNNING THE CREW (you're its voice, with full control): answer an approval they decide on — ```do [{\"type\":\"crew_decide\",\"ref\":\"A1\",\"allow\":true}]``` (allow false to decline);",
  "stop a session ```do [{\"type\":\"crew_stop\",\"ref\":\"S1\"}]```; show one ```do [{\"type\":\"crew_open\",\"ref\":\"S1\"}]```;",
  "tell a session something (\"tell Eli to add tests\") ```do [{\"type\":\"crew_message\",\"ref\":\"S1\",\"text\":\"Also add tests for the parser.\"}]``` — text is their whole instruction, written to the agent (\"reply with just DONE\" → \"Reply with just DONE.\"), never a fragment of it;",
  "delete (archive) a finished session ```do [{\"type\":\"crew_delete\",\"ref\":\"S3\"}]``` — a running one must be stopped first;",
  "review work that's ready: merge it ```do [{\"type\":\"crew_review\",\"ref\":\"S2\",\"approve\":true}]```, or reject with the reason as a lesson ```do [{\"type\":\"crew_review\",\"ref\":\"S2\",\"approve\":false,\"lesson\":\"Keep the old API.\"}]```; push it and open a PR ```do [{\"type\":\"crew_pr\",\"ref\":\"S2\"}]```.",
  "A bare no to a merge offer means leave the work alone, not reject it. Reject work only when they explicitly ask to reject it. Report action results accurately: queued for merge is not merged yet.",
  "Deleting, merging, a PR and stopping each ask them yes-or-no first (you just ask for it; the app confirms).",
  "Only refs listed above, only when they say so (\"approve it\", \"stop the dark-mode one\"); if it's unclear which, ask. Say it like a teammate: \"Approved — Eli's running the tests.\" Never read refs or ids aloud.",
].join(" ");

/**
 * Crew work that just finished, as spoken lines: compares each run's last status with its new one. Only real crew
 * work (not Spark's own turns), only the moment it leaves active work.
 */
export function crewFinished(before: Record<string, string>, runs: Record<string, CrewRun>, names: Record<string, string> = {}): Array<{ ok: boolean; line: string; questionId?: string }> {
  const out: Array<{ ok: boolean; line: string; questionId?: string }> = [];
  for (const r of Object.values(runs)) {
    const was = before[r.id];
    if (!was || !ACTIVE.has(was) || ACTIVE.has(r.status) || r.labels?.includes("buddy") || r.archived) continue;
    const who = r.member ? names[r.member] ?? "The crew" : "The crew", title = `“${r.title.slice(0, 60)}”`;
    if (r.status === "reviewing") {
      const question = !out.some(n => n.questionId);
      out.push({ ok: true, line: `${who} finished ${title}. It's ready for your review${question ? " — want me to merge it?" : "."}`, ...(question ? { questionId: r.id } : {}) });
    }
    else if (r.status === "done" || r.status === "merged") out.push({ ok: true, line: `${who} finished ${title}.` });
    else if (r.status === "failed") out.push({ ok: false, line: `${title} hit a problem${r.reason ? `: ${r.reason.slice(0, 80)}` : ""}.` });
  }
  return out.slice(0, 3);
}

/** Each run's status, to compare against next time. */
export const statuses = (runs: Record<string, CrewRun>) => Object.fromEntries(Object.values(runs).map((r) => [r.id, r.status]));

/**
 * New approvals, said out loud with an offer ("Eli wants to run npm test in “Add dark mode”. Approve it?"). Only ones
 * that weren't there before; at most one line, so a burst of requests doesn't become a speech.
 */
export function crewAsks(before: ReadonlySet<string>, approvals: Record<string, CrewApproval>, runs: Record<string, CrewRun>, names: Record<string, string> = {}): { line: string; id: string } | null {
  const fresh = Object.values(approvals).filter((a) => !before.has(a.id));
  if (!fresh.length) return null;
  const a = fresh[0]!, run = a.run ? runs[a.run] : undefined, who = run?.member ? names[run.member] ?? "The crew" : "The crew";
  const what = approvalSummary(a.tool, a.input);
  const more = fresh.length > 1 ? ` (and ${fresh.length - 1} more)` : "";
  return { id: a.id, line: `${who} wants to ${what}${run ? ` in “${run.title.slice(0, 50)}”` : ""}${more}. Approve it?` };
}
