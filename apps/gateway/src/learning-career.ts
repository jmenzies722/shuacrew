import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { parseBlock, type Cert, type Job, type Learning, type LearningState } from "./learning.js";
import type { Supervisor } from "./runs.js";

/**
 * Career: the certifications you're working toward and the jobs you're going after, kept next to your roadmap so one
 * place answers "what should I do next?". Shua builds the heavy parts (a cert's study plan and flashcards, how well a
 * job fits and what it asks that you don't have yet, openings worth a look); you move things along.
 */
export const CERT_STATUS = ["planned", "studying", "booked", "passed"] as const;
export const JOB_STAGES = ["saved", "applied", "interviewing", "offer", "closed"] as const;
const DEEP = { runtime: "codex", effort: "medium" } as const;
const str = (x: unknown, max: number) => (typeof x === "string" ? x.trim().slice(0, max) : "");
/** A date from the page: epoch ms, or anything Date.parse reads ("2026-11-20"). Empty clears it. */
const when = (x: unknown): number | undefined => {
  if (typeof x === "number" && Number.isFinite(x) && x > 0) return x;
  if (typeof x === "string" && x.trim() && !Number.isNaN(Date.parse(x))) return Date.parse(x);
  return undefined;
};
const has = (b: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(b, k);
export const certTrack = (name: string) => `cert-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 34).replace(/^-+|-+$/g, "")}`;

export function newCert(b: Record<string, unknown>, now = Date.now()): Cert | string {
  const name = str(b.name, 120); if (!name) return "A certification needs a name.";
  const status = CERT_STATUS.find((x) => x === b.status) ?? "planned";
  return { id: `ce_${randomUUID().slice(0, 8)}`, name, provider: str(b.provider, 60), code: str(b.code, 40), status, examDate: when(b.examDate),
    passedAt: status === "passed" ? now : undefined, track: certTrack(name), steps: [], notes: str(b.notes, 2000), created: now };
}
/** Apply a change from the page or from Shua: only known fields, each validated; `step` + `done` ticks a study step. */
export function certPatch(c: Cert, b: Record<string, unknown>, now = Date.now()): Cert {
  const next = { ...c };
  if (has(b, "name") && str(b.name, 120)) next.name = str(b.name, 120);
  if (has(b, "provider")) next.provider = str(b.provider, 60);
  if (has(b, "code")) next.code = str(b.code, 40);
  if (has(b, "notes")) next.notes = str(b.notes, 2000);
  if (has(b, "examDate")) next.examDate = when(b.examDate);
  const status = CERT_STATUS.find((x) => x === b.status);
  if (status) { next.status = status; next.passedAt = status === "passed" ? (c.passedAt ?? now) : undefined; }
  if (typeof b.step === "number" && Number.isInteger(b.step)) next.steps = c.steps.map((s, i) => (i === b.step ? { ...s, done: b.done !== false } : s));
  return next;
}

export function newJob(b: Record<string, unknown>, now = Date.now(), source: Job["source"] = "you"): Job | string {
  const company = str(b.company, 120); if (!company) return "A job needs a company.";
  return { id: `jb_${randomUUID().slice(0, 8)}`, company, role: str(b.role, 160), url: safeUrl(b.url), stage: JOB_STAGES.find((x) => x === b.stage) ?? "saved",
    location: str(b.location, 120), salary: str(b.salary, 80), next: str(b.next, 300), nextAt: when(b.nextAt), notes: str(b.notes, 4000),
    description: str(b.description, 20_000), source, created: now, updated: now };
}
export function jobPatch(j: Job, b: Record<string, unknown>, now = Date.now()): Job {
  const next = { ...j, updated: now };
  if (has(b, "company") && str(b.company, 120)) next.company = str(b.company, 120);
  for (const [k, max] of [["role", 160], ["location", 120], ["salary", 80], ["next", 300], ["notes", 4000], ["description", 20_000]] as const) if (has(b, k)) next[k] = str(b[k], max);
  if (has(b, "url")) next.url = safeUrl(b.url);
  if (has(b, "nextAt")) next.nextAt = when(b.nextAt);
  const stage = JOB_STAGES.find((x) => x === b.stage); if (stage) next.stage = stage;
  return next;
}
/** Links only to the web: a posting's URL is opened from the app, so nothing but http(s). */
function safeUrl(x: unknown) { const u = str(x, 500); return /^https?:\/\//i.test(u) ? u : ""; }

/** Shua's study plan for a cert: ordered steps (cards come separately, as a ```cards block). */
export function parseCertPlan(text: string): Array<{ title: string; done: boolean }> {
  const plan = parseBlock(text, "cert", "steps") as { steps?: unknown } | undefined;
  return Array.isArray(plan?.steps) ? plan!.steps.slice(0, 16).flatMap((x: unknown) => { const t = typeof x === "string" ? str(x, 200) : str((x as { title?: unknown })?.title, 200); return t ? [{ title: t, done: false }] : []; }) : [];
}
/** How a job fits: a 0–100 score, a short read, and the skills it asks for that you don't show yet. */
export function parseFit(text: string): { score?: number; summary: string; gaps: string[] } | null {
  const f = parseBlock(text, "fit", "summary") as { score?: unknown; summary?: unknown; gaps?: unknown } | undefined;
  if (!f) return null;
  const score = typeof f.score === "number" && f.score >= 0 && f.score <= 100 ? Math.round(f.score) : undefined;
  return { score, summary: str(f.summary, 1200), gaps: Array.isArray(f.gaps) ? f.gaps.map((g) => str(g, 80)).filter(Boolean).slice(0, 12) : [] };
}
/** Openings Shua found: only ones with a real link (it's told never to invent postings). */
export function parseOpenings(text: string): Array<Record<string, string>> {
  const raw = parseBlock(text, "jobs") as unknown;
  const list = Array.isArray(raw) ? raw : Array.isArray((raw as { jobs?: unknown })?.jobs) ? (raw as { jobs: unknown[] }).jobs : [];
  return list.slice(0, 10).flatMap((x: unknown) => {
    const o = x as Record<string, unknown>, company = str(o?.company, 120), url = safeUrl(o?.url);
    return company && url ? [{ company, role: str(o.role, 160), url, location: str(o.location, 120), notes: str(o.why, 600) }] : [];
  });
}

/** Certs and jobs, as plain lines for Shua's coach (so "what next?" knows about exams and applications). */
export function careerContext(s: LearningState, now = Date.now()): string {
  const day = (t?: number) => (t ? new Date(t).toISOString().slice(0, 10) : "");
  const certs = s.certs.map((c) => `${c.name}${c.code ? ` (${c.code})` : ""}: ${c.status}${c.examDate ? `, exam ${day(c.examDate)} (${Math.ceil((c.examDate - now) / 86_400_000)} days)` : ""}${c.steps.length ? `, ${c.steps.filter((x) => x.done).length}/${c.steps.length} steps` : ""}`);
  const open = s.jobs.filter((j) => j.stage !== "closed");
  const jobs = open.map((j) => `${j.company}${j.role ? ` · ${j.role}` : ""}: ${j.stage}${j.next ? `, next: ${j.next}${j.nextAt ? ` by ${day(j.nextAt)}` : ""}` : ""}${j.fit?.gaps.length ? `, gaps: ${j.fit.gaps.slice(0, 4).join(", ")}` : ""}`);
  return [certs.length ? `Certifications: ${certs.join("; ")}.` : "", jobs.length ? `Job search: ${jobs.join("; ")}.` : ""].filter(Boolean).join("\n");
}

/** Learn in a few lines, for Shua anywhere (notch, ⌘J, hold ⌃⌥): the goal, the next milestone, certs and exams, the job search, what's due. */
export function learnBrief(s: LearningState, due: number, now = Date.now()): string {
  const road = [...s.roadmaps].reverse().find((r) => r.milestones.length), next = road?.milestones.find((m) => !m.done);
  return [
    s.profile.goal ? `Goal: ${s.profile.goal}` : "No goal set yet.",
    road ? `Roadmap "${road.title}": ${road.milestones.filter((m) => m.done).length}/${road.milestones.length} milestones${next ? `, next: ${next.title}` : ", all done"}.` : "",
    careerContext(s, now),
    `Flashcards: ${s.cards.length}, ${due} due now.`,
  ].filter(Boolean).join("\n");
}

export interface LearnReminder { id: string; kind: "exam" | "followup"; days: number; title: string; text: string }
/**
 * Whole calendar days from today (this Mac's clock) to a date. Exam and follow-up dates are calendar dates
 * ("2026-10-19", stored as that day's UTC midnight), so their UTC date is the day — read in local time, New York
 * saw every date a day early.
 */
const daysUntil = (at: number, now: number) => { const t = new Date(at), n = new Date(now); return Math.round((Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) - Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())) / 86_400_000); };
/**
 * What's coming that you'd want a nudge about: exams within 30 days (not passed), and job follow-ups due by tomorrow
 * (overdue ones too, until done). Soonest first. The notch and the morning brief decide when to say each.
 */
export function learnReminders(s: LearningState, now = Date.now()): LearnReminder[] {
  const out: LearnReminder[] = [];
  for (const c of s.certs) {
    if (!c.examDate || c.status === "passed") continue;
    const days = daysUntil(c.examDate, now), name = c.code || c.name;
    if (days < 0 || days > 30) continue;
    out.push({ id: `exam:${c.id}`, kind: "exam", days, title: `${name} exam`, text: days === 0 ? `Your ${name} exam is today. You've got this.` : days === 1 ? `Your ${name} exam is tomorrow.` : `Your ${name} exam is in ${days} days.` });
  }
  for (const j of s.jobs) {
    if (!j.nextAt || j.stage === "closed") continue;
    const days = daysUntil(j.nextAt, now), what = j.next || "follow up";
    if (days > 1) continue;
    out.push({ id: `followup:${j.id}`, kind: "followup", days, title: `${j.company}: ${what}`, text: days < 0 ? `Overdue by ${-days} day${days === -1 ? "" : "s"}: ${what} (${j.company}).` : days === 0 ? `Today: ${what} (${j.company}).` : `Tomorrow: ${what} (${j.company}).` });
  }
  return out.sort((a, b) => a.days - b.days);
}

/** When a career run finishes: fill in what it produced (once). Returns true if it was one of ours. */
export function captureCareer(learning: Learning, labels: string[], text: string): boolean {
  const tag = (k: string) => labels.find((l) => l.startsWith(`${k}:`))?.slice(k.length + 1);
  if (labels.includes("learn-kind:cert-plan")) {
    const id = tag("learn-cert"), steps = parseCertPlan(text);
    if (id && steps.length) learning.edit((s) => ({ ...s, certs: s.certs.map((c) => (c.id === id && !c.steps.length ? { ...c, steps, status: c.status === "planned" ? "studying" : c.status } : c)) }));
    return true;
  }
  if (labels.includes("learn-kind:job-fit")) {
    const id = tag("learn-job"), fit = parseFit(text);
    if (id && fit) learning.edit((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === id ? { ...j, fit: { run: j.fit?.run ?? "", ...fit } } : j)) }));
    return true;
  }
  if (labels.includes("learn-kind:job-research")) {
    const found = parseOpenings(text), now = Date.now();
    if (found.length) learning.edit((s) => {
      const known = new Set(s.jobs.map((j) => `${j.company}|${j.role}`.toLowerCase()));
      const fresh = found.filter((f) => !known.has(`${f.company}|${f.role}`.toLowerCase())).map((f) => newJob(f, now, "shua")).filter((j): j is Job => typeof j !== "string");
      return { ...s, jobs: [...s.jobs, ...fresh] };
    });
    return true;
  }
  return false;
}

/**
 * What Shua changes when you talk to it in Learn ("I booked the CKA for March 3", "applied to Grafana yesterday"): a
 * ```learn block of operations. Every one is an upsert (a reply read twice changes nothing more) and none deletes —
 * removing things stays yours. Returns what it did, in words, for the log and the tests.
 */
export function applyLearnOps(learning: Learning, text: string, now = Date.now()): string[] {
  const raw = parseBlock(text, "learn") as unknown;
  const ops = (Array.isArray(raw) ? raw : Array.isArray((raw as { ops?: unknown })?.ops) ? (raw as { ops: unknown[] }).ops : []).slice(0, 20) as Array<Record<string, unknown>>;
  const did: string[] = [];
  const same = (a: string, b: string) => !!a && a.trim().toLowerCase() === b.trim().toLowerCase();
  for (const op of ops) {
    if (!op || typeof op !== "object") continue;
    if (op.op === "goal" && str(op.goal, 500)) { learning.setProfile({ goal: str(op.goal, 500) }); did.push(`goal: ${str(op.goal, 80)}`); continue; }
    if (op.op === "cert") {
      const s = learning.get(), name = str(op.name, 120), code = str(op.code, 40);
      const found = s.certs.find((c) => (code && same(c.code, code)) || (name && same(c.name, name)));
      if (found) { learning.edit((st) => ({ ...st, certs: st.certs.map((c) => (c.id === found.id ? certPatch(c, op, now) : c)) })); did.push(`cert updated: ${found.code || found.name}`); continue; }
      const c = newCert(op, now); if (typeof c === "string") continue;
      learning.edit((st) => ({ ...st, certs: [...st.certs, c], profile: st.profile.tracks.some((t) => t.id === c.track) || st.profile.tracks.length >= 24 ? st.profile : { ...st.profile, tracks: [...st.profile.tracks, { id: c.track, name: c.code || c.name.slice(0, 60), level: 1, focus: true }] } }));
      did.push(`cert added: ${c.code || c.name}`); continue;
    }
    if (op.op === "job") {
      const s = learning.get(), company = str(op.company, 120), role = str(op.role, 160);
      const found = s.jobs.find((j) => same(j.company, company) && (!role || !j.role || same(j.role, role)));
      if (found) { learning.edit((st) => ({ ...st, jobs: st.jobs.map((j) => (j.id === found.id ? jobPatch(j, op, now) : j)) })); did.push(`job updated: ${found.company}`); continue; }
      const j = newJob(op, now, "shua"); if (typeof j === "string") continue;
      learning.edit((st) => ({ ...st, jobs: [...st.jobs, j] })); did.push(`job added: ${j.company}`); continue;
    }
    if (op.op === "milestone") {
      const s = learning.get(), title = str(op.title, 200).toLowerCase();
      const road = [...s.roadmaps].reverse().find((r) => r.milestones.length && (!str(op.roadmap, 200) || r.title.toLowerCase().includes(str(op.roadmap, 200).toLowerCase())));
      if (!road) continue;
      const index = typeof op.index === "number" ? op.index : road.milestones.findIndex((m) => title && m.title.toLowerCase().includes(title));
      if (index < 0 || index >= road.milestones.length) continue;
      learning.edit((st) => ({ ...st, roadmaps: st.roadmaps.map((r) => (r.id === road.id ? { ...r, milestones: r.milestones.map((m, i) => (i === index ? { ...m, done: op.done !== false } : m)) } : r)) }));
      did.push(`milestone ${op.done === false ? "reopened" : "done"}: ${road.milestones[index]!.title}`);
    }
  }
  return did;
}

export function careerRoutes(app: FastifyInstance, deps: { learning: Learning; supervisor: Supervisor; who: () => string }) {
  const { learning, supervisor, who } = deps;
  const bad = (reply: { code: (n: number) => { send: (b: unknown) => unknown } }, error: string) => reply.code(400).send({ error });

  app.post<{ Body: Record<string, unknown> }>("/api/learning/certs", async (req, reply) => {
    const c = newCert(req.body ?? {}); if (typeof c === "string") return bad(reply, c);
    learning.edit((s) => ({
      ...s, certs: [...s.certs, c],
      // Its cards get their own review track, so readiness for the exam is measured on its own.
      profile: s.profile.tracks.some((t) => t.id === c.track) || s.profile.tracks.length >= 24 ? s.profile : { ...s.profile, tracks: [...s.profile.tracks, { id: c.track, name: c.code || c.name.slice(0, 60), level: 1, focus: true }] },
    }));
    return c;
  });
  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/learning/certs/:id", async (req, reply) => {
    if (!learning.get().certs.some((c) => c.id === req.params.id)) return reply.code(404).send({ error: "No such certification." });
    learning.edit((s) => ({ ...s, certs: s.certs.map((c) => (c.id === req.params.id ? certPatch(c, req.body ?? {}) : c)) }));
    return learning.get().certs.find((c) => c.id === req.params.id);
  });
  app.delete<{ Params: { id: string } }>("/api/learning/certs/:id", async (req) => { learning.edit((s) => ({ ...s, certs: s.certs.filter((c) => c.id !== req.params.id) })); return { ok: true }; });
  app.post<{ Params: { id: string } }>("/api/learning/certs/:id/plan", async (req, reply) => {
    const c = learning.get().certs.find((x) => x.id === req.params.id); if (!c) return reply.code(404).send({ error: "No such certification." });
    const days = c.examDate ? Math.max(1, Math.ceil((c.examDate - Date.now()) / 86_400_000)) : null;
    const ask = ["You are a certification coach who has passed this exam and coached others through it. Do not use any tools.", who(),
      `Certification: ${c.name}${c.code ? ` (${c.code})` : ""}${c.provider ? ` by ${c.provider}` : ""}. ${days ? `Exam in ${days} days.` : "No exam date yet: assume about 8 weeks."}`,
      "Build a study plan: 6–12 ordered steps, each a concrete action with its week (official exam guide domains first, hands-on labs in their own AWS/cloud sandbox, practice exams near the end). Say honestly where people usually fail this exam.",
      'Reply with a short plan, then exactly one ```cert fenced JSON object {"steps": ["Week 1 · ...", "..."]}, then 10–15 flashcards on the exam\'s highest-weight topics as a ```cards fenced JSON array of {"front": "...", "back": "..."}.'].join("\n");
    const run = supervisor.launch({ ask, title: `Study plan · ${c.code || c.name}`.slice(0, 90), ...DEEP, labels: ["learning", "learn-kind:cert-plan", `learn-cert:${c.id}`, `learn-track:${c.track}`] });
    learning.edit((s) => ({ ...s, certs: s.certs.map((x) => (x.id === c.id ? { ...x, plan: run } : x)) }));
    return { run };
  });

  app.post<{ Body: Record<string, unknown> }>("/api/learning/jobs", async (req, reply) => {
    const j = newJob(req.body ?? {}); if (typeof j === "string") return bad(reply, j);
    learning.edit((s) => ({ ...s, jobs: [...s.jobs, j] }));
    return j;
  });
  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/learning/jobs/:id", async (req, reply) => {
    if (!learning.get().jobs.some((j) => j.id === req.params.id)) return reply.code(404).send({ error: "No such job." });
    learning.edit((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === req.params.id ? jobPatch(j, req.body ?? {}) : j)) }));
    return learning.get().jobs.find((j) => j.id === req.params.id);
  });
  app.delete<{ Params: { id: string } }>("/api/learning/jobs/:id", async (req) => { learning.edit((s) => ({ ...s, jobs: s.jobs.filter((j) => j.id !== req.params.id) })); return { ok: true }; });
  app.post<{ Params: { id: string } }>("/api/learning/jobs/:id/fit", async (req, reply) => {
    const j = learning.get().jobs.find((x) => x.id === req.params.id); if (!j) return reply.code(404).send({ error: "No such job." });
    if (j.description.length < 80) return bad(reply, "Paste the job description first, so the fit is about this job.");
    const tracks = learning.get().profile.tracks.map((t) => `${t.name} ${t.level}/5`).join(", ");
    const ask = ["You are a hiring manager for this exact role, being honest with a candidate you'd like to see succeed. Do not use any tools. Never invent experience.", who(), `Current skills: ${tracks || "not stated"}.`,
      `Role: ${j.role || "(see posting)"} at ${j.company}.`, "Give: how well they fit today and why (cite the posting), the 3 things that would most raise their odds before applying, and 3 tailored resume bullet ideas (placeholders like [X], never made-up numbers).",
      'End with exactly one ```fit fenced JSON object {"score": 0-100, "summary": "two sentences", "gaps": ["skill the posting asks for that they don\'t show yet"]}.', `\n--- POSTING ---\n${j.description}`].join("\n");
    const run = supervisor.launch({ ask, title: `Job fit · ${j.company}`.slice(0, 90), ...DEEP, labels: ["learning", "learn-kind:job-fit", `learn-job:${j.id}`] });
    learning.edit((s) => ({ ...s, jobs: s.jobs.map((x) => (x.id === j.id ? { ...x, fit: { run, summary: x.fit?.summary ?? "", gaps: x.fit?.gaps ?? [], score: x.fit?.score } } : x)) }));
    return { run };
  });
  // Openings worth a look: Shua searches the web for current postings that match your goal (never invents one).
  app.post<{ Body: { query?: string; location?: string } }>("/api/learning/jobs/research", async (req, reply) => {
    const goal = learning.get().profile.goal, query = str(req.body?.query, 200) || goal; if (!query) return bad(reply, "Set a goal or say what to look for.");
    const where = str(req.body?.location, 120);
    const ask = ["You are a recruiter finding real, current openings. Use web search. Only list postings you actually found, each with its real URL; if you cannot search, say so and return an empty list.", who(),
      `Looking for: ${query}${where ? ` in ${where}` : ""}. Prefer roles a motivated engineer could land within 6 months, from companies that are hiring now.`,
      'Reply with a short read of the market, then exactly one ```jobs fenced JSON array of up to 8 {"company": "...", "role": "...", "url": "https://...", "location": "...", "why": "one line on why it fits"}.'].join("\n");
    const run = supervisor.launch({ ask, title: `Job search · ${query}`.slice(0, 90), ...DEEP, labels: ["learning", "learn-kind:job-research"] });
    return { run };
  });
}
