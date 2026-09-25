import type { FastifyInstance } from "fastify";
import type { AnyEvent } from "@shuacrew/core";
import type { EventStore } from "./store.js";
import type { Supervisor } from "./runs.js";
import { Learning, parseCards, type Grade } from "./learning.js";

const today = () => new Date().toISOString().slice(0, 10);
const MODEL = { runtime: "claude", model: "claude-haiku-4-5", effort: "low" } as const; // efficient on your plan

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
  store.subscribe((e) => {
    if (e.kind !== "run.status" || e.body.status !== "done" || !e.run) return;
    const created = store.forRun(e.run).find((x) => x.kind === "run.created");
    if (created?.kind !== "run.created" || !created.body.labels.includes("learning")) return;
    if (learning.get().cards.some((c) => c.source.run === e.run)) return;
    const reply = [...store.forRun(e.run)].reverse().find((x) => x.kind === "agent.message");
    const cards = reply?.kind === "agent.message" ? parseCards(reply.body.text) : [];
    const trackId = created.body.labels.find((l) => l.startsWith("learn-track:"))?.slice(12) ?? "general";
    if (cards.length) learning.addCards(cards, trackId, { run: e.run, title: created.body.title });
    if (created.body.labels.includes("learn-kind:drill")) learning.markDrillDone(today());
  });

  app.get("/api/learning", async () => {
    const s = learning.get(), now = Date.now();
    const week = Array.from({ length: 14 }, (_, i) => { const d = new Date(now - (13 - i) * 86_400_000).toISOString().slice(0, 10); return { day: d, reviews: s.reviews.filter((r) => new Date(r.at).toISOString().slice(0, 10) === d).length }; });
    return { ...s, reviews: undefined, due: learning.due(now).length, days: week, totalReviews: s.reviews.length, drill: s.drills.find((d) => d.day === today()) ?? null };
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
}
