import { mkdtempSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { Learning, parseCards, schedule } from "./learning.js";

const DAY = 86_400_000, now = 1_000_000_000_000;
it("schedules like SM-2: again soon, good grows, easy grows faster", () => {
  const fresh = { interval: 0, ease: 2.5, reps: 0, lapses: 0 };
  expect(schedule(fresh, "again", now)).toMatchObject({ reps: 0, lapses: 1, due: now + 10 * 60_000 });
  const g1 = schedule(fresh, "good", now); expect(g1).toMatchObject({ interval: 1, due: now + DAY });
  const g2 = schedule(g1, "good", now); expect(g2.interval).toBe(3);
  const g3 = schedule(g2, "good", now); expect(g3.interval).toBe(8);
  const e3 = schedule(g2, "easy", now); expect(e3.interval).toBeGreaterThan(g3.interval);
  expect(schedule({ ...g2, ease: 1.35 }, "again", now).ease).toBe(1.3);
});
it("parses cards from a teaching reply and ignores junk", () => {
  const reply = "Here's what happened...\n```cards\n[{\"front\":\"What is a worktree?\",\"back\":\"A second checkout of the same repo.\"},{\"front\":\"x\"}]\n```";
  expect(parseCards(reply)).toEqual([{ front: "What is a worktree?", back: "A second checkout of the same repo." }]);
  expect(parseCards("no cards here")).toEqual([]);
  expect(parseCards("```cards\nnot json\n```")).toEqual([]);
});
it("persists privately, reviews cards, and finds the weakest focus track", () => {
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), "shua-learn-")), "learning.json");
  const l = new Learning(file);
  l.setProfile({ goal: "Agentic software engineer", tracks: [{ id: "evals", name: "LLM evals", level: 1, focus: true }, { id: "swift", name: "Swift", level: 3, focus: true }, { id: "css", name: "CSS", level: 1, focus: false }] });
  const [c] = l.addCards([{ front: "Q", back: "A" }], "evals", { run: "r_1" }, now);
  expect(l.due(now)).toHaveLength(1);
  l.review(c!.id, "good", now);
  expect(l.due(now)).toHaveLength(0);
  expect(l.weakest()?.id).toBe("evals");
  expect(statSync(file).mode & 0o777).toBe(0o600);
  expect(new Learning(file).get().cards[0]!.reps).toBe(1);
});

it("puts a finished lesson's cards into the deck once, and ignores ordinary sessions", async () => {
  const Fastify = (await import("fastify")).default, { EventStore } = await import("./store.js"), { learningRoutes } = await import("./learning-routes.js");
  const store = new EventStore(":memory:"), app = Fastify(), l = new Learning(path.join(mkdtempSync(path.join(os.tmpdir(), "shua-learn-")), "l.json"));
  learningRoutes(app, { learning: l, store, supervisor: { status: () => "done", launch: () => "r_x" } as never });
  const base = { ask: "a", runtime: "claude", labels: [] as string[], incognito: false };
  store.append("run.created", { ...base, title: "Learn from: fix", labels: ["learning", "learn-kind:study", "learn-track:evals"] }, { run: "r_lesson" });
  store.append("agent.message", { turn: 1, text: 'Lesson…\n```cards\n[{"front":"Why pin eval seeds?","back":"So runs are comparable."}]\n```' }, { run: "r_lesson" });
  store.append("run.status", { status: "done" }, { run: "r_lesson" });
  store.append("run.status", { status: "done" }, { run: "r_lesson" });
  store.append("run.created", { ...base, title: "Normal work" }, { run: "r_work" });
  store.append("agent.message", { turn: 1, text: '```cards\n[{"front":"no","back":"no"}]\n```' }, { run: "r_work" });
  store.append("run.status", { status: "done" }, { run: "r_work" });
  expect(l.get().cards.map((c) => [c.front, c.track, c.source.run])).toEqual([["Why pin eval seeds?", "evals", "r_lesson"]]);
  const res = await app.inject("/api/learning"); expect(res.json()).toMatchObject({ due: 1 });
  await app.close(); store.close();
});

it("reads a named JSON block and keeps courses and roadmaps validated", async () => {
  const { parseBlock } = await import("./learning.js");
  expect(parseBlock('intro\n```course\n{"title":"K8s","lessons":[{"title":"Pods"}]}\n```', "course")).toEqual({ title: "K8s", lessons: [{ title: "Pods" }] });
  expect(parseBlock("```course\nnope\n```", "course")).toBeUndefined();
  const l = new Learning(path.join(mkdtempSync(path.join(os.tmpdir(), "shua-learn-")), "l.json"));
  l.edit((s) => ({ ...s, courses: [{ id: "k", topic: "Kubernetes", level: 2, title: "", created: 1, lessons: [{ title: "Pods", summary: "", done: false }] }] }));
  expect(l.get().courses[0]!.lessons[0]!.title).toBe("Pods");
  expect(() => l.edit((s) => ({ ...s, roadmaps: [{ id: "r", goal: "x", months: 99, title: "", run: "r", created: 1, milestones: [] }] }))).toThrow();
});

it("fills a course plan and a roadmap from finished runs, once, ignoring junk entries", async () => {
  const Fastify = (await import("fastify")).default, { EventStore } = await import("./store.js"), { learningRoutes } = await import("./learning-routes.js");
  const store = new EventStore(":memory:"), app = Fastify(), l = new Learning(path.join(mkdtempSync(path.join(os.tmpdir(), "shua-learn-")), "l.json"));
  let n = 0; learningRoutes(app, { learning: l, store, supervisor: { status: () => "done", launch: () => `r_${++n}` } as never });
  l.setProfile({ goal: "Agentic software engineer" });
  const c = (await app.inject({ method: "POST", url: "/api/learning/courses", payload: { topic: "Kubernetes", level: 2 } })).json();
  const r = (await app.inject({ method: "POST", url: "/api/learning/roadmaps", payload: { months: 6 } })).json();
  const finish = (run: string, labels: string[], text: string) => {
    store.append("run.created", { title: "t", ask: "a", runtime: "claude", labels, incognito: false }, { run });
    store.append("agent.message", { turn: 1, text }, { run });
    store.append("run.status", { status: "done" }, { run });
  };
  finish(c.run, ["learning", "learn-kind:course-plan", `learn-course:${c.id}`], 'Plan:\n```course\n{"title":"K8s for builders","lessons":[{"title":"Pods","summary":"Run one"},{"summary":"no title"},{"title":"Services"}]}\n```');
  finish(r.run, ["learning", "learn-kind:roadmap", `learn-roadmap:${r.id}`], '```roadmap\n{"title":"To agentic engineer","milestones":[{"title":"Evals","skills":["pytest",5],"project":"Eval harness","weeks":3},{"title":"","why":"x"}]}\n```');
  const s = l.get();
  expect(s.courses[0]).toMatchObject({ title: "K8s for builders", lessons: [{ title: "Pods", summary: "Run one" }, { title: "Services" }] });
  expect(s.roadmaps[0]).toMatchObject({ goal: "Agentic software engineer", months: 6, title: "To agentic engineer", milestones: [{ title: "Evals", skills: ["pytest"], project: "Eval harness", weeks: 3 }] });
  const lesson = (await app.inject({ method: "POST", url: `/api/learning/courses/${c.id}/lessons/0` })).json();
  expect((await app.inject({ method: "POST", url: `/api/learning/courses/${c.id}/lessons/0` })).json()).toEqual(lesson); // opening again reuses it
  expect((await app.inject({ method: "POST", url: "/api/learning/resume", payload: { resume: "short" } })).statusCode).toBe(400);
  await app.close(); store.close();
});

it("accepts a ```json fence when the model skips the named one", async () => {
  const { parseBlock } = await import("./learning.js");
  const reply = 'Intro\n```json\n{"title":"K8s","lessons":[{"title":"Pods","summary":"x"}]}\n```\nbye';
  expect(parseBlock(reply, "course", "lessons")).toMatchObject({ title: "K8s" });
  expect(parseBlock('```json\n{"other":1}\n```', "course", "lessons")).toBeUndefined();
  expect(parseBlock('Here: {"milestones":[{"title":"A"}]} done', "roadmap", "milestones")).toMatchObject({ milestones: [{ title: "A" }] });
});

it("analyzes real reviews: accuracy per skill, weakest, hardest cards, stale areas", async () => {
  const { analyze } = await import("./learning.js");
  const l = new Learning(path.join(mkdtempSync(path.join(os.tmpdir(), "shua-learn-")), "l.json"));
  l.setProfile({ goal: "x", tracks: [{ id: "evals", name: "Evals", level: 2, focus: true }, { id: "ts", name: "TypeScript", level: 4, focus: true }] });
  const [e1, e2] = l.addCards([{ front: "E1", back: "a" }, { front: "E2", back: "b" }], "evals", {}, now);
  const [t1] = l.addCards([{ front: "T1", back: "c" }], "ts", {}, now - 30 * DAY);
  l.review(e1!.id, "again", now); l.review(e1!.id, "again", now); l.review(e2!.id, "good", now);
  l.review(t1!.id, "good", now - 20 * DAY); l.review(t1!.id, "easy", now - 20 * DAY); l.review(t1!.id, "good", now - 20 * DAY);
  const a = analyze(l.get(), now);
  const evals = a.tracks.find((t) => t.id === "evals")!;
  expect(evals).toMatchObject({ reviews: 3, lapses: 2, stale: false }); expect(evals.accuracy).toBeCloseTo(1 / 3);
  expect(a.weakest?.name).toBe("Evals");
  expect(a.hardest[0]).toMatchObject({ front: "E1", lapses: 2 });
  expect(a.stale).toEqual(["TypeScript"]);
  expect(a.week.reviews).toBe(3);
});

it("coach: starts a mode with real learner data, continues the same session, and restarts on request", async () => {
  const Fastify = (await import("fastify")).default, { EventStore } = await import("./store.js"), { learningRoutes } = await import("./learning-routes.js");
  const store = new EventStore(":memory:"), app = Fastify(), l = new Learning(path.join(mkdtempSync(path.join(os.tmpdir(), "shua-learn-")), "l.json"));
  const launched: string[] = [], followed: Array<[string, string]> = []; let n = 0;
  learningRoutes(app, { learning: l, store, supervisor: { status: () => "done", launch: (s: { ask: string }) => (launched.push(s.ask), `r_${++n}`), followUp: (run: string, text: string) => followed.push([run, text]) } as never });
  l.setProfile({ goal: "Agentic software engineer", tracks: [{ id: "evals", name: "LLM evals", level: 2, focus: true }] });
  const first = (await app.inject({ method: "POST", url: "/api/learning/coach", payload: { mode: "quiz" } })).json();
  expect(launched[0]).toContain("LLM evals (level 2/5"); expect(launched[0]).toContain("one question at a time".replace("one", "ONE"));
  const second = (await app.inject({ method: "POST", url: "/api/learning/coach", payload: { mode: "quiz", message: "An eval is a test for model output" } })).json();
  expect(second.run).toBe(first.run); expect(followed[0]![1].split("\n\n[coach] ")[0]).toBe("An eval is a test for model output"); expect(followed[0]![1]).toContain("```cards");
  const fresh = (await app.inject({ method: "POST", url: "/api/learning/coach", payload: { mode: "quiz", fresh: true } })).json();
  expect(fresh.run).not.toBe(first.run);
  expect((await app.inject({ method: "POST", url: "/api/learning/coach", payload: { mode: "nope" } })).statusCode).toBe(400);
  expect((await app.inject("/api/learning/insights")).json()).toMatchObject({ weakest: { name: "LLM evals" } });
  await app.close(); store.close();
});

it("new cards are not stale, and untracked cards read as General", async () => {
  const { analyze } = await import("./learning.js");
  const l = new Learning(path.join(mkdtempSync(path.join(os.tmpdir(), "shua-learn-")), "l.json"));
  l.addCards([{ front: "Q", back: "A" }], "general", {}, now);
  expect(analyze(l.get(), now + DAY).tracks[0]).toMatchObject({ name: "General", stale: false });
  expect(analyze(l.get(), now + 8 * DAY).tracks[0]!.stale).toBe(true);
});

it("launches learning courses and coaching through Codex without legacy model IDs", async () => {
  const Fastify = (await import("fastify")).default, { EventStore } = await import("./store.js"), { learningRoutes } = await import("./learning-routes.js");
  const store = new EventStore(":memory:"), app = Fastify(), learning = new Learning(path.join(mkdtempSync(path.join(os.tmpdir(), "shua-learn-")), "l.json"));
  const launches: Array<{ runtime: string; model?: string }> = [];
  learningRoutes(app, { learning, store, supervisor: { status: () => "done", launch: (spec: { runtime: string; model?: string }) => { launches.push(spec); return `r_${launches.length}`; } } as never });
  try {
    expect((await app.inject({ method: "POST", url: "/api/learning/courses", payload: { topic: "Swift" } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/api/learning/coach", payload: { mode: "explain", message: "Explain a queue" } })).statusCode).toBe(200);
    expect(launches).toHaveLength(2);
    for (const spec of launches) { expect(spec.runtime).toBe("codex"); expect(spec.model).toBeUndefined(); }
  } finally { await app.close(); store.close(); }
});
