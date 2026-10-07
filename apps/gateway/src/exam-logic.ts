/**
 * The judgement behind exam prep, all pure (answers in, decisions out) so every rule is tested:
 * - mastery: how well you know each task and domain, from your own answers — recent ones count more, and a few lucky
 *   answers aren't mastery (a prior pulls small samples toward 50%);
 * - the predicted score on the exam's own scale, weighted by the blueprint, and the verdict — "ready" only after two
 *   mock exams at 80%+ and every domain at 70%+ on enough questions, so you sit it once;
 * - which questions to practise next: the domains that weigh most where you're weakest, misses coming back on a
 *   spaced schedule, nothing you saw in the last day;
 * - a mock exam drawn like the real one, and its score;
 * - the plan from today to exam day, and today's session in timed blocks.
 */
import type { Attempt, Blueprint, Mock, Question } from "./exam-prep.js";

const DAY = 86_400_000;

export interface Mastery { accuracy: number; answered: number; correct: number; status: "new" | "learning" | "solid" | "mastered" }
export interface MasteryMap { domains: Record<string, Mastery>; tasks: Record<string, Mastery>; answered: number }

/** Recent answers count more: an answer two weeks old counts half. */
const weightOf = (at: number, now: number) => Math.pow(0.5, Math.max(0, now - at) / (14 * DAY));
const statusOf = (accuracy: number, answered: number): Mastery["status"] => answered < 3 ? "new" : accuracy >= 0.85 && answered >= 8 ? "mastered" : accuracy >= 0.7 ? "solid" : "learning";

export function mastery(bp: Blueprint, questions: Question[], attempts: Attempt[], now = Date.now()): MasteryMap {
  const byId = new Map(questions.filter((q) => q.cert === bp.code).map((q) => [q.id, q]));
  const acc: Record<string, { w: number; c: number; n: number; k: number }> = {};
  const add = (key: string, w: number, credit: number, ok: boolean) => { const a = (acc[key] ??= { w: 0, c: 0, n: 0, k: 0 }); a.w += w; a.c += credit * w; a.n++; a.k += ok ? 1 : 0; };
  let answered = 0;
  for (const a of attempts) {
    const q = byId.get(a.q); if (!q) continue;
    const w = weightOf(a.at, now), credit = a.correct ? (a.sure === false ? 0.5 : 1) : 0; answered++; // a right guess earns half
    add(`d:${q.domain}`, w, credit, a.correct); if (q.task) add(`t:${q.task}`, w, credit, a.correct);
  }
  // A prior of one right and one wrong: two lucky answers read 75%, not 100%.
  const of = (key: string): Mastery => { const a = acc[key]; if (!a) return { accuracy: 0, answered: 0, correct: 0, status: "new" }; const accuracy = (a.c + 1) / (a.w + 2); return { accuracy, answered: a.n, correct: a.k, status: statusOf(accuracy, a.n) }; };
  return {
    domains: Object.fromEntries(bp.domains.map((d) => [d.id, of(`d:${d.id}`)])),
    tasks: Object.fromEntries(bp.domains.flatMap((d) => d.tasks.map((t) => [t.id, of(`t:${t.id}`)]))),
    answered,
  };
}

/**
 * The score you'd likely get today, on the exam's scale: each domain's accuracy weighted as the exam weights it
 * (a domain you haven't practised counts as a coin toss). Linear on the scale, which puts AWS's 750 at ~72% —
 * close to the pass rate people report. `confident` once every domain has 10+ answers.
 */
export function predict(bp: Blueprint, m: MasteryMap): { score: number; percent: number; confident: boolean } {
  const total = bp.domains.reduce((s, d) => s + d.weight, 0) || 1;
  const percent = bp.domains.reduce((s, d) => s + d.weight * (m.domains[d.id]?.answered ? m.domains[d.id]!.accuracy : 0.5), 0) / total;
  const [lo, hi] = bp.scale;
  return { score: Math.round(lo + (hi - lo) * percent), percent, confident: bp.domains.every((d) => (m.domains[d.id]?.answered ?? 0) >= 10) };
}

export type Verdict = { level: "start" | "building" | "close" | "ready"; title: string; why: string; gates: Array<{ label: string; met: boolean }> };
/** Ready to book (or sit) the exam? Only when the evidence says you'd pass with room to spare. */
export function verdict(bp: Blueprint, m: MasteryMap, mocks: Mock[]): Verdict {
  const done = mocks.filter((x) => x.cert === bp.code && x.finished).sort((a, b) => (b.finished ?? 0) - (a.finished ?? 0));
  const pct = (x: Mock) => (x.correct ?? 0) / Math.max(1, x.questions.length);
  const weakest = [...bp.domains].sort((a, b) => (m.domains[a.id]?.accuracy ?? 0) - (m.domains[b.id]?.accuracy ?? 0))[0];
  const gates = [
    { label: "Every domain practised (10+ questions each)", met: bp.domains.every((d) => (m.domains[d.id]?.answered ?? 0) >= 10) },
    { label: "Every domain at 70% or better", met: bp.domains.every((d) => (m.domains[d.id]?.accuracy ?? 0) >= 0.7 && (m.domains[d.id]?.answered ?? 0) >= 10) },
    { label: "Two mock exams at 80% or better", met: done.slice(0, 2).length === 2 && done.slice(0, 2).every((x) => pct(x) >= 0.8) },
  ];
  const p = predict(bp, m);
  if (!m.answered) return { level: "start", title: "Find out where you stand", why: "A short diagnostic across every domain shows what to study first.", gates };
  if (gates.every((g) => g.met)) return { level: "ready", title: "Ready to pass", why: `Two mocks at 80%+, every domain solid. Book it while it's fresh.`, gates };
  if (p.score >= bp.passing && p.confident) return { level: "close", title: "Passing range, not yet safe", why: `You'd likely score ~${p.score}. ${!gates[2]!.met ? "Two mock exams at 80%+ make it a sure thing." : `Lift ${weakest?.name ?? "your weakest domain"} to 70%+.`}`, gates };
  return { level: "building", title: "Building toward a pass", why: weakest ? `Biggest gain: ${weakest.name} (${Math.round((m.domains[weakest.id]?.accuracy ?? 0) * 100)}%, ${weakest.weight}% of the exam).` : "Keep practising.", gates };
}

/** Your latest answer to each question, and how many times you've missed it. */
function history(attempts: Attempt[]) {
  const last = new Map<string, Attempt>(), misses = new Map<string, number>();
  for (const a of attempts) { last.set(a.q, a); if (!a.correct) misses.set(a.q, (misses.get(a.q) ?? 0) + 1); }
  return { last, misses };
}
/** A question you got wrong comes back the next day, and keeps coming back until you get it right. */
const missDue = (a: Attempt) => a.at + DAY;

/**
 * What to practise next. "missed": wrong answers that are due again. Otherwise each question is scored by what it
 * would teach you — its domain's exam weight times how weak you are there, unseen ones first, misses that are due
 * on top — and nothing you answered in the last 24 hours. `domain` narrows it to one domain.
 */
export function pick(bp: Blueprint, bank: Question[], attempts: Attempt[], m: MasteryMap, n: number, opts: { mode?: "quick" | "drill" | "missed" | "diagnostic"; domain?: string; now?: number; random?: () => number } = {}): Question[] {
  const now = opts.now ?? Date.now(), random = opts.random ?? Math.random;
  const { last, misses } = history(attempts);
  const pool = bank.filter((q) => q.cert === bp.code && (!opts.domain || q.domain === opts.domain));
  // Your misses (and right guesses) that are due: confident misses first, then the most-missed, then the oldest.
  const shaky = (a: Attempt) => !a.correct || a.sure === false, sureMiss = (a: Attempt) => !a.correct && a.sure === true ? 1 : 0;
  if (opts.mode === "missed") return pool.filter((q) => { const a = last.get(q.id); return a && shaky(a) && now >= missDue(a); })
    .sort((a, b) => sureMiss(last.get(b.id)!) - sureMiss(last.get(a.id)!) || (misses.get(b.id) ?? 0) - (misses.get(a.id) ?? 0) || last.get(a.id)!.at - last.get(b.id)!.at).slice(0, n);
  if (opts.mode === "diagnostic") { // a spread: each domain in proportion to its weight
    return stratified(bp, pool.filter((q) => !last.has(q.id)), n, random);
  }
  const total = bp.domains.reduce((s, d) => s + d.weight, 0) || 1;
  const scored = pool.flatMap((q) => {
    const a = last.get(q.id);
    if (a && now - a.at < DAY) return [];
    const dm = m.domains[q.domain], weakness = 1 - (dm?.answered ? dm.accuracy : 0.5);
    const weight = (bp.domains.find((d) => d.id === q.domain)?.weight ?? 0) / total;
    let s = weight * (0.35 + weakness);
    if (!a) s *= 1.6; else if (!a.correct && now >= missDue(a)) s *= 2 + 0.3 * Math.min(3, misses.get(q.id) ?? 1) + sureMiss(a); else if (a.correct) s *= a.sure === false ? 1.2 : 0.25;
    return [{ q, s: s * (0.75 + random() * 0.5) }];
  });
  return scored.sort((a, b) => b.s - a.s).slice(0, n).map((x) => x.q);
}

/** n questions spread over the domains as the exam spreads them (largest remainder), shuffled. */
function stratified(bp: Blueprint, pool: Question[], n: number, random: () => number): Question[] {
  const total = bp.domains.reduce((s, d) => s + d.weight, 0) || 1;
  const want = bp.domains.map((d) => ({ d, exact: (n * d.weight) / total }));
  const counts = new Map(want.map((w) => [w.d.id, Math.floor(w.exact)]));
  let left = n - [...counts.values()].reduce((s, c) => s + c, 0);
  for (const w of [...want].sort((a, b) => (b.exact % 1) - (a.exact % 1))) { if (left <= 0) break; counts.set(w.d.id, counts.get(w.d.id)! + 1); left--; }
  const shuffle = <T>(xs: T[]) => xs.map((x) => ({ x, r: random() })).sort((a, b) => a.r - b.r).map((y) => y.x);
  const out: Question[] = [];
  for (const d of bp.domains) out.push(...shuffle(pool.filter((q) => q.domain === d.id)).slice(0, counts.get(d.id) ?? 0));
  // Short in a domain: fill from the rest so the set is still n long.
  if (out.length < n) out.push(...shuffle(pool.filter((q) => !out.includes(q))).slice(0, n - out.length));
  return shuffle(out);
}

/** A mock exam: as many questions as the real one (or what the bank has), weighted like it, unseen ones first. */
export function mockSet(bp: Blueprint, bank: Question[], attempts: Attempt[], random: () => number = Math.random): Question[] {
  const seen = new Set(attempts.map((a) => a.q));
  const pool = bank.filter((q) => q.cert === bp.code);
  const fresh = pool.filter((q) => !seen.has(q.id));
  const n = Math.min(bp.questions, pool.length);
  const first = stratified(bp, fresh, Math.min(n, fresh.length), random);
  return first.length >= n ? first : [...first, ...stratified(bp, pool.filter((q) => !first.includes(q)), n - first.length, random)];
}

/** An answer is right only if it's exactly the right set (multiple response has no partial credit). */
export const isRight = (q: Pick<Question, "answer">, chosen: string[]) => chosen.length === q.answer.length && [...chosen].sort().join() === [...q.answer].sort().join();

/** A finished mock: how many right, the scaled score, and how each domain went. */
export function scoreMock(bp: Blueprint, mock: Mock, bank: Question[]) {
  const byId = new Map(bank.map((q) => [q.id, q]));
  const perDomain: Record<string, { right: number; of: number }> = {};
  let right = 0;
  for (const id of mock.questions) {
    const q = byId.get(id); if (!q) continue;
    const ok = isRight(q, mock.answers[id] ?? []);
    const d = (perDomain[q.domain] ??= { right: 0, of: 0 }); d.of++; if (ok) { d.right++; right++; }
  }
  const [lo, hi] = bp.scale, pct = right / Math.max(1, mock.questions.length);
  return { correct: right, percent: pct, score: Math.round(lo + (hi - lo) * pct), passed: lo + (hi - lo) * pct >= bp.passing, domains: perDomain };
}

export interface Block { kind: "review" | "learn" | "practice" | "mock" | "diagnostic"; minutes: number; title: string; detail: string; domain?: string; task?: string; count?: number }
export interface StudyPlan { daysLeft: number | null; phase: "diagnostic" | "build" | "sharpen" | "final" | "after"; phaseTitle: string; today: Block[]; milestones: Array<{ title: string; done: boolean; when?: string }> }

/**
 * From today to exam day. No answers yet: a diagnostic first. More than three weeks out: build — learn the weakest
 * high-weight task, drill its domain, review due cards. Three weeks to one: sharpen — mixed sets and a mock a week.
 * The last week: mocks and your misses. Today's session fits the time you have (hours a week ÷ 6 days).
 */
export function studyPlan(bp: Blueprint, m: MasteryMap, mocks: Mock[], opts: { examDate?: number; hoursPerWeek?: number; dueCards?: number; now?: number }): StudyPlan {
  const now = opts.now ?? Date.now();
  const daysLeft = opts.examDate ? Math.ceil((opts.examDate - now) / DAY) : null;
  const minutes = Math.max(30, Math.min(150, Math.round(((opts.hoursPerWeek ?? 7) * 60) / 6)));
  const done = mocks.filter((x) => x.cert === bp.code && x.finished);
  // The weakest task in the domains that matter most: weight × (1 − accuracy).
  const need = (id: string) => 1 - (m.domains[id]?.answered ? m.domains[id]!.accuracy : 0.5);
  const domain = [...bp.domains].sort((a, b) => b.weight * need(b.id) - a.weight * need(a.id))[0]!;
  const task = [...domain.tasks].sort((a, b) => (m.tasks[a.id]?.answered ? m.tasks[a.id]!.accuracy : 0.4) - (m.tasks[b.id]?.answered ? m.tasks[b.id]!.accuracy : 0.4))[0];
  const review = (opts.dueCards ?? 0) > 0 ? [{ kind: "review" as const, minutes: Math.min(15, Math.max(5, Math.round((opts.dueCards ?? 0) * 0.75))), title: "Review your cards", detail: `${opts.dueCards} due: retrieval keeps it from fading.`, count: opts.dueCards }] : [];
  const milestones = [
    { title: "Diagnostic: where you stand", done: m.answered >= 15 },
    ...bp.domains.map((d) => ({ title: `${d.name} at 70%+`, done: (m.domains[d.id]?.accuracy ?? 0) >= 0.7 && (m.domains[d.id]?.answered ?? 0) >= 10 })),
    { title: "Mock exam 1 at 70%+", done: done.some((x) => (x.correct ?? 0) / Math.max(1, x.questions.length) >= 0.7) },
    { title: "Two mocks at 80%+", done: done.filter((x) => (x.correct ?? 0) / Math.max(1, x.questions.length) >= 0.8).length >= 2 },
    { title: "Exam day", done: daysLeft !== null && daysLeft < 0, when: opts.examDate ? new Date(opts.examDate).toISOString().slice(0, 10) : undefined },
  ];
  if (daysLeft !== null && daysLeft < 0) return { daysLeft, phase: "after", phaseTitle: "After the exam", today: review, milestones };
  if (m.answered < 15) return { daysLeft, phase: "diagnostic", phaseTitle: "Find out where you stand", milestones,
    today: [{ kind: "diagnostic", minutes: 30, title: "Take the diagnostic", detail: "20 questions across every domain, weighted like the exam. No pressure: it's to aim the plan.", count: 20 }, ...review] };
  if (daysLeft !== null && daysLeft <= 7) return { daysLeft, phase: "final", phaseTitle: "Final week: exam conditions", milestones,
    today: [{ kind: "mock", minutes: Math.min(bp.minutes, minutes + 60), title: "Full mock exam", detail: `${bp.questions} questions, ${bp.minutes} minutes, no answers until the end.` }, { kind: "practice", minutes: 15, title: "Your misses", detail: "Every question you've missed that's due again." }, ...review] };
  const sharpen = daysLeft !== null && daysLeft <= 21;
  const practiceMin = Math.max(15, Math.round(minutes * (sharpen ? 0.6 : 0.4)));
  const learnMin = Math.max(10, minutes - practiceMin - (review[0]?.minutes ?? 0));
  return { daysLeft, phase: sharpen ? "sharpen" : "build", phaseTitle: sharpen ? "Sharpen: mixed practice and mocks" : "Build: one domain at a time", milestones,
    today: [
      ...review,
      ...(task ? [{ kind: "learn" as const, minutes: learnMin, title: `Learn: ${task.title}`, detail: `${domain.name} is ${domain.weight}% of the exam${m.domains[domain.id]?.answered ? ` and you're at ${Math.round(m.domains[domain.id]!.accuracy * 100)}%` : ""}.`, domain: domain.id, task: task.id }] : []),
      { kind: "practice", minutes: practiceMin, title: sharpen ? "Mixed practice set" : `${domain.name} drill`, detail: sharpen ? "Questions from every domain, weighted toward your gaps." : "Exam-style questions on what you just learned.", domain: sharpen ? undefined : domain.id, count: Math.max(5, Math.round(practiceMin / 2.4)) },
      ...(sharpen && !done.some((x) => now - (x.finished ?? 0) < 7 * DAY) ? [{ kind: "mock" as const, minutes: bp.minutes, title: "This week's mock exam", detail: "A full mock under exam conditions." }] : []),
    ] };
}

export interface Progress {
  /** The last 8 weeks, a day each (local dates), oldest first. */
  days: Array<{ day: string; answered: number; correct: number }>;
  /** Days in a row with at least one answer, up to today (or yesterday, if today hasn't started). */
  streak: number;
  week: { answered: number; correct: number; minutes: number };
  /** Your predicted score at the end of each of the last 8 weeks, from what you'd answered by then. */
  trend: Array<{ end: number; score: number | null; answered: number }>;
  /** When you said you were sure, how often you were right; and when you weren't. Null until there are 5 of each. */
  calibration: { sure: number | null; unsure: number | null; sureN: number; unsureN: number };
}

const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/** How you've actually been doing: every number comes from your answers, nothing estimated that isn't labelled so. */
export function progress(bp: Blueprint, bank: Question[], attempts: Attempt[], now = Date.now()): Progress {
  const ids = new Set(bank.filter((q) => q.cert === bp.code).map((q) => q.id)), mine = attempts.filter((a) => ids.has(a.q));
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const days: Progress["days"] = [], byDay = new Map<string, { answered: number; correct: number }>();
  for (const a of mine) { const k = dayKey(a.at), d = byDay.get(k) ?? { answered: 0, correct: 0 }; d.answered++; d.correct += a.correct ? 1 : 0; byDay.set(k, d); }
  for (let i = 55; i >= 0; i--) { const t = new Date(today); t.setDate(t.getDate() - i); const k = dayKey(t.getTime()); days.push({ day: k, ...(byDay.get(k) ?? { answered: 0, correct: 0 }) }); }
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) { if (days[i]!.answered) streak++; else if (i === days.length - 1) continue; else break; }
  const weekAgo = now - 7 * DAY, recent = mine.filter((a) => a.at > weekAgo);
  const week = { answered: recent.length, correct: recent.filter((a) => a.correct).length, minutes: Math.round(recent.reduce((s, a) => s + Math.min(a.ms, 10 * 60_000), 0) / 60_000) };
  const trend = Array.from({ length: 8 }, (_, i) => {
    const end = now - (7 - i) * 7 * DAY, upTo = mine.filter((a) => a.at <= end);
    return { end, score: upTo.length ? predict(bp, mastery(bp, bank, upTo, end)).score : null, answered: upTo.length };
  });
  const sure = mine.filter((a) => a.sure === true), unsure = mine.filter((a) => a.sure === false);
  const rate = (xs: Attempt[]) => (xs.length >= 5 ? xs.filter((a) => a.correct).length / xs.length : null);
  return { days, streak, week, trend, calibration: { sure: rate(sure), unsure: rate(unsure), sureN: sure.length, unsureN: unsure.length } };
}
