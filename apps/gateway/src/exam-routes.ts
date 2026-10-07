/**
 * Exam prep over HTTP, and the work Shua does for it. One call gives the whole picture for a certification (blueprint,
 * mastery, predicted score, verdict, today's plan). Practice sets and mock exams are drawn here and every answer is
 * recorded here. Shua researches the official exam guide (web) into a blueprint, and writes exam-style questions per
 * domain; the bank tops itself up where it's running low, so practice is never waiting on a model mid-session. A
 * missed question also becomes a flashcard in the cert's deck.
 */
import type { FastifyInstance, FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";
import { BUILTIN, ExamPrep, applyVerdicts, examKey, parseBlueprint, parseQuestions, parseVerdicts, type Blueprint, type Domain, type Question } from "./exam-prep.js";
import { isRight, mastery, mockSet, pick, predict, progress, scoreMock, studyPlan, verdict } from "./exam-logic.js";
import { parseBlock, type Learning } from "./learning.js";
import type { Supervisor } from "./runs.js";

const DEEP = { runtime: "codex", effort: "medium" } as const;
const STALE = 30 * 60_000; // a research or writing run that hasn't reported in half an hour is presumed gone
const COOL = 15 * 60_000; // one that finished without adding anything isn't asked again for a quarter of an hour
const LOW = 6; // fewer unanswered questions than this in a domain: write more

const bad = (reply: FastifyReply, error: string, code = 400) => reply.code(code).send({ error });

/** The questions in a reply: a ```quiz array, or any fenced JSON array of objects with a stem. */
/** A check run's ```verdicts block (or any fenced array of verdicts). */
export function verdictBlock(text: string): unknown {
  const tryParse = (s: string) => { try { return JSON.parse(s.trim()) as unknown; } catch { return undefined; } };
  const named = /```verdicts\s*([\s\S]*?)```/i.exec(text)?.[1];
  if (named) { const v = tryParse(named); if (v !== undefined) return v; }
  for (const m of text.matchAll(/```[a-z]*\s*([\s\S]*?)```/gi)) { const v = tryParse(m[1]!); if (Array.isArray(v) && v.some((x) => x && typeof x === "object" && "verdict" in x)) return v; }
  return undefined;
}

/** Ask a fresh run to check answer keys against the docs: a second pair of eyes, not the one that wrote them. */
export function verifyAsk(bp: Blueprint, qs: Question[]): string {
  return [
    `Check these ${qs.length} practice questions for ${bp.name} (${bp.code}) against the current official documentation. Someone studying for the real exam will learn from them, so be strict: a wrong answer key teaches the wrong thing.`,
    "For each question, look up what settles it in the official docs (don't rely on memory), then decide:",
    '- "correct": the keyed answer is clearly the best by what the stem asks (least operational overhead, most cost-effective, …). Give the sentence from the docs that settles it.',
    '- "wrong": a different option is right. Give the right option letter(s) — the same number as now — a 3–5 sentence explanation, one line on why each other option is wrong, and the sentence from the docs.',
    '- "unclear": the docs don\'t settle it, or two options could both be defended. Say why in a note.',
    `Questions: ${JSON.stringify(qs.map((q) => ({ id: q.id, stem: q.stem, options: q.options, answer: q.answer })))}`,
    'Return exactly one ```verdicts fenced JSON array, one entry per question: [{"id": "…", "verdict": "correct", "evidence": "…", "refs": ["https://docs.aws.amazon.com/…"]}, {"id": "…", "verdict": "wrong", "answer": ["C"], "explain": "…", "why": {"A": "…", "B": "…", "D": "…"}, "evidence": "…", "refs": ["https://…"]}, {"id": "…", "verdict": "unclear", "note": "…"}]',
  ].join("\n");
}

export function quizBlock(text: string): unknown {
  const named = /```quiz\s*([\s\S]*?)```/i.exec(text)?.[1];
  const tryParse = (s: string) => { try { return JSON.parse(s.trim()) as unknown; } catch { return undefined; } };
  if (named) { const v = tryParse(named); if (v !== undefined) return v; }
  for (const m of text.matchAll(/```[a-z]*\s*([\s\S]*?)```/gi)) { const v = tryParse(m[1]!); if (Array.isArray(v) && v.some((x) => x && typeof x === "object" && "stem" in x)) return v; }
  return undefined;
}

/** Same question twice (written again, or by a second run): kept once. */
const fingerprint = (q: Pick<Question, "stem">) => q.stem.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 140);

export function researchAsk(cert: { name: string; code: string; provider: string }): string {
  return [
    `Research the official exam guide for the ${cert.provider ? `${cert.provider} ` : ""}"${cert.name}" certification${cert.code ? ` (${cert.code})` : ""}.`,
    "Use web search and read the provider's own exam guide and exam page — not third-party summaries. Note the current version of the exam.",
    "Return exactly one ```blueprint fenced JSON object:",
    '{"code": "exam code", "name": "official name", "provider": "…", "url": "https://the official exam page", "questions": total questions, "scored": scored questions or null, "minutes": duration, "passing": passing score, "scale": [min, max], "formats": ["question formats, e.g. Multiple choice"], "domains": [{"name": "…", "weight": percent of the exam, "tasks": [{"id": "1.1", "title": "the guide\'s task statement", "skills": ["services and concepts it tests"]}]}]}',
    "Weights are the guide's own percentages and sum to 100. Use the guide's task statements word for word. If the guide doesn't state a number, use null — never guess.",
  ].join("\n");
}

export function questionsAsk(bp: Blueprint, d: Domain, n: number, avoid: string[], taskId?: string): string {
  const task = d.tasks.find((t) => t.id === taskId);
  return [
    `Write ${n} exam-style practice questions for ${bp.name} (${bp.code}), domain "${d.name}" (${d.weight}% of the exam)${task ? `, task ${task.id}: ${task.title}` : ""}.`,
    `The domain's tasks: ${d.tasks.map((t) => `${t.id} ${t.title}${t.skills.length ? ` (${t.skills.join(", ")})` : ""}`).join("; ")}.`,
    "Match the real exam:",
    "- Scenario stems of 2–5 sentences: a company's situation with concrete constraints, ending in a direct question such as \"Which solution meets these requirements with the LEAST operational overhead?\"",
    "- About three in four have one answer and 4 options; the rest are \"(Choose two.)\" with 5 options and exactly 2 correct, or \"(Choose three.)\" with 6 options and exactly 3 correct — say so at the end of the stem.",
    "- One answer is clearly best by the exam's priorities (best practice, least overhead, most cost-effective — whatever the stem asks). Distractors are plausible: real services used wrongly, missing a requirement, or more operational work.",
    "- Spread them over the tasks; current services and features only; no trivia, no \"all of the above\".",
    "- For each: why the right answer is right in 3–5 sentences (the principle, not just the fact), one line on why each other option is wrong, and 1–2 official documentation URLs.",
    "Accuracy comes first — a wrong answer key teaches the wrong thing:",
    "- Check every answer against the current official documentation before you write it (look it up; don't rely on memory). Put the sentence from the docs that settles it in \"evidence\" (quoted, under 300 characters) and that page first in \"refs\".",
    "- If the docs don't clearly settle it, or two options could both be defended, drop the question. Fewer, correct questions beat more, shaky ones.",
    "- Respect service limits, defaults and names as they are today; when the exam guide still covers an older service, test it the way the guide does.",
    avoid.length ? `Already in the bank, so don't repeat these: ${avoid.slice(0, 40).map((s) => `"${s.slice(0, 90)}"`).join("; ")}.` : "",
    'Return exactly one ```quiz fenced JSON array: [{"task": "1.4", "stem": "…", "options": [{"id": "A", "text": "…"}, …], "answer": ["B"], "explain": "…", "why": {"A": "…", "C": "…", "D": "…"}, "evidence": "…", "refs": ["https://…"], "difficulty": 2}]',
  ].filter(Boolean).join("\n");
}

export function examRoutes(app: FastifyInstance, deps: { prep: ExamPrep; learning: Learning; supervisor: Supervisor }) {
  const { prep, learning, supervisor } = deps;
  const certOf = (id: string) => learning.get().certs.find((c) => c.id === id);
  const keyOf = (c: { code: string; name: string }) => examKey(c.code || c.name);
  const busy = (k: string) => { const w = prep.get().working[k]; return !!w && !w.done && Date.now() - w.started < STALE; };
  /** Asked recently and it came back empty-handed: wait before asking again (never a loop of runs). */
  const cooling = (k: string) => { const w = prep.get().working[k]; return !!w?.done && !w.added && Date.now() - w.done < COOL; };

  /** Research the official guide (once at a time per exam). */
  const research = (c: { name: string; code: string; provider: string }) => {
    const key = keyOf(c), k = `bp:${key}`;
    if (busy(k) || cooling(k)) return prep.get().working[k]!.run;
    const run = supervisor.launch({ ask: researchAsk(c), title: `Exam guide · ${c.code || c.name}`.slice(0, 90), ...DEEP, labels: ["learning", "learn-kind:exam-blueprint", `exam-cert:${key}`] });
    prep.edit((s) => ({ ...s, working: { ...s.working, [k]: { run, started: Date.now() } } }));
    return run;
  };
  /** Write questions for one domain (once at a time per domain). */
  const write = (bp: Blueprint, d: Domain, n = 8, task?: string) => {
    const k = `q:${bp.code}:${d.id}`;
    if (busy(k) || cooling(k)) return prep.get().working[k]!.run;
    const avoid = prep.get().questions.filter((q) => q.cert === bp.code && q.domain === d.id).map((q) => q.stem).slice(-40);
    const run = supervisor.launch({ ask: questionsAsk(bp, d, n, avoid, task), title: `Practice questions · ${bp.code} · ${d.name}`.slice(0, 90), ...DEEP, labels: ["learning", "learn-kind:exam-questions", `exam-cert:${bp.code}`, `exam-domain:${d.id}`] });
    prep.edit((s) => ({ ...s, working: { ...s.working, [k]: { run, started: Date.now() } } }));
    return run;
  };
  /** Check answer keys Shua hasn't checked yet, a dozen at a time, one check at a time. */
  const verify = (bp: Blueprint) => {
    const k = `v:${bp.code}`;
    if (busy(k) || cooling(k)) return null;
    const todo = bankOf(bp.code).filter((q) => !q.checked).sort((a, b) => a.created - b.created).slice(0, 12);
    if (!todo.length) return null;
    const run = supervisor.launch({ ask: verifyAsk(bp, todo), title: `Checking answers · ${bp.code} · ${todo.length} questions`.slice(0, 90), ...DEEP, labels: ["learning", "learn-kind:exam-verify", `exam-cert:${bp.code}`] });
    prep.edit((s) => ({ ...s, working: { ...s.working, [k]: { run, started: Date.now() } } }));
    return run;
  };
  /** A missed question's flashcard front: its stem, cut at a word if it's long. */
  const cardFront = (q: Question) => (q.stem.length > 420 ? `${q.stem.slice(0, 400).replace(/\s+\S*$/, "")}…` : q.stem);
  /** The bank that counts: this exam's questions, minus any you reported as wrong. */
  const bankOf = (code: string) => prep.get().questions.filter((q) => q.cert === code && !q.flag);
  /** Keep every domain stocked: write more where unanswered questions run low (at most `max` domains at once). */
  const topUp = (bp: Blueprint, max = 3) => {
    const s = prep.get(), answered = new Set(s.attempts.map((a) => a.q));
    const left = (d: Domain) => bankOf(bp.code).filter((q) => q.domain === d.id && !answered.has(q.id)).length;
    return [...bp.domains].filter((d) => left(d) < LOW && !busy(`q:${bp.code}:${d.id}`) && !cooling(`q:${bp.code}:${d.id}`)).sort((a, b) => left(a) - left(b) || b.weight - a.weight).slice(0, max).map((d) => write(bp, d));
  };

  /** The whole picture for one certification. */
  app.get<{ Params: { cert: string } }>("/api/exam/:cert", async (req, reply) => {
    const c = certOf(req.params.cert); if (!c) return bad(reply, "No such certification.", 404);
    const key = keyOf(c), bp = prep.blueprint(key);
    if (!bp) return { cert: c, key, blueprint: null, researching: busy(`bp:${key}`) ? prep.get().working[`bp:${key}`]!.run : cooling(`bp:${key}`) ? null : research(c), failed: cooling(`bp:${key}`) };
    const s = prep.get(), mine = bankOf(bp.code), m = mastery(bp, mine, s.attempts);
    const writing = Object.fromEntries(bp.domains.map((d) => [d.id, busy(`q:${bp.code}:${d.id}`)]));
    if (mine.length < 24) topUp(bp); // a new bank: get every domain started
    verify(bp); // and every answer key checked against the docs
    const missed = pick(bp, mine, s.attempts, m, 200, { mode: "missed" }).length;
    return {
      cert: c, key, blueprint: bp, researching: busy(`bp:${key}`) ? s.working[`bp:${key}`]!.run : null, builtin: bp.source === "builtin",
      mastery: m, predicted: predict(bp, m), verdict: verdict(bp, m, s.mocks), progress: progress(bp, mine, s.attempts),
      plan: studyPlan(bp, m, s.mocks, { examDate: c.examDate, hoursPerWeek: hoursFrom(learning.get().profile.goal), dueCards: learning.due().filter((x) => x.track === c.track).length }),
      bank: { total: mine.length, perDomain: Object.fromEntries(bp.domains.map((d) => [d.id, mine.filter((q) => q.domain === d.id).length])), writing, missed },
      mocks: s.mocks.filter((x) => x.cert === bp.code).map(({ id, started, finished, correct, score, questions }) => ({ id, started, finished, correct, score, total: questions.length })).slice(-10),
    };
  });

  /** Ask Shua to (re)research the official guide. */
  app.post<{ Params: { cert: string } }>("/api/exam/:cert/research", async (req, reply) => {
    const c = certOf(req.params.cert); if (!c) return bad(reply, "No such certification.", 404);
    return { run: research(c) };
  });

  /** Write more questions: one domain (optionally one task), or wherever the bank is lowest. */
  app.post<{ Params: { cert: string }; Body: { domain?: string; task?: string; count?: number } }>("/api/exam/:cert/questions", async (req, reply) => {
    const c = certOf(req.params.cert); if (!c) return bad(reply, "No such certification.", 404);
    const bp = prep.blueprint(keyOf(c)); if (!bp) return bad(reply, "Shua is still reading the exam guide.", 409);
    const d = bp.domains.find((x) => x.id === req.body?.domain);
    const n = Math.min(12, Math.max(3, Math.round(Number(req.body?.count) || 8)));
    return { runs: d ? [write(bp, d, n, req.body?.task)] : topUp(bp, bp.domains.length) };
  });

  /** A practice set. quick: adaptive · drill: one domain · missed: wrong answers that are due · diagnostic: a weighted spread. */
  app.get<{ Params: { cert: string }; Querystring: { mode?: string; domain?: string; n?: string } }>("/api/exam/:cert/practice", async (req, reply) => {
    const c = certOf(req.params.cert); if (!c) return bad(reply, "No such certification.", 404);
    const bp = prep.blueprint(keyOf(c)); if (!bp) return bad(reply, "Shua is still reading the exam guide.", 409);
    const mode = (["quick", "drill", "missed", "diagnostic"] as const).find((x) => x === req.query.mode) ?? "quick";
    const s = prep.get(), mine = bankOf(bp.code), m = mastery(bp, mine, s.attempts);
    const n = Math.min(40, Math.max(1, Math.round(Number(req.query.n) || (mode === "diagnostic" ? 20 : 10))));
    const questions = pick(bp, mine, s.attempts, m, n, { mode, domain: mode === "drill" ? req.query.domain : undefined });
    if (questions.length < n && mode !== "missed") topUp(bp);
    return { mode, questions, short: questions.length < n };
  });

  /** One answer. Right or wrong comes back with the answer; a miss becomes a flashcard in the cert's deck. */
  app.post<{ Body: { q?: string; chosen?: unknown; ms?: number; mode?: string; sure?: unknown } }>("/api/exam/attempts", async (req, reply) => {
    const q = prep.get().questions.find((x) => x.id === req.body?.q); if (!q) return bad(reply, "No such question.", 404);
    const chosen = (Array.isArray(req.body?.chosen) ? req.body!.chosen : []).map((x) => String(x).toUpperCase()).filter((x) => q.options.some((o) => o.id === x)).slice(0, 8);
    if (!chosen.length) return bad(reply, "Choose an answer.");
    const mode = (["quick", "drill", "missed", "diagnostic"] as const).find((x) => x === req.body?.mode) ?? "quick";
    const correct = isRight(q, chosen);
    prep.edit((s) => ({ ...s, attempts: [...s.attempts, { q: q.id, at: Date.now(), chosen, correct, ms: Math.max(0, Number(req.body?.ms) || 0), mode, ...(typeof req.body?.sure === "boolean" ? { sure: req.body.sure } : {}) }].slice(-40_000) }));
    if (!correct) missCard(q);
    const bp = prep.blueprint(q.cert); if (bp) topUp(bp, 1);
    return { correct, answer: q.answer };
  });

  /** "Something's wrong with this one": out of practice, mocks and mastery, and its miss card out of your deck. */
  app.post<{ Params: { id: string }; Body: { note?: string } }>("/api/exam/questions/:id/flag", async (req, reply) => {
    const q = prep.get().questions.find((x) => x.id === req.params.id); if (!q) return bad(reply, "No such question.", 404);
    const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 500) : "";
    prep.edit((s) => ({ ...s, questions: s.questions.map((x) => (x.id === q.id ? { ...x, flag: { at: Date.now(), note } } : x)) }));
    const front = cardFront(q);
    learning.edit((s) => ({ ...s, cards: s.cards.filter((k) => !(k.front === front && k.source.title === `Missed · ${q.cert}`)) }));
    const bp = prep.blueprint(q.cert); if (bp) topUp(bp, 1);
    return { ok: true };
  });

  /** Start a mock exam: the real exam's length and weighting, its clock. */
  app.post<{ Params: { cert: string } }>("/api/exam/:cert/mocks", async (req, reply) => {
    const c = certOf(req.params.cert); if (!c) return bad(reply, "No such certification.", 404);
    const bp = prep.blueprint(keyOf(c)); if (!bp) return bad(reply, "Shua is still reading the exam guide.", 409);
    const s = prep.get(), set = mockSet(bp, bankOf(bp.code), s.attempts);
    if (set.length < Math.min(20, bp.questions)) { topUp(bp, bp.domains.length); return bad(reply, `The question bank has ${set.length} questions; Shua is writing more for a full mock. Try a practice set meanwhile.`, 409); }
    const minutes = Math.round((bp.minutes * set.length) / bp.questions); // a shorter mock keeps the real pace
    const mock = { id: `mk_${randomUUID().slice(0, 8)}`, cert: bp.code, started: Date.now(), minutes, questions: set.map((q) => q.id), answers: {}, flagged: [] };
    prep.edit((x) => ({ ...x, mocks: [...x.mocks, mock].slice(-200) }));
    return { mock, questions: set };
  });
  /** Save answers and flags as you go (a mock survives a closed window). */
  app.post<{ Params: { id: string }; Body: { answers?: Record<string, unknown>; flagged?: unknown } }>("/api/exam/mocks/:id", async (req, reply) => {
    const mk = prep.get().mocks.find((x) => x.id === req.params.id); if (!mk) return bad(reply, "No such mock exam.", 404);
    if (mk.finished) return bad(reply, "That mock is finished.", 409);
    const answers = Object.fromEntries(Object.entries(req.body?.answers ?? {}).filter(([k]) => mk.questions.includes(k)).map(([k, v]) => [k, (Array.isArray(v) ? v : []).map((x) => String(x).toUpperCase()).slice(0, 8)]));
    const flagged = Array.isArray(req.body?.flagged) ? req.body!.flagged.map(String).filter((x) => mk.questions.includes(x)) : mk.flagged;
    prep.edit((s) => ({ ...s, mocks: s.mocks.map((x) => (x.id === mk.id ? { ...x, answers: { ...x.answers, ...answers }, flagged } : x)) }));
    return { ok: true };
  });
  /** Finish: score it, record every answer, and report by domain. */
  app.post<{ Params: { id: string } }>("/api/exam/mocks/:id/finish", async (req, reply) => {
    const mk = prep.get().mocks.find((x) => x.id === req.params.id); if (!mk) return bad(reply, "No such mock exam.", 404);
    const bp = prep.blueprint(mk.cert); if (!bp) return bad(reply, "No blueprint for this exam.", 409);
    const s = prep.get(), result = scoreMock(bp, mk, s.questions), now = Date.now();
    if (!mk.finished) {
      const byId = new Map(s.questions.map((q) => [q.id, q]));
      const attempts = mk.questions.flatMap((id) => { const q = byId.get(id), chosen = mk.answers[id] ?? []; return q && chosen.length ? [{ q: id, at: now, chosen, correct: isRight(q, chosen), ms: 0, mode: "mock" as const }] : []; });
      prep.edit((x) => ({ ...x, attempts: [...x.attempts, ...attempts].slice(-40_000), mocks: x.mocks.map((m) => (m.id === mk.id ? { ...m, finished: now, correct: result.correct, score: result.score } : m)) }));
      for (const a of attempts) if (!a.correct) missCard(byId.get(a.q)!);
    }
    return { ...result, passing: bp.passing, scale: bp.scale, questions: mk.questions.length, domains: bp.domains.map((d) => ({ id: d.id, name: d.name, weight: d.weight, ...(result.domains[d.id] ?? { right: 0, of: 0 }) })) };
  });

  /** A question you missed, as a card: the situation in short, and the answer with the principle behind it. */
  const missCard = (q: Question) => {
    const c = learning.get().certs.find((x) => examKey(x.code || x.name) === q.cert); if (!c?.track) return;
    const right = q.answer.map((a) => q.options.find((o) => o.id === a)?.text ?? "").filter(Boolean).join(" + ");
    const front = cardFront(q);
    try { learning.addCards([{ front, back: `${right}\n\n${q.explain}`.slice(0, 2000) }], c.track, { title: `Missed · ${q.cert}` }); } catch { /* the deck is full or the card exists */ }
  };

  return {
    /** A finished research or writing run: its blueprint or questions land here (validated). */
    capture(labels: string[], text: string, run: string) {
      const tag = (k: string) => labels.find((l) => l.startsWith(`${k}:`))?.slice(k.length + 1);
      if (labels.includes("learn-kind:exam-blueprint")) {
        const key = tag("exam-cert") ?? "", raw = parseBlock(text, "blueprint", "domains"), bp = parseBlueprint(raw, run);
        prep.edit((s) => {
          const working = { ...s.working, [`bp:${key}`]: { run, started: s.working[`bp:${key}`]?.started ?? Date.now(), done: Date.now(), added: bp ? 1 : 0 } };
          // The researched guide replaces the built-in one; it keeps the key the cert is known by.
          return bp ? { ...s, working, blueprints: { ...s.blueprints, [key]: { ...bp, code: key } } } : { ...s, working };
        });
        return true;
      }
      if (labels.includes("learn-kind:exam-questions")) {
        const key = tag("exam-cert") ?? "", domainId = tag("exam-domain") ?? "", bp = prep.blueprint(key);
        prep.edit((s) => {
          const known = new Set(s.questions.map(fingerprint));
          const fresh = bp ? parseQuestions(quizBlock(text), bp, run).filter((q) => { const f = fingerprint(q); if (known.has(f)) return false; known.add(f); return true; }) : [];
          const k = `q:${key}:${domainId}`, working = { ...s.working, [k]: { run, started: s.working[k]?.started ?? Date.now(), done: Date.now(), added: fresh.length } };
          return { ...s, working, questions: [...s.questions, ...fresh].slice(-6000) };
        });
        return true;
      }
      if (labels.includes("learn-kind:exam-verify")) {
        const key = tag("exam-cert") ?? "", verdicts = parseVerdicts(verdictBlock(text));
        let changed: Question[] = [];
        prep.edit((s) => {
          const applied = applyVerdicts(s, verdicts); changed = applied.changed;
          const k = `v:${key}`;
          return { ...applied.state, working: { ...applied.state.working, [k]: { run, started: s.working[k]?.started ?? Date.now(), done: Date.now(), added: verdicts.length } } };
        });
        // A miss card made from a key that changed or was taken out carries the old answer: out of the deck.
        if (changed.length) { const fronts = new Set(changed.map(cardFront)); learning.edit((s) => ({ ...s, cards: s.cards.filter((c) => !(fronts.has(c.front) && c.source.title === `Missed · ${key}`)) })); }
        return true;
      }
      return false;
    },
  };
}

/** "dedicating 12 hours per week" → 12 (the goal sentence is where people say it). */
export function hoursFrom(goal: string): number | undefined {
  const m = /(\d{1,2}(?:\.\d)?)\s*(?:hours?|hrs?|h)\s*(?:a|per|\/|each)\s*week/i.exec(goal);
  return m ? Math.min(60, Number(m[1])) : undefined;
}

export { BUILTIN };
