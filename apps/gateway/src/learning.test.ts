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
