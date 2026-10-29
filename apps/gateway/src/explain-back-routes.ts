import type { FastifyInstance } from "fastify";
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { agentEnv } from "@shuacrew/core/redact";
import { teachingCompletion, type Runtime, type TeachingUsage } from "@shuacrew/runtimes";
import type { Supervisor } from "./runs.js";
import { allowedCwd, applyPolish, CARDS_SCHEMA, CARDS_SYSTEM, cardsPrompt, extractSteps, listSessions, parseTranscript, pickExplainStep, transcriptPath, type StepCard } from "./explain-back.js";
import { fromJudge, JUDGE_SCHEMA, JUDGE_SYSTEM, judgePrompt, scoreOffline, summarizeCosts, type CostEntry, type Score } from "./explain-score.js";

type Lesson = {
  id: string;
  source: string;
  project: string;
  title: string;
  cards: StepCard[];
  explainStep: number;
  polished: boolean;
  createdAt: number;
  attempts: Array<{ step: number; answer: string; score: Score; at: number }>;
};

/**
 * Explain-back over HTTP. Transcripts come only from allowlisted personal projects (see explain-back.ts);
 * every model call's tokens and estimated cost go to explain-back/costs.jsonl, one line per call.
 */
export function explainBackRoutes(
  app: FastifyInstance,
  deps: {
    home: string; runtimes: Map<string, Runtime>; supervisor: Pick<Supervisor, "intelligence">;
    /** For tests: where transcripts live and whose home decides the allowlist, and the model call itself. */
    userHome?: string; claudeRoot?: string; complete?: typeof teachingCompletion;
  },
) {
  const userHome = deps.userHome ?? os.homedir();
  const root = deps.claudeRoot ?? path.join(userHome, ".claude", "projects");
  const dir = path.join(deps.home, "explain-back"), lessonsDir = path.join(dir, "lessons"), costFile = path.join(dir, "costs.jsonl");
  mkdirSync(lessonsDir, { recursive: true });

  const costs = (): CostEntry[] => {
    if (!existsSync(costFile)) return [];
    return readFileSync(costFile, "utf8").split("\n").flatMap((l) => { try { return l ? [JSON.parse(l) as CostEntry] : []; } catch { return []; } });
  };
  const lessonCost = (id: string) => {
    const mine = costs().filter((e) => e.lessonId === id);
    return { ...summarizeCosts(mine), entries: mine.map(({ purpose, model, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, costUsd, ms }) => ({ purpose, model, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, costUsd, ms })) };
  };
  const save = (l: Lesson) => writeFileSync(path.join(lessonsDir, `${l.id}.json`), JSON.stringify(l, null, 2));
  const load = (id: string): Lesson => {
    if (!/^xb_[a-f0-9]{8}$/.test(id)) throw new Error("No such lesson");
    const file = path.join(lessonsDir, `${id}.json`);
    if (!existsSync(file)) throw new Error("No such lesson");
    return JSON.parse(readFileSync(file, "utf8")) as Lesson;
  };
  const view = (l: Lesson) => ({ ...l, cost: lessonCost(l.id) });

  /** A fast Claude model on the person's own login, or null: then everything still works offline, at no AI cost. */
  const pickModel = (): string | null => {
    if (!deps.runtimes.has("claude")) return null;
    const choice = deps.supervisor.intelligence({ ask: "Explain-back lesson", mode: "auto", purpose: "work", images: false, tier: "fast", preferredRuntime: "claude" });
    return choice.runtime === "claude" ? choice.model : null;
  };
  const ask = async (lessonId: string, purpose: CostEntry["purpose"], prompt: string, system: string, schema: Record<string, unknown>) => {
    const model = pickModel();
    if (!model) return { raw: null, model: null };
    const began = Date.now();
    let usage: TeachingUsage | null = null;
    try {
      const raw = await (deps.complete ?? teachingCompletion)({
        prompt, system, schema, model, cwd: dir, env: agentEnv(process.env, "subscription"),
        signal: AbortSignal.timeout(90_000), images: [], onUsage: (u) => (usage = u),
      });
      return { raw, model };
    } catch (e) {
      app.log.warn({ err: (e as Error).message, purpose }, "explain-back model call failed");
      return { raw: null, model };
    } finally {
      if (usage) appendFileSync(costFile, `${JSON.stringify({ ...(usage as TeachingUsage), lessonId, purpose, at: Date.now(), ms: Date.now() - began } satisfies CostEntry)}\n`);
    }
  };
  const fail = (reply: any, e: unknown, code = 400) => reply.code(code).send({ error: (e as Error).message });

  app.get("/api/explain-back/sessions", async () => ({ sessions: listSessions(root, userHome) }));

  app.get("/api/explain-back/costs", async () => summarizeCosts(costs()));

  app.get<{ Params: { id: string } }>("/api/explain-back/lessons/:id", async (q, r) => {
    try { return view(load(q.params.id)); } catch (e) { return fail(r, e, 404); }
  });

  app.post("/api/explain-back/lessons", async (q, r) => {
    try {
      const { session } = z.object({ session: z.string().min(3).max(300) }).strict().parse(q.body);
      const file = transcriptPath(root, session, userHome);
      if (statSync(file).size > 40_000_000) throw new Error("That session is too large for a lesson");
      const parsed = parseTranscript(readFileSync(file, "utf8"));
      if (!parsed.cwd || !allowedCwd(parsed.cwd, userHome)) throw new Error("That session isn't one ShuaCrew may read");
      const cards = extractSteps(parsed);
      if (!cards.length) return r.code(422).send({ error: "This session has no commands or edits to learn from." });
      const id = `xb_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
      const polish = await ask(id, "cards", cardsPrompt(parsed.title, cards), CARDS_SYSTEM, CARDS_SCHEMA);
      const applied = applyPolish(cards, polish.raw);
      const lesson: Lesson = {
        id, source: session, project: path.basename(parsed.cwd), title: parsed.title || path.basename(parsed.cwd),
        cards: applied.cards, explainStep: pickExplainStep(applied.cards), polished: applied.polished, createdAt: Date.now(), attempts: [],
      };
      save(lesson);
      return view(lesson);
    } catch (e) { return fail(r, e); }
  });

  app.post<{ Params: { id: string } }>("/api/explain-back/lessons/:id/answer", async (q, r) => {
    try {
      const body = z.object({ step: z.number().int().min(0).max(9), answer: z.string().trim().min(3).max(4000) }).strict().parse(q.body);
      const lesson = load(q.params.id), card = lesson.cards[body.step];
      if (!card) throw new Error("No such step");
      const offline = scoreOffline(card, body.answer);
      const judged = await ask(lesson.id, "score", judgePrompt(card, body.answer), JUDGE_SYSTEM, JUDGE_SCHEMA);
      const score = judged.raw && judged.model ? fromJudge(judged.raw, offline, judged.model) : offline;
      lesson.attempts.push({ step: body.step, answer: body.answer, score, at: Date.now() });
      save(lesson);
      return { score, cost: lessonCost(lesson.id) };
    } catch (e) { return fail(r, e); }
  });
}
