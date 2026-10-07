import type { FastifyInstance } from "fastify";
import type { AnyEvent } from "@shuacrew/core";
import type { EventStore } from "./store.js";
import type { Supervisor } from "./runs.js";
import { randomUUID } from "node:crypto";
import { Learning, analyze, parseBlock, parseCards, type Grade } from "./learning.js";
import { applyLearnOps, captureCareer, careerContext, careerRoutes, learnBrief, learnReminders } from "./learning-career.js";

const today = () => new Date().toISOString().slice(0, 10);
const MODEL = { runtime: "codex", effort: "low" } as const; // Resolve a current model from the connected Codex catalogue.
const DEEP = { runtime: "codex", effort: "medium" } as const;
/** Separates your words from the hidden coach reminder; the chat shows only what precedes it. */
export const COACH_MARK = "\n\n[coach] ";
const str = (x: unknown, max: number) => (typeof x === "string" ? x.trim().slice(0, max) : "");

/** What happened in a session, as plain text for a teacher: your asks, the crew's replies, tools used. */
function transcript(store: EventStore, run: string): { title: string; text: string } {
  let title = "", out = "";
  const tools = new Map<string, number>();
  for (const e of store.forRun(run) as AnyEvent[]) {
    if (e.kind === "run.created") { title = e.body.title; out += `USER: ${e.body.ask}\n\n`; }
    else if (e.kind === "run.followup") out += `USER: ${(e.body as { text?: string }).text ?? ""}\n\n`;
    else if (e.kind === "agent.message") out += `AGENT: ${e.body.text}\n\n`;
    else if (e.kind === "tool.called") tools.set(e.body.tool, (tools.get(e.body.tool) ?? 0) + 1);
  }
  if (tools.size) out += `TOOLS USED: ${[...tools].map(([t, n]) => `${t}×${n}`).join(", ")}\n`;
  return { title, text: out.length > 14_000 ? `${out.slice(0, 7_000)}\n…\n${out.slice(-7_000)}` : out };
}

export function learningRoutes(app: FastifyInstance, deps: { learning: Learning; store: EventStore; supervisor: Supervisor }) {
  const { learning, store, supervisor } = deps;
  const who = () => { const p = learning.get().profile; return `The learner's career goal: ${p.goal || "(not set)"}.${p.about ? ` About them: ${p.about}.` : ""}`; };
  const levelOf = (id: string) => learning.get().profile.tracks.find((t) => t.id === id);

  // When a teaching or drill session finishes, its cards go into your deck (once).
  const capture = (runId: string) => {
    const e = { run: runId };
    const created = store.forRun(e.run).find((x) => x.kind === "run.created");
    if (created?.kind !== "run.created" || !created.body.labels.includes("learning")) return;
    const reply = [...store.forRun(e.run)].reverse().find((x) => x.kind === "agent.message");
    const text = reply?.kind === "agent.message" ? reply.body.text : "";
    const tag = (k: string) => created.body.labels.find((l) => l.startsWith(`${k}:`))?.slice(k.length + 1);
    // Certs and jobs (a study plan's steps, a job's fit, openings found); a study plan's cards still go to the deck below.
    captureCareer(learning, created.body.labels, text);
    // A course plan: fill the course's lessons (once).
    const courseId = tag("learn-course");
    if (created.body.labels.includes("learn-kind:course-plan") && courseId) {
      const plan = parseBlock(text, "course", "lessons") as { title?: unknown; lessons?: unknown } | undefined;
      const lessons = Array.isArray(plan?.lessons) ? plan!.lessons.slice(0, 12).flatMap((x: { title?: unknown; summary?: unknown }) => (str(x?.title, 200) ? [{ title: str(x.title, 200), summary: str(x.summary, 600), done: false }] : [])) : [];
      learning.edit((s) => ({ ...s, courses: s.courses.map((c) => (c.id === courseId && !c.lessons.length ? { ...c, title: str(plan?.title, 200) || c.topic, lessons } : c)) }));
      return;
    }
    // A roadmap: its milestones (once).
    const roadmapId = tag("learn-roadmap");
    if (created.body.labels.includes("learn-kind:roadmap") && roadmapId) {
      const r = parseBlock(text, "roadmap", "milestones") as { title?: unknown; milestones?: unknown } | undefined;
      const milestones = Array.isArray(r?.milestones) ? r!.milestones.slice(0, 16).flatMap((m: Record<string, unknown>) => (str(m?.title, 200) ? [{
        title: str(m.title, 200), why: str(m.why, 600), project: str(m.project, 600), done: false,
        skills: Array.isArray(m.skills) ? (m.skills as unknown[]).map((k) => str(k, 80)).filter(Boolean).slice(0, 12) : [],
        weeks: typeof m.weeks === "number" && m.weeks >= 0 && m.weeks <= 104 ? m.weeks : 2,
      }] : [])) : [];
      learning.edit((s) => ({ ...s, roadmaps: s.roadmaps.map((x) => (x.id === roadmapId && !x.milestones.length ? { ...x, title: str(r?.title, 200) || x.title, milestones } : x)) }));
    }
    const coaching = created.body.labels.includes("learn-kind:coach");
    // Talking to Shua in Learn: apply the changes it made (upserts only, so a repeat read is harmless).
    if (created.body.labels.includes("learn-coach:organize")) applyLearnOps(learning, text);
    if (!coaching && learning.get().cards.some((c) => c.source.run === e.run)) return;
    const known = new Set(learning.get().cards.map((c) => c.front.trim().toLowerCase()));
    const cards = parseCards(text).filter((c) => !known.has(c.front.trim().toLowerCase()));
    const trackId = created.body.labels.find((l) => l.startsWith("learn-track:"))?.slice(12) ?? "general";
    if (cards.length) learning.addCards(cards, trackId, { run: e.run, title: created.body.title });
    if (created.body.labels.includes("learn-kind:drill")) learning.markDrillDone(today());
  };
  store.subscribe((e) => { if (e.kind === "run.status" && e.body.status === "done" && e.run) capture(e.run); });
  // Self-heal: a plan that finished but wasn't captured (parse miss, restart mid-run) is picked up on the next load.
  const heal = () => {
    const s = learning.get();
    for (const c of s.courses) if (!c.lessons.length && c.plan && supervisor.status(c.plan) === "done") capture(c.plan);
    for (const r of s.roadmaps) if (!r.milestones.length && supervisor.status(r.run) === "done") capture(r.run);
    for (const c of s.certs) if (!c.steps.length && c.plan && supervisor.status(c.plan) === "done") capture(c.plan);
    for (const j of s.jobs) if (j.fit?.run && !j.fit.summary && supervisor.status(j.fit.run) === "done") capture(j.fit.run);
  };

  app.get("/api/learning", async () => {
    heal();
    const s = learning.get(), now = Date.now();
    const week = Array.from({ length: 14 }, (_, i) => { const d = new Date(now - (13 - i) * 86_400_000).toISOString().slice(0, 10); return { day: d, reviews: s.reviews.filter((r) => new Date(r.at).toISOString().slice(0, 10) === d).length }; });
    return { ...s, reviews: undefined, due: learning.due(now).length, days: week, totalReviews: s.reviews.length, drill: s.drills.find((d) => d.day === today()) ?? null };
  });
  // Shua, from anywhere (notch, ⌘J, hold ⌃⌥): what Learn holds, in a few lines — and the changes it decides on, applied
  // exactly as the organizer's are (upserts by cert name/code or company; never a delete).
  app.get("/api/learning/brief", async () => ({ text: learnBrief(learning.get(), learning.due(Date.now()).length) }));
  // Exam countdowns and job follow-ups, for the notch's heads-ups and the morning brief.
  app.get("/api/learning/reminders", async () => ({ reminders: learnReminders(learning.get()) }));
  app.post<{ Body: { ops?: unknown } }>("/api/learning/ops", async (req, reply) => {
    const ops = req.body?.ops;
    if (!Array.isArray(ops) || !ops.length) return reply.code(400).send({ error: "ops: a list of Learn changes" });
    return { did: applyLearnOps(learning, `\`\`\`learn\n${JSON.stringify(ops.slice(0, 20))}\n\`\`\``) };
  });
  app.post<{ Body: { goal?: string; about?: string; tracks?: unknown } }>("/api/learning/profile", async (req, reply) => {
    try { return learning.setProfile(req.body as never).profile; } catch (e) { return reply.code(400).send({ error: (e as Error).message.slice(0, 300) }); }
  });
  app.post<{ Body: { front?: string; back?: string; track?: string } }>("/api/learning/cards", async (req, reply) => {
    const { front = "", back = "", track = "general" } = req.body ?? {};
    if (!front.trim() || !back.trim()) return reply.code(400).send({ error: "A card needs a question and an answer." });
    try { return learning.addCards([{ front: front.trim(), back: back.trim() }], track)[0]; } catch (e) { return reply.code(400).send({ error: (e as Error).message.slice(0, 300) }); }
  });
  app.post<{ Params: { id: string }; Body: { grade?: Grade } }>("/api/learning/cards/:id/review", async (req, reply) => {
    const g = req.body?.grade; if (g !== "again" && g !== "good" && g !== "easy") return reply.code(400).send({ error: "grade: again | good | easy" });
    try { return learning.review(req.params.id, g); } catch (e) { return reply.code(404).send({ error: (e as Error).message }); }
  });
  app.delete<{ Params: { id: string } }>("/api/learning/cards/:id", async (req) => { learning.removeCard(req.params.id); return { ok: true }; });

  // Sessions you could learn from: finished, yours, not themselves lessons.
  app.get("/api/learning/sessions", async () => {
    const studied = new Set(learning.get().studied.map((s) => s.run)), seen = new Set<string>(), out: Array<{ id: string; title: string; at: number; studied: boolean }> = [];
    for (const e of [...store.ofKinds("run.created")].reverse()) {
      if (e.kind !== "run.created" || !e.run || seen.has(e.run) || e.body.parent || e.body.labels.includes("learning") || e.body.labels.includes("held")) continue;
      seen.add(e.run);
      if (store.forRun(e.run).some((x) => x.kind === "run.archived")) continue; // archived sessions stay out of the picker
      const status = supervisor.status(e.run);
      if (status && ["done", "merged", "reviewing", "failed"].includes(status)) out.push({ id: e.run, title: e.body.title, at: e.at, studied: studied.has(e.run) });
      if (out.length >= 30) break;
    }
    return out;
  });

  // Teach me from one of my sessions, at my level, toward my goal.
  app.post<{ Body: { run?: string; track?: string } }>("/api/learning/study", async (req, reply) => {
    const run = req.body?.run; if (!run) return reply.code(400).send({ error: "Pick a session to learn from." });
    const t = transcript(store, run); if (!t.text) return reply.code(404).send({ error: "That session has nothing to learn from yet." });
    const track = levelOf(req.body?.track ?? "") ?? learning.weakest();
    const ask = [
      "You are a senior engineer mentoring the user through their OWN real work session below. Do not use any tools.",
      who(), track ? `Teach at level ${track.level}/5 for the skill "${track.name}".` : "",
      "Explain: 1) what was done and why, 2) the underlying concepts (only what this session actually shows), 3) one concrete thing to practise next in their own projects.",
      "Be precise and honest: if the session skipped verification or made a questionable choice, say so.",
      'Finish with 3–6 review flashcards that test understanding (not trivia), exactly as a ```cards fenced JSON array of {"front": "...", "back": "..."}.',
      `\n--- SESSION: ${t.title} ---\n${t.text}`,
    ].filter(Boolean).join("\n");
    const id = supervisor.launch({ ask, title: `Learn from: ${t.title}`.slice(0, 90), ...MODEL, labels: ["learning", "learn-kind:study", `learn-track:${track?.id ?? "general"}`] });
    learning.recordStudy(run, id);
    return { run: id };
  });

  // One drill a day on your weakest focus skill — created once, reused all day.
  app.post("/api/learning/drill", async (_req, reply) => {
    const existing = learning.get().drills.find((d) => d.day === today()); if (existing) return existing;
    const track = learning.weakest(); if (!track) return reply.code(400).send({ error: "Add at least one skill track first." });
    const ask = [
      "You are a senior engineer setting a focused 15–20 minute practice drill. Do not use any tools.", who(),
      `Skill: "${track.name}", the learner's level ${track.level}/5.`,
      "Write: a concrete exercise they can do today in their own repos under ~/Developer/projects (no toy problems), what 'done' looks like, one hint, then a '## Solution' section.",
      'Finish with 2–4 flashcards as a ```cards fenced JSON array of {"front": "...", "back": "..."}.',
    ].join("\n");
    const run = supervisor.launch({ ask, title: `Drill · ${track.name}`, ...MODEL, labels: ["learning", "learn-kind:drill", `learn-track:${track.id}`] });
    const d = { day: today(), track: track.id, run, done: false };
    learning.recordDrill(d); return d;
  });

  // ── Career supercharger ─────────────────────────────────────────────────────────────────────
  const course = (id: string) => learning.get().courses.find((c) => c.id === id);
  // Learn anything: a course sized to you (the plan is one small call; lessons are written when opened).
  app.post<{ Body: { topic?: string; level?: number } }>("/api/learning/courses", async (req, reply) => {
    const topic = str(req.body?.topic, 160); if (!topic) return reply.code(400).send({ error: "What do you want to learn?" });
    const level = Math.max(1, Math.min(5, Math.round(Number(req.body?.level) || 2))), id = `k_${randomUUID().slice(0, 8)}`;
    const ask = ["You design a focused engineering course. Do not use any tools.", who(), `Topic: ${topic}. The learner's level in it: ${level}/5.`,
      "Plan 5–8 lessons that build on each other toward real, job-relevant competence (not trivia). Each lesson: a clear title and a one-sentence summary of what they'll be able to do.",
      'Reply with a short intro, then exactly one ```course fenced JSON object: {"title": "...", "lessons": [{"title": "...", "summary": "..."}]}.'].join("\n");
    const run = supervisor.launch({ ask, title: `Course plan · ${topic}`.slice(0, 90), ...DEEP, labels: ["learning", "learn-kind:course-plan", `learn-course:${id}`, `learn-track:${id}`] });
    learning.edit((s) => ({ ...s, courses: [...s.courses, { id, topic, level, title: "", plan: run, created: Date.now(), lessons: [] }] }));
    return { id, run };
  });
  app.post<{ Params: { id: string; n: string } }>("/api/learning/courses/:id/lessons/:n", async (req, reply) => {
    const c = course(req.params.id), n = Number(req.params.n), lesson = c?.lessons[n];
    if (!c || !lesson) return reply.code(404).send({ error: "No such lesson." });
    if (lesson.run) return { run: lesson.run };
    const ask = ["You are an expert engineer teaching one lesson of a course. Do not use any tools.", who(),
      `Course: ${c.title || c.topic} (learner level ${c.level}/5). Lessons so far: ${c.lessons.map((l, i) => `${i + 1}. ${l.title}`).join("; ")}.`,
      `Teach lesson ${n + 1}: "${lesson.title}" — ${lesson.summary}`,
      "Structure: the idea in plain words, a worked example with real code or commands, common mistakes, and a hands-on exercise they can do in their own projects with what 'done' looks like.",
      'Finish with 3–5 flashcards as a ```cards fenced JSON array of {"front": "...", "back": "..."}.'].join("\n");
    const run = supervisor.launch({ ask, title: `${c.title || c.topic} · ${lesson.title}`.slice(0, 90), ...MODEL, labels: ["learning", "learn-kind:lesson", `learn-track:${c.id}`] });
    learning.edit((s) => ({ ...s, courses: s.courses.map((x) => (x.id === c.id ? { ...x, lessons: x.lessons.map((l, i) => (i === n ? { ...l, run } : l)) } : x)) }));
    return { run };
  });
  app.post<{ Params: { id: string; n: string }; Body: { done?: boolean } }>("/api/learning/courses/:id/lessons/:n/done", async (req) => {
    learning.edit((s) => ({ ...s, courses: s.courses.map((x) => (x.id === req.params.id ? { ...x, lessons: x.lessons.map((l, i) => (i === Number(req.params.n) ? { ...l, done: req.body?.done !== false } : l)) } : x)) }));
    return { ok: true };
  });
  app.delete<{ Params: { id: string } }>("/api/learning/courses/:id", async (req) => { learning.edit((s) => ({ ...s, courses: s.courses.filter((c) => c.id !== req.params.id) })); return { ok: true }; });

  // Roadmap: milestones toward your goal over N months (one careful call).
  app.post<{ Body: { goal?: string; months?: number } }>("/api/learning/roadmaps", async (req, reply) => {
    const goal = str(req.body?.goal, 200) || learning.get().profile.goal; if (!goal) return reply.code(400).send({ error: "Set a goal first." });
    const months = Math.max(1, Math.min(36, Math.round(Number(req.body?.months) || 6))), id = `m_${randomUUID().slice(0, 8)}`;
    const tracks = learning.get().profile.tracks.map((t) => `${t.name} ${t.level}/5`).join(", ");
    const ask = ["You are a staff engineer and career coach building a realistic plan. Do not use any tools.", who(), `Goal: ${goal}. Horizon: ${months} months. Current skills: ${tracks || "not stated"}.`,
      "Plan 5–10 milestones in order. Each: a title, why it matters for the goal, the skills it builds, one concrete portfolio project that proves it (ideally shippable in their own repos), and weeks it takes. Be specific to the current market for AI/agentic, platform and DevOps engineering; no filler.",
      'Reply with a short summary, then exactly one ```roadmap fenced JSON object: {"title": "...", "milestones": [{"title": "...", "why": "...", "skills": ["..."], "project": "...", "weeks": 3}]}.'].join("\n");
    const run = supervisor.launch({ ask, title: `Roadmap · ${goal}`.slice(0, 90), ...DEEP, labels: ["learning", "learn-kind:roadmap", `learn-roadmap:${id}`] });
    learning.edit((s) => ({ ...s, roadmaps: [...s.roadmaps, { id, goal, months, title: "", run, created: Date.now(), milestones: [] }] }));
    return { id, run };
  });
  app.post<{ Params: { id: string; n: string }; Body: { done?: boolean } }>("/api/learning/roadmaps/:id/milestones/:n", async (req) => {
    learning.edit((s) => ({ ...s, roadmaps: s.roadmaps.map((r) => (r.id === req.params.id ? { ...r, milestones: r.milestones.map((m, i) => (i === Number(req.params.n) ? { ...m, done: req.body?.done !== false } : m)) } : r)) }));
    return { ok: true };
  });
  app.delete<{ Params: { id: string } }>("/api/learning/roadmaps/:id", async (req) => { learning.edit((s) => ({ ...s, roadmaps: s.roadmaps.filter((r) => r.id !== req.params.id) })); return { ok: true }; });

  // Career kit: resume review and interview prep.
  app.post<{ Body: { resume?: string; role?: string } }>("/api/learning/resume", async (req, reply) => {
    const resume = str(req.body?.resume, 20_000), role = str(req.body?.role, 200) || learning.get().profile.goal;
    if (resume.length < 200) return reply.code(400).send({ error: "Paste your resume text (at least a few lines)." });
    const ask = ["You are a senior engineering hiring manager reviewing a resume. Do not use any tools. Never invent experience; only sharpen what is there.", who(), `Target role: ${role || "not stated"}.`,
      "Give: 1) a one-paragraph honest read of how it lands for that role, 2) the 5 highest-impact fixes, 3) every bullet rewritten with a strong verb, concrete scope and a measurable result (use [X] placeholders where numbers are missing — do not make numbers up), 4) keywords the role expects that are missing, 5) a 3-line summary section.",
      `\n--- RESUME ---\n${resume}`].join("\n");
    const run = supervisor.launch({ ask, title: `Resume review · ${role || "general"}`.slice(0, 90), ...DEEP, labels: ["learning", "learn-kind:resume"], incognito: true });
    const id = `d_${randomUUID().slice(0, 8)}`;
    learning.edit((s) => ({ ...s, docs: [...s.docs, { id, kind: "resume", title: `Resume review · ${role || "general"}`, run, created: Date.now() }] }));
    return { id, run };
  });
  app.post<{ Body: { role?: string; focus?: string } }>("/api/learning/interview", async (req) => {
    const role = str(req.body?.role, 200) || learning.get().profile.goal || "software engineer", focus = str(req.body?.focus, 60) || "system design";
    const ask = ["You are an interviewer at a strong engineering company. Do not use any tools.", who(), `Role: ${role}. Focus: ${focus}.`,
      "Write 6 realistic questions for this round, increasing in difficulty. For each: what a great answer covers, a model answer outline, and the follow-up an interviewer would push on.",
      'Finish with 5–8 flashcards as a ```cards fenced JSON array of {"front": "...", "back": "..."}.'].join("\n");
    const run = supervisor.launch({ ask, title: `Interview prep · ${focus} · ${role}`.slice(0, 90), ...DEEP, labels: ["learning", "learn-kind:interview", "learn-track:interview"] });
    const id = `d_${randomUUID().slice(0, 8)}`;
    learning.edit((s) => ({ ...s, docs: [...s.docs, { id, kind: "interview", title: `Interview prep · ${focus}`, run, created: Date.now() }] }));
    return { id, run };
  });

  // ── The coach: analyzes your real progress and guides you, one conversation per mode ─────────
  app.get("/api/learning/insights", async () => analyze(learning.get()));
  const MODES = {
    analyze: { model: DEEP, title: "Coach · progress review", brief: "Give a crisp, honest analysis of their progress from the data: 3 specific insights (cite the numbers), what to focus on this week and why, and one calibrating question. Keep it under 250 words." },
    quiz: { model: MODEL, title: "Coach · quiz", brief: "Quiz them ONE question at a time, starting with their weakest and most-forgotten areas. After each answer: grade it (correct / partly / not yet), explain the gap in 2–3 sentences, then ask the next question. Keep a running score like 'Score 3/4'. When they get something wrong, add it as a card." },
    explain: { model: MODEL, title: "Coach · explain", brief: "Be a Socratic tutor: explain what they ask at their level with a concrete engineering example, then check understanding with one short question before moving on. Add a card for each key idea." },
    organize: { model: MODEL, title: "Shua · learning & career", brief: [
      "You are their learning and career organizer. They talk to you in plain words; you keep their Learn space (goal, roadmap, certifications, job search, study plan) organized and tell them what to do next.",
      "Reply in 2–5 short sentences: what you changed, then the single most useful next step. Ask one question only when something is genuinely ambiguous. Never invent dates, companies, scores or URLs.",
      'Put every change in exactly one ```learn fenced JSON array (leave it out if nothing changes). Operations: {"op":"goal","goal":"..."}; {"op":"cert","name":"...","code":"SAA-C03","provider":"AWS","status":"planned|studying|booked|passed","examDate":"YYYY-MM-DD"}; {"op":"job","company":"...","role":"...","stage":"saved|applied|interviewing|offer|closed","next":"...","nextAt":"YYYY-MM-DD","url":"https://...","notes":"..."}; {"op":"milestone","title":"words from its title","done":true}. Updates use the same company/cert name. There is no delete: if they want something removed, tell them where to remove it.'].join(" ") },
    plan: { model: DEEP, title: "Coach · today's plan", brief: "Build today's 30–45 minute plan from the data: which due cards to review, the next lesson or milestone to push, and one hands-on task in their own repos. Use a short checklist. Then ask what they want to start with." },
  } as const;
  type Mode = keyof typeof MODES;
  const context = () => {
    const s = learning.get(), a = analyze(s);
    const tracks = a.tracks.map((t) => `${t.name} (level ${t.level}/5, ${t.cards} cards, ${t.due} due, accuracy ${t.accuracy === null ? "n/a" : `${Math.round(t.accuracy * 100)}%`}, ${t.lapses} lapses${t.stale ? ", stale" : ""})`).join("; ");
    return [who(), `Skills: ${tracks || "none yet"}.`, a.weakest ? `Weakest: ${a.weakest.name}.` : "",
      a.hardest.length ? `Most-forgotten cards: ${a.hardest.map((h) => `"${h.front}" (${h.lapses}×)`).join("; ")}.` : "",
      `This week: ${a.week.reviews} reviews${a.week.accuracy === null ? "" : `, ${Math.round(a.week.accuracy * 100)}% correct`} (${a.week.change >= 0 ? "+" : ""}${a.week.change} vs last week). Cards due now: ${a.due}.`,
      a.courses.length ? `Courses: ${a.courses.map((c) => `${c.title} ${c.done}/${c.total}`).join("; ")}.` : "",
      a.roadmap ? `Roadmap "${a.roadmap.title}": ${a.roadmap.done}/${a.roadmap.total} milestones, next: ${a.roadmap.next ?? "done"}.` : "", careerContext(s)].filter(Boolean).join("\n");
  };
  app.post<{ Body: { mode?: Mode; message?: string; fresh?: boolean } }>("/api/learning/coach", async (req, reply) => {
    const mode = req.body?.mode, message = str(req.body?.message, 4000);
    if (!mode || !(mode in MODES)) return reply.code(400).send({ error: "mode: analyze | quiz | explain | plan | organize" });
    const current = learning.get().coach[mode];
    const live = current && !req.body?.fresh && supervisor.status(current.run) && !["failed", "cancelled"].includes(supervisor.status(current.run)!);
    if (live && current) {
      if (!message) return { run: current.run };
      // A short reminder rides along (hidden in the chat) so grading and cards stay consistent over a long session.
      const nudge = mode === "organize" ? `Learn right now:\n${context()}\nPut any changes in one \`\`\`learn block (upserts only; never invent dates or companies). Keep the reply short.` : mode === "quiz" ? "Grade this answer and keep the score. If it was not fully correct, end with a ```cards block covering exactly the gap." : mode === "explain" ? "If you teach a new idea, end with a ```cards block for it." : "";
      try { supervisor.followUp(current.run, nudge ? `${message}${COACH_MARK}${nudge}` : message); return { run: current.run }; } catch (e) { return reply.code(409).send({ error: (e as Error).message }); }
    }
    const m = MODES[mode];
    const ask = ["You are ShuaCrew's learning coach for a software engineer. Do not use any tools. Be warm, direct and specific — no generic advice.",
      "Ground everything in the learner data below; say so when data is thin.", m.brief,
      'When you teach something worth remembering, end that message with a ```cards fenced JSON array of {"front": "...", "back": "..."} (only new ideas).',
      "\n--- LEARNER DATA ---", context(), message ? `\n--- THEY SAY ---\n${message}` : ""].join("\n");
    const run = supervisor.launch({ ask, title: m.title, ...m.model, labels: ["learning", "learn-kind:coach", `learn-coach:${mode}`, `learn-track:${analyze(learning.get()).weakest?.id ?? "general"}`] });
    learning.edit((s) => ({ ...s, coach: { ...s.coach, [mode]: { run, started: Date.now() } } }));
    return { run };
  });
  careerRoutes(app, { learning, supervisor, who });
}
