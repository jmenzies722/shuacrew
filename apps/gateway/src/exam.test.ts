import { describe, expect, it } from "vitest";
import { BUILTIN, ExamSchema, applyVerdicts, examKey, parseBlueprint, parseQuestions, parseVerdicts, type Attempt, type Blueprint, type Mock, type Question } from "./exam-prep.js";
import { isRight, mastery, mockSet, pick, predict, scoreMock, studyPlan, verdict } from "./exam-logic.js";
import { hoursFrom, quizBlock, verdictBlock } from "./exam-routes.js";

const DAY = 86_400_000, NOW = Date.UTC(2026, 9, 7, 12);
const bp: Blueprint = { ...BUILTIN["DOP-C02"]!, at: 0 };
let n = 0;
const q = (domain: string, task = "", answer = ["A"]): Question => ({ id: `q${++n}`, cert: "DOP-C02", domain, task, kind: answer.length > 1 ? "multi" : "single", stem: `A company runs workload ${n} and needs a solution with the least operational overhead.`,
  options: ["A", "B", "C", "D", "E"].slice(0, answer.length > 1 ? 5 : 4).map((id) => ({ id, text: `Option ${id} for ${n}` })), answer, explain: "Because.", why: {}, refs: [], difficulty: 2, evidence: "", created: 0 });
const bank = bp.domains.flatMap((d) => Array.from({ length: 20 }, (_, i) => q(d.id, d.tasks[i % d.tasks.length]!.id)));
const ans = (question: Question, correct: boolean, at = NOW - DAY): Attempt => ({ q: question.id, at, chosen: correct ? question.answer : ["D"], correct, ms: 30_000, mode: "quick" });
const seq = (seed = 1) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

describe("exam prep", () => {
  it("knows DOP-C02 by its code, even typed with a letter O", () => {
    expect(examKey("DOP-CO2")).toBe("DOP-C02");
    expect(examKey("dop c02")).toBe("DOP-C02");
    expect(bp.domains.reduce((s, d) => s + d.weight, 0)).toBe(100);
    expect(bp.passing).toBe(750);
  });

  it("keeps only well-formed questions from what Shua writes", () => {
    const raw = quizBlock('Here you go.\n```quiz\n[' +
      '{"task":"1.4","stem":"A team deploys Lambda functions and wants to shift 10% of traffic first. Which approach meets this?","options":[{"id":"A","text":"Canary with aliases"},{"id":"B","text":"All at once"},{"id":"C","text":"Rolling"},{"id":"D","text":"Recreate"}],"answer":["A"],"explain":"Aliases weight traffic.","why":{"B":"No gradual shift."},"refs":["https://docs.aws.amazon.com/lambda/"]},' +
      '{"task":"6.3","stem":"Which TWO services detect threats across an organization automatically? (Choose two.)","options":["GuardDuty","Security Hub","Macie","Inspector","Trusted Advisor"],"answer":["A","B"],"explain":"…"},' +
      '{"task":"1.1","stem":"A question whose answer is not among its options at all here.","options":["X","Y","Z"],"answer":["F"]},' +
      '{"task":"1.1","stem":"A question with the same option twice in its list of options.","options":["Same","Same","Other"],"answer":["C"]}' +
      ']\n```');
    const got = parseQuestions(raw, bp, "r_1", NOW);
    expect(got).toHaveLength(2);
    expect(got[0]).toMatchObject({ domain: "d1", task: "1.4", kind: "single", answer: ["A"] });
    expect(got[1]).toMatchObject({ domain: "d6", kind: "multi", answer: ["A", "B"] });
    expect(got[1]!.options[0]).toEqual({ id: "A", text: "GuardDuty" });
    const cited = parseQuestions(quizBlock('```quiz\n[{"task":"1.4","stem":"A team wants to shift 10% of Lambda traffic to a new version first. Which approach meets this?","options":["Weighted alias","All at once","Rolling","Recreate"],"answer":["A"],"evidence":"You can point an alias to two versions and weight the traffic between them."}]\n```'), bp, "r_4", NOW);
    expect(cited[0]!.evidence).toMatch(/weight the traffic/);
  });

  it("takes a researched blueprint only when it reads like an exam guide", () => {
    const guide = { code: "SAA-C03", name: "Solutions Architect – Associate", questions: 65, minutes: 130, passing: 720, scale: [100, 1000],
      domains: [{ name: "Secure", weight: 30, tasks: ["Design secure access"] }, { name: "Resilient", weight: 26 }, { name: "Performant", weight: 24 }, { name: "Cost", weight: 20 }] };
    expect(parseBlueprint(guide, "r_2", NOW)).toMatchObject({ code: "SAA-C03", passing: 720, source: "research", domains: [{ id: "d1", tasks: [{ id: "1.1", title: "Design secure access" }] }, {}, {}, {}] });
    expect(parseBlueprint({ ...guide, domains: [{ name: "Only", weight: 40 }] }, "r_3")).toBeNull(); // weights don't add up
  });

  it("measures mastery from your answers, and a couple of lucky ones isn't mastery", () => {
    const d1 = bank.filter((x) => x.domain === "d1");
    const m = mastery(bp, bank, [ans(d1[0]!, true), ans(d1[1]!, true)], NOW);
    expect(m.domains.d1!.accuracy).toBeGreaterThan(0.6);
    expect(m.domains.d1!.accuracy).toBeLessThan(0.8); // 2/2 reads ~75%, not 100%
    expect(m.domains.d1!.status).toBe("new");
    const many = mastery(bp, bank, d1.slice(0, 10).map((x) => ans(x, true)), NOW);
    expect(many.domains.d1!.status).toBe("mastered");
  });

  it("predicts the score on the exam's scale and only calls you ready on real evidence", () => {
    const all = bank.flatMap((x, i) => [ans(x, i % 10 !== 0)]); // 90% everywhere
    const m = mastery(bp, bank, all, NOW);
    expect(predict(bp, m).score).toBeGreaterThan(800);
    expect(predict(bp, m).confident).toBe(true);
    expect(verdict(bp, m, []).level).toBe("close"); // no mocks yet
    const mock = (pct: number): Mock => ({ id: `m${pct}`, cert: "DOP-C02", started: NOW, minutes: 180, questions: Array.from({ length: 75 }, (_, i) => `x${i}`), answers: {}, flagged: [], finished: NOW, correct: Math.round(75 * pct) });
    expect(verdict(bp, m, [mock(0.82), mock(0.85)]).level).toBe("ready");
    expect(verdict(bp, m, [mock(0.82), mock(0.7)]).level).toBe("close");
    expect(verdict(bp, mastery(bp, bank, [], NOW), []).level).toBe("start");
  });

  it("practises where the exam weighs most and you're weakest, and brings misses back on schedule", () => {
    const d1 = bank.filter((x) => x.domain === "d1"), d5 = bank.filter((x) => x.domain === "d5");
    const attempts = [...d1.slice(0, 10).map((x) => ans(x, false)), ...d5.slice(0, 10).map((x) => ans(x, true))];
    const m = mastery(bp, bank, attempts, NOW);
    const set = pick(bp, bank, attempts, m, 10, { now: NOW, random: seq() });
    expect(set.filter((x) => x.domain === "d1").length).toBeGreaterThan(set.filter((x) => x.domain === "d5").length);
    expect(pick(bp, bank, attempts, m, 30, { mode: "missed", now: NOW }).map((x) => x.id).sort()).toEqual(d1.slice(0, 10).map((x) => x.id).sort()); // missed yesterday: due today
    expect(pick(bp, bank, [ans(d1[0]!, false, NOW - 3600_000)], m, 30, { mode: "missed", now: NOW })).toHaveLength(0); // missed an hour ago: not yet
    expect(pick(bp, bank, attempts, m, 10, { mode: "drill", domain: "d3", now: NOW }).every((x) => x.domain === "d3")).toBe(true);
    expect(pick(bp, bank, [ans(d1[0]!, true, NOW - 3600_000)], m, 200, { now: NOW }).some((x) => x.id === d1[0]!.id)).toBe(false); // seen in the last day
  });

  it("draws a diagnostic and a mock like the real exam", () => {
    const diag = pick(bp, bank, [], mastery(bp, bank, [], NOW), 20, { mode: "diagnostic", random: seq(7) });
    expect(diag).toHaveLength(20);
    const count = (d: string) => diag.filter((x) => x.domain === d).length;
    expect(count("d1")).toBeGreaterThanOrEqual(4); // 22% of 20 = 4.4: the largest share
    expect(bp.domains.every((d) => count("d1") >= count(d.id))).toBe(true);
    const mock = mockSet(bp, bank, [], seq(3));
    expect(mock).toHaveLength(75);
    expect(mock.filter((x) => x.domain === "d1").length).toBeGreaterThanOrEqual(16);
  });

  it("scores a mock with no partial credit on multiple response", () => {
    const a = q("d1"), b = q("d6", "", ["A", "C"]);
    expect(isRight(b, ["C", "A"])).toBe(true);
    expect(isRight(b, ["A"])).toBe(false);
    const result = scoreMock(bp, { id: "m", cert: "DOP-C02", started: NOW, minutes: 10, questions: [a.id, b.id], answers: { [a.id]: ["A"], [b.id]: ["A"] }, flagged: [] }, [a, b]);
    expect(result).toMatchObject({ correct: 1, percent: 0.5, score: 550, passed: false, domains: { d1: { right: 1, of: 1 }, d6: { right: 0, of: 1 } } });
  });

  it("plans from today to exam day", () => {
    const empty = mastery(bp, bank, [], NOW);
    expect(studyPlan(bp, empty, [], { examDate: NOW + 60 * DAY, now: NOW }).phase).toBe("diagnostic");
    const some = mastery(bp, bank, bank.slice(0, 30).map((x) => ans(x, false)), NOW);
    const build = studyPlan(bp, some, [], { examDate: NOW + 60 * DAY, hoursPerWeek: 12, dueCards: 6, now: NOW });
    expect(build.phase).toBe("build");
    expect(build.today.map((b) => b.kind)).toEqual(["review", "learn", "practice"]);
    expect(build.today.reduce((s, b) => s + b.minutes, 0)).toBeLessThanOrEqual(125); // 12 h a week ÷ 6 days
    expect(studyPlan(bp, some, [], { examDate: NOW + 14 * DAY, now: NOW }).phase).toBe("sharpen");
    expect(studyPlan(bp, some, [], { examDate: NOW + 5 * DAY, now: NOW }).today[0]!.kind).toBe("mock");
    expect(hoursFrom("Become an AI Platform Engineer, dedicating 12 hours per week to learning")).toBe(12);
  });

  it("checks answer keys against the docs: confirms, corrects and re-grades, or takes a question out", () => {
    const a = q("d1"), b = q("d2"), c = q("d3"), d = q("d6", "", ["A", "B"]);
    const state = ExamSchema.parse({ questions: [a, b, c, d], attempts: [ans(b, true), { ...ans(b, false), chosen: ["C"] }] });
    const verdicts = parseVerdicts(verdictBlock('Checked.\n```verdicts\n[' +
      '{"id":"' + a.id + '","verdict":"correct","evidence":"The docs say so.","refs":["https://docs.aws.amazon.com/x"]},' +
      '{"id":"' + b.id + '","verdict":"wrong","answer":["C"],"explain":"C is right because…","evidence":"Per the docs, C."},' +
      '{"id":"' + c.id + '","verdict":"unclear","note":"B and C both work"},' +
      '{"id":"' + d.id + '","verdict":"wrong","answer":["C"]},' + // would turn a choose-two into one answer: not applied
      '{"id":"nope","verdict":"correct"},{"id":"' + a.id + '","verdict":"maybe"}' +
      ']\n```'));
    expect(verdicts).toHaveLength(5);
    const { state: next, changed } = applyVerdicts(state, verdicts, NOW);
    const get = (id: string) => next.questions.find((x) => x.id === id)!;
    expect(get(a.id)).toMatchObject({ evidence: "The docs say so.", checked: NOW, answer: ["A"] });
    expect(get(a.id).refs[0]).toBe("https://docs.aws.amazon.com/x");
    expect(get(b.id)).toMatchObject({ answer: ["C"], explain: "C is right because…", why: {}, checked: NOW });
    expect(next.attempts.map((x) => x.correct)).toEqual([false, true]); // graded again against the corrected key
    expect(get(c.id).flag?.note).toMatch(/couldn't confirm.*B and C both work/);
    expect(get(d.id).flag).toBeDefined(); // a "fix" that changes how many answers it has isn't trusted
    expect(changed.map((x) => x.id).sort()).toEqual([b.id, c.id, d.id].sort());
  });
});
