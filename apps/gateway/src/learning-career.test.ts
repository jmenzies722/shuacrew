import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Learning, LearningSchema, type LearningState } from "./learning.js";
import { applyLearnOps, careerContext, gapsToPath, certPatch, jobPatch, learnBrief, learnReminders, newCert, newJob, parseCertPlan, parseFit, parseOpenings } from "./learning-career.js";

const tmp = () => path.join(mkdtempSync(path.join(os.tmpdir(), "shua-career-")), "learning.json");

it("validates certs and jobs from untrusted input", () => {
  expect(newCert({})).toBe("A certification needs a name.");
  const c = newCert({ name: "AWS Solutions Architect – Associate", code: "SAA-C03", examDate: "2026-12-01", status: "bogus" }, 1);
  expect(c).toMatchObject({ code: "SAA-C03", status: "planned", track: "cert-aws-solutions-architect-associate", examDate: Date.parse("2026-12-01") });
  expect((newCert({ name: "AWS Certified Solutions Architect – Associate" }) as { track: string }).track).toBe("cert-aws-certified-solutions-architect"); // ≤ 40, no trailing dash
  expect(newJob({ role: "SRE" })).toBe("A job needs a company.");
  const j = newJob({ company: "Datadog", role: "SRE", url: "javascript:alert(1)", stage: "applied" }, 5);
  expect(j).toMatchObject({ company: "Datadog", url: "", stage: "applied", source: "you", created: 5 });
});

it("patches only known fields, ticks steps, and stamps passing once", () => {
  const c = { ...(newCert({ name: "CKA" }, 1) as Exclude<ReturnType<typeof newCert>, string>), steps: [{ title: "Week 1", done: false }, { title: "Week 2", done: false }] };
  const ticked = certPatch(c, { step: 1, done: true, track: "hijack", id: "x" }, 2);
  expect(ticked.steps.map((s) => s.done)).toEqual([false, true]);
  expect(ticked).toMatchObject({ id: c.id, track: c.track });
  const passed = certPatch(ticked, { status: "passed" }, 3);
  expect(passed.passedAt).toBe(3);
  expect(certPatch(passed, { status: "passed" }, 9).passedAt).toBe(3);
  expect(certPatch(passed, { examDate: "" }).examDate).toBeUndefined();
  const j = newJob({ company: "Stripe" }, 1) as Exclude<ReturnType<typeof newJob>, string>;
  expect(jobPatch(j, { stage: "interviewing", next: "Onsite prep", nextAt: "2026-11-02", stage2: "x" }, 7)).toMatchObject({ stage: "interviewing", next: "Onsite prep", nextAt: Date.parse("2026-11-02"), updated: 7 });
  expect(jobPatch(j, { stage: "hired" }).stage).toBe("saved");
});

it("reads Shua's plans, fits and openings, and drops anything invented or malformed", () => {
  expect(parseCertPlan('Plan…\n```cert\n{"steps":["Week 1 · IAM",{"title":"Week 2 · VPC"},"",3]}\n```')).toEqual([{ title: "Week 1 · IAM", done: false }, { title: "Week 2 · VPC", done: false }]);
  expect(parseCertPlan("no plan")).toEqual([]);
  expect(parseFit('```fit\n{"score": 72.4, "summary": "Strong infra, light on Kubernetes.", "gaps": ["Kubernetes", "", "Go"]}\n```')).toEqual({ score: 72, summary: "Strong infra, light on Kubernetes.", gaps: ["Kubernetes", "Go"] });
  expect(parseFit('```fit\n{"score": 400, "summary": "x"}\n```')?.score).toBeUndefined();
  expect(parseOpenings('```jobs\n[{"company":"Grafana","role":"DevOps Engineer","url":"https://grafana.com/careers/1","why":"Observability"},{"company":"NoLink","role":"x"},{"company":"Bad","url":"file:///etc/passwd"}]\n```'))
    .toEqual([{ company: "Grafana", role: "DevOps Engineer", url: "https://grafana.com/careers/1", location: "", notes: "Observability" }]);
});

it("tells the coach about exams and applications", () => {
  const l = new Learning(tmp());
  const c = newCert({ name: "CKA", code: "CKA", status: "studying", examDate: 10 * 86_400_000 }, 0) as Exclude<ReturnType<typeof newCert>, string>;
  const j = newJob({ company: "Datadog", role: "SRE", stage: "applied", next: "Follow up" }, 0) as Exclude<ReturnType<typeof newJob>, string>;
  l.edit((s) => ({ ...s, certs: [c], jobs: [j, { ...j, id: "gone", company: "Closed Co", stage: "closed" }] }));
  const text = careerContext(l.get(), 0);
  expect(text).toContain("CKA (CKA): studying, exam 1970-01-11 (10 days)");
  expect(text).toContain("Datadog · SRE: applied, next: Follow up");
  expect(text).not.toContain("Closed Co");
});

it("keeps an unreadable learning file instead of silently starting over it", () => {
  const file = tmp();
  writeFileSync(file, '{"version":1,"courses":"not a list"}');
  const l = new Learning(file);
  expect(l.get().courses).toEqual([]);
  expect(readdirSync(path.dirname(file)).some((f) => f.startsWith("learning.json.unreadable-"))).toBe(true);
});

it("runs the career loop: add a cert, plan it, capture steps and cards; fit a job; find openings", async () => {
  const Fastify = (await import("fastify")).default, { EventStore } = await import("./store.js"), { learningRoutes } = await import("./learning-routes.js");
  const store = new EventStore(":memory:"), app = Fastify(), l = new Learning(tmp());
  let n = 0; learningRoutes(app, { learning: l, store, supervisor: { status: () => "done", launch: () => `r_${++n}`, followUp: () => {} } as never });
  l.setProfile({ goal: "DevOps Engineer" });
  const finish = (run: string, labels: string[], text: string) => {
    store.append("run.created", { title: "t", ask: "a", runtime: "codex", labels, incognito: false }, { run });
    store.append("agent.message", { turn: 1, text }, { run });
    store.append("run.status", { status: "done" }, { run });
  };
  const cert = (await app.inject({ method: "POST", url: "/api/learning/certs", payload: { name: "Certified Kubernetes Administrator", code: "CKA" } })).json();
  expect(l.get().profile.tracks.find((t) => t.id === cert.track)).toMatchObject({ name: "CKA", focus: true });
  const plan = (await app.inject({ method: "POST", url: `/api/learning/certs/${cert.id}/plan` })).json();
  finish(plan.run, ["learning", "learn-kind:cert-plan", `learn-cert:${cert.id}`, `learn-track:${cert.track}`],
    '```cert\n{"steps":["Week 1 · cluster architecture","Week 2 · workloads"]}\n```\n```cards\n[{"front":"What runs etcd?","back":"The control plane."}]\n```');
  expect(l.get().certs[0]).toMatchObject({ status: "studying", steps: [{ title: "Week 1 · cluster architecture" }, { title: "Week 2 · workloads" }] });
  expect(l.get().cards.map((c) => [c.front, c.track])).toEqual([["What runs etcd?", cert.track]]);

  const job = (await app.inject({ method: "POST", url: "/api/learning/jobs", payload: { company: "Grafana", role: "DevOps Engineer" } })).json();
  expect((await app.inject({ method: "POST", url: `/api/learning/jobs/${job.id}/fit` })).statusCode).toBe(400); // no posting yet
  await app.inject({ method: "POST", url: `/api/learning/jobs/${job.id}`, payload: { description: "We run Kubernetes at scale with Terraform and Go. ".repeat(4) } });
  const fit = (await app.inject({ method: "POST", url: `/api/learning/jobs/${job.id}/fit` })).json();
  finish(fit.run, ["learning", "learn-kind:job-fit", `learn-job:${job.id}`], '```fit\n{"score":64,"summary":"Good base.","gaps":["Go"]}\n```');
  expect(l.get().jobs[0]!.fit).toMatchObject({ run: fit.run, score: 64, gaps: ["Go"] });

  const research = (await app.inject({ method: "POST", url: "/api/learning/jobs/research", payload: {} })).json();
  finish(research.run, ["learning", "learn-kind:job-research"], '```jobs\n[{"company":"Grafana","role":"DevOps Engineer","url":"https://x.dev/1"},{"company":"Fly.io","role":"Platform Engineer","url":"https://fly.io/jobs/2"}]\n```');
  expect(l.get().jobs.map((j) => [j.company, j.source])).toEqual([["Grafana", "you"], ["Fly.io", "shua"]]); // the duplicate isn't added twice
  const state = (await app.inject("/api/learning")).json();
  expect(state.certs).toHaveLength(1); expect(state.jobs).toHaveLength(2);
  await app.close(); store.close();
});

it("organizes Learn from what you say: upserts only, a second read changes nothing, junk is ignored", () => {
  const l = new Learning(tmp());
  l.edit((s) => ({ ...s, roadmaps: [{ id: "m1", goal: "DevOps", months: 6, title: "DevOps Engineer", run: "r", created: 1, milestones: [{ title: "Linux & networking", why: "", skills: [], project: "", weeks: 2, done: false }, { title: "Kubernetes basics", why: "", skills: [], project: "", weeks: 3, done: false }] }] }));
  const reply = 'Booked it and logged the application.\n```learn\n[{"op":"cert","name":"Certified Kubernetes Administrator","code":"CKA","status":"booked","examDate":"2027-03-03"},{"op":"job","company":"Grafana","role":"DevOps Engineer","stage":"applied","next":"Follow up","nextAt":"2026-10-20"},{"op":"milestone","title":"linux","done":true},{"op":"delete","what":"everything"},{"op":"job","role":"no company"},{"op":"goal","goal":"DevOps Engineer"}]\n```';
  expect(applyLearnOps(l, reply, 5)).toEqual(["cert added: CKA", "job added: Grafana", "milestone done: Linux & networking", "goal: DevOps Engineer"]);
  expect(applyLearnOps(l, reply, 6)).toEqual(["cert updated: CKA", "job updated: Grafana", "milestone done: Linux & networking", "goal: DevOps Engineer"]);
  const s = l.get();
  expect(s.certs).toHaveLength(1); expect(s.jobs).toHaveLength(1);
  expect(s.certs[0]).toMatchObject({ status: "booked", examDate: Date.parse("2027-03-03") });
  expect(s.jobs[0]).toMatchObject({ stage: "applied", nextAt: Date.parse("2026-10-20"), source: "shua" });
  expect(s.roadmaps[0]!.milestones.map((m) => m.done)).toEqual([true, false]);
  // Later: "I got the interview" — same company, moves along.
  expect(applyLearnOps(l, '```learn\n[{"op":"job","company":"grafana","stage":"interviewing"}]\n```', 7)).toEqual(["job updated: Grafana"]);
  expect(l.get().jobs[0]!.stage).toBe("interviewing");
  expect(applyLearnOps(l, "Nothing to change.")).toEqual([]);
});

it("applies Shua's changes when an organize turn finishes", async () => {
  const Fastify = (await import("fastify")).default, { EventStore } = await import("./store.js"), { learningRoutes } = await import("./learning-routes.js");
  const store = new EventStore(":memory:"), app = Fastify(), l = new Learning(tmp());
  learningRoutes(app, { learning: l, store, supervisor: { status: () => "done", launch: () => "r_org", followUp: () => {} } as never });
  const first = (await app.inject({ method: "POST", url: "/api/learning/coach", payload: { mode: "organize", message: "I want to get the AWS SAA by December" } })).json();
  expect(first.run).toBe("r_org");
  expect(l.get().coach.organize?.run).toBe("r_org");
  store.append("run.created", { title: "Shua · learning & career", ask: "a", runtime: "codex", labels: ["learning", "learn-kind:coach", "learn-coach:organize", "learn-track:general"], incognito: false }, { run: "r_org" });
  store.append("agent.message", { turn: 1, text: 'Added it.\n```learn\n[{"op":"cert","name":"AWS Certified Solutions Architect – Associate","code":"SAA-C03","provider":"AWS","examDate":"2026-12-15"}]\n```' }, { run: "r_org" });
  store.append("run.status", { status: "done" }, { run: "r_org" });
  expect(l.get().certs.map((c) => [c.code, c.status])).toEqual([["SAA-C03", "planned"]]);
  await app.close(); store.close();
});

it("Shua anywhere sees Learn in a few lines, and its changes land the same way the organizer's do", () => {
  const learning = new Learning(tmp()), now = Date.parse("2026-10-07T12:00:00Z");
  expect(learnBrief(learning.get(), 0, now)).toBe("No goal set yet.\nFlashcards: 0, 0 due now.");
  const ops = [{ op: "goal", goal: "AI Platform Engineer" }, { op: "cert", name: "AWS Solutions Architect – Associate", code: "SAA-C03", status: "booked", examDate: "2026-11-02" }, { op: "job", company: "Anthropic", role: "AI Platform Engineer", stage: "applied", next: "Follow up with the recruiter", nextAt: "2026-10-14" }];
  expect(applyLearnOps(learning, "```learn\n" + JSON.stringify(ops) + "\n```", now)).toEqual(["goal: AI Platform Engineer", "cert added: SAA-C03", "job added: Anthropic"]);
  const brief = learnBrief(learning.get(), 2, now);
  expect(brief).toContain("Goal: AI Platform Engineer");
  expect(brief).toContain("exam 2026-11-02 (26 days)");
  expect(brief).toContain("Anthropic · AI Platform Engineer: applied, next: Follow up with the recruiter by 2026-10-14");
  expect(brief).toContain("Flashcards: 0, 2 due now.");
  // The same cert again is an update, never a duplicate.
  expect(applyLearnOps(learning, '```learn\n[{"op":"cert","code":"SAA-C03","status":"passed"}]\n```', now)).toEqual(["cert updated: SAA-C03"]);
  expect(learning.get().certs).toHaveLength(1);
});

it("reminds about exams within a month and follow-ups due by tomorrow, soonest first", () => {
  const learning = new Learning(tmp()), now = new Date(2026, 9, 7, 9, 0).getTime(), at = (d: number, h = 9) => new Date(2026, 9, 7 + d, h).getTime();
  const ops = [
    { op: "cert", name: "AWS Solutions Architect – Associate", code: "SAA-C03", status: "booked", examDate: new Date(at(12)).toISOString().slice(0, 10) },
    { op: "cert", name: "CKA", status: "planned", examDate: new Date(at(60)).toISOString().slice(0, 10) }, // too far out
    { op: "cert", name: "Terraform Associate", status: "passed", examDate: new Date(at(2)).toISOString().slice(0, 10) }, // done
    { op: "job", company: "Anthropic", stage: "applied", next: "Follow up with the recruiter", nextAt: new Date(at(0)).toISOString().slice(0, 10) },
    { op: "job", company: "Vercel", stage: "interviewing", next: "Send thank-you note", nextAt: new Date(at(-2)).toISOString().slice(0, 10) },
    { op: "job", company: "Stripe", stage: "saved", next: "Apply", nextAt: new Date(at(9)).toISOString().slice(0, 10) }, // not yet
    { op: "job", company: "Old Co", stage: "closed", next: "x", nextAt: new Date(at(0)).toISOString().slice(0, 10) },
  ];
  applyLearnOps(learning, "```learn\n" + JSON.stringify(ops) + "\n```", now);
  const r = learnReminders(learning.get(), now);
  expect(r.map((x) => [x.kind, x.days, x.text])).toEqual([
    ["followup", -2, "Overdue by 2 days: Send thank-you note (Vercel)."],
    ["followup", 0, "Today: Follow up with the recruiter (Anthropic)."],
    ["exam", 12, "Your SAA-C03 exam is in 12 days."],
  ]);
  expect(learnReminders(learning.get(), at(11)).find((x) => x.kind === "exam")).toMatchObject({ days: 1, text: "Your SAA-C03 exam is tomorrow." });
  expect(learnReminders(learning.get(), at(12)).find((x) => x.kind === "exam")).toMatchObject({ days: 0, text: "Your SAA-C03 exam is today. You've got this." });
});


describe("a fit check's gaps feed your path", () => {
  const base = (roadmaps: LearningState["roadmaps"] = []) => LearningSchema.parse({ roadmaps });
  const job = { company: "Acme", role: "Platform Engineer" };
  it("adds what the posting asks for that your roadmap doesn't cover, once", async () => {
    const s = base([{ id: "r1", goal: "DevOps", months: 6, title: "DevOps", run: "", created: 1, milestones: [{ title: "Kubernetes fundamentals", why: "", skills: ["Kubernetes"], project: "", weeks: 2, done: false }] }]);
    const { state, added } = gapsToPath(s, job, ["Kubernetes", "Terraform", "AWS networking"]);
    expect(added).toEqual(["Terraform", "AWS networking"]); // Kubernetes is already on the path
    expect(state.roadmaps[0]!.milestones.map((m) => m.title)).toEqual(["Kubernetes fundamentals", "Close the gap · Terraform", "Close the gap · AWS networking"]);
    expect(state.roadmaps[0]!.milestones[1]!.why).toContain("Acme (Platform Engineer)");
    expect(gapsToPath(state, job, ["Terraform"]).added).toEqual([]); // a second check adds nothing new
  });
  it("starts a roadmap for the job when you don't have one, and takes at most four", () => {
    const { state, added } = gapsToPath(base(), job, ["Go", "Terraform", "AWS", "Helm", "Kafka"]);
    expect(added).toHaveLength(4);
    expect(state.roadmaps).toHaveLength(1);
    expect(state.roadmaps[0]!.title).toBe("Close the gaps for Acme");
  });
});
