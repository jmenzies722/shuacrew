/**
 * Exam prep: what it takes to pass a certification on the first try, kept apart from the rest of Learn (question banks
 * and every answer you give get large). A blueprint per certification — the official exam guide's domains, their
 * weights and task statements, the format and the pass mark — researched by Shua, with built-ins for exams we know.
 * A bank of exam-style questions written for those tasks. Every answer you give (that's what mastery is measured on),
 * and your mock exams. Stored as one owner-only file; everything a model writes is validated before it lands.
 */
import { chmodSync, copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { z } from "zod";

const task = z.object({ id: z.string().max(12), title: z.string().max(300), skills: z.array(z.string().max(80)).max(20).default([]) });
const domain = z.object({ id: z.string().max(12), name: z.string().max(160), weight: z.number().min(0).max(100), tasks: z.array(task).max(16).default([]) });
const blueprint = z.object({
  code: z.string().max(40), name: z.string().max(160), provider: z.string().max(60).default(""), url: z.string().max(500).default(""),
  /** Questions on the exam, how many are scored, and the time allowed. */
  questions: z.number().int().min(1).max(400), scored: z.number().int().min(1).max(400).optional(), minutes: z.number().int().min(1).max(600),
  /** The pass mark on the exam's own scale (AWS: 750 on 100–1000). */
  passing: z.number().min(0), scale: z.tuple([z.number(), z.number()]),
  formats: z.array(z.string().max(80)).max(6).default([]),
  domains: z.array(domain).min(1).max(12),
  source: z.enum(["builtin", "research"]), run: z.string().optional(), at: z.number(),
});
const option = z.object({ id: z.string().regex(/^[A-H]$/), text: z.string().min(1).max(700) });
const question = z.object({
  id: z.string(), cert: z.string().max(40), domain: z.string().max(12), task: z.string().max(12).default(""),
  /** One answer, or "choose two/three". */
  kind: z.enum(["single", "multi"]), stem: z.string().min(20).max(3000), options: z.array(option).min(3).max(8),
  answer: z.array(z.string().regex(/^[A-H]$/)).min(1).max(4),
  /** Why the right answer is right, in a paragraph; and a line on each option. */
  explain: z.string().max(2000).default(""), why: z.record(z.string().regex(/^[A-H]$/), z.string().max(500)).default({}),
  refs: z.array(z.string().max(500)).max(4).default([]), difficulty: z.number().int().min(1).max(3).default(2),
  /** The official documentation's own words that settle the answer: checked when it was written, shown when it's revealed. */
  evidence: z.string().max(800).default(""),
  /** When Shua last checked its answer key against the docs (a separate run from the one that wrote it). */
  checked: z.number().optional(),
  /** You reported it as wrong: out of practice, mocks and your mastery from then on. */
  flag: z.object({ at: z.number(), note: z.string().max(500).default("") }).optional(),
  run: z.string().optional(), created: z.number(),
});
const attempt = z.object({ q: z.string(), at: z.number(), chosen: z.array(z.string()).max(8), correct: z.boolean(), ms: z.number().min(0).default(0), mode: z.enum(["quick", "drill", "missed", "mock", "diagnostic"]) });
const mock = z.object({
  id: z.string(), cert: z.string().max(40), started: z.number(), minutes: z.number().int(), questions: z.array(z.string()).max(400),
  answers: z.record(z.string(), z.array(z.string()).max(8)).default({}), flagged: z.array(z.string()).max(400).default([]),
  finished: z.number().optional(), correct: z.number().int().optional(), score: z.number().optional(),
});
export const ExamSchema = z.object({
  version: z.literal(1).default(1),
  blueprints: z.record(z.string().max(40), blueprint).default({}),
  questions: z.array(question).max(6000).default([]),
  attempts: z.array(attempt).max(40_000).default([]),
  mocks: z.array(mock).max(200).default([]),
  /** Research and question-writing runs in flight, so the same thing is never asked for twice at once. */
  // A finished one is kept with what it added: one that added nothing cools down rather than being asked again at once.
  working: z.record(z.string().max(80), z.object({ run: z.string(), started: z.number(), done: z.number().optional(), added: z.number().optional() })).default({}),
});
export type Blueprint = z.infer<typeof blueprint>;
export type Domain = z.infer<typeof domain>;
export type Question = z.infer<typeof question>;
export type Attempt = z.infer<typeof attempt>;
export type Mock = z.infer<typeof mock>;
export type ExamState = z.infer<typeof ExamSchema>;

/** The exam a cert is, by its code: "DOP-CO2" (a letter O for a zero) is DOP-C02. */
export const examKey = (code: string) => code.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/(?<=[A-Z]-?C)O(?=\d)/g, "0");

/**
 * Exams we know well enough to start on the spot (Shua's research refreshes them from the official guide).
 * AWS Certified DevOps Engineer – Professional (DOP-C02): 75 questions (65 scored), 180 minutes, 750 on 100–1000.
 */
export const BUILTIN: Record<string, Omit<Blueprint, "at">> = {
  "DOP-C02": {
    code: "DOP-C02", name: "AWS Certified DevOps Engineer – Professional", provider: "AWS", url: "https://aws.amazon.com/certification/certified-devops-engineer-professional/",
    questions: 75, scored: 65, minutes: 180, passing: 750, scale: [100, 1000], formats: ["Multiple choice (one of four)", "Multiple response (two or more of five or more)"],
    source: "builtin",
    domains: [
      { id: "d1", name: "SDLC Automation", weight: 22, tasks: [
        { id: "1.1", title: "Implement CI/CD pipelines", skills: ["CodePipeline", "CodeBuild", "CodeDeploy", "cross-account pipelines", "GitHub / CodeCommit triggers"] },
        { id: "1.2", title: "Integrate automated testing into CI/CD pipelines", skills: ["CodeBuild test reports", "unit/integration/load tests", "quality gates", "manual approvals"] },
        { id: "1.3", title: "Build and manage artifacts", skills: ["CodeArtifact", "ECR", "S3 artifacts", "image scanning", "artifact versioning"] },
        { id: "1.4", title: "Implement deployment strategies for instance, container and serverless environments", skills: ["blue/green", "canary", "rolling", "CodeDeploy configs", "Lambda aliases & traffic shifting", "ECS deployments", "AppConfig"] },
      ] },
      { id: "d2", name: "Configuration Management and IaC", weight: 17, tasks: [
        { id: "2.1", title: "Define cloud infrastructure and reusable components to provision and manage systems throughout their lifecycle", skills: ["CloudFormation", "StackSets", "nested stacks", "custom resources", "drift detection", "CDK", "SAM", "Service Catalog"] },
        { id: "2.2", title: "Deploy automation to create, onboard and secure AWS accounts in a multi-account or multi-Region environment", skills: ["Organizations", "Control Tower", "SCPs", "Account Factory", "StackSets with service-managed permissions"] },
        { id: "2.3", title: "Design and build automated solutions for complex tasks and large-scale environments", skills: ["Systems Manager Automation", "State Manager", "Patch Manager", "Step Functions", "Lambda", "OpsWorks/Config as code"] },
      ] },
      { id: "d3", name: "Resilient Cloud Solutions", weight: 15, tasks: [
        { id: "3.1", title: "Implement highly available solutions to meet resilience and business requirements", skills: ["Multi-AZ", "multi-Region", "Route 53 failover", "Aurora Global Database", "DynamoDB global tables"] },
        { id: "3.2", title: "Implement solutions that are scalable to meet business requirements", skills: ["Auto Scaling policies", "ELB", "ECS/EKS scaling", "caching", "SQS buffering"] },
        { id: "3.3", title: "Implement automated recovery processes to meet RTO and RPO requirements", skills: ["AWS Backup", "pilot light", "warm standby", "multi-site", "RTO/RPO", "Elastic Disaster Recovery"] },
      ] },
      { id: "d4", name: "Monitoring and Logging", weight: 15, tasks: [
        { id: "4.1", title: "Configure the collection, aggregation and storage of logs and metrics", skills: ["CloudWatch agent", "CloudWatch Logs", "metric filters", "Kinesis Data Firehose", "S3 log archives", "cross-account log aggregation"] },
        { id: "4.2", title: "Audit, monitor and analyze logs and metrics to detect issues", skills: ["Logs Insights", "X-Ray", "anomaly detection", "Athena", "OpenSearch"] },
        { id: "4.3", title: "Automate monitoring and event management of complex environments", skills: ["EventBridge", "CloudWatch alarms", "composite alarms", "Synthetics", "dashboards"] },
      ] },
      { id: "d5", name: "Incident and Event Response", weight: 14, tasks: [
        { id: "5.1", title: "Manage event sources to process, notify and take action in response to events", skills: ["EventBridge rules", "SNS", "SQS", "Lambda", "Health events"] },
        { id: "5.2", title: "Implement configuration changes in response to events", skills: ["Config auto-remediation", "SSM Automation runbooks", "Auto Scaling lifecycle hooks"] },
        { id: "5.3", title: "Troubleshoot system and application failures", skills: ["CodeDeploy rollbacks", "ECS task failures", "Lambda errors", "CloudFormation rollbacks", "SSM Run Command"] },
      ] },
      { id: "d6", name: "Security and Compliance", weight: 17, tasks: [
        { id: "6.1", title: "Implement techniques for identity and access management at scale", skills: ["IAM roles", "IAM Identity Center", "permission boundaries", "cross-account roles", "ABAC"] },
        { id: "6.2", title: "Apply automation for security controls and data protection", skills: ["KMS", "Secrets Manager", "Config rules", "WAF", "Security Hub controls"] },
        { id: "6.3", title: "Implement security monitoring and auditing solutions", skills: ["CloudTrail (organization trails)", "GuardDuty", "Security Hub", "Inspector", "Macie"] },
      ] },
    ],
  },
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);

/** A ```blueprint block (or any JSON object with `domains`) from Shua's research, validated, or null. Weights sum to ~100. */
export function parseBlueprint(raw: unknown, run: string, now = Date.now()): Blueprint | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const domains = Array.isArray(o.domains) ? o.domains.slice(0, 12).map((d, i) => {
    const x = (d && typeof d === "object" ? d : {}) as Record<string, unknown>;
    const tasks = Array.isArray(x.tasks) ? x.tasks.slice(0, 16).flatMap((t, j) => {
      const y = (t && typeof t === "object" ? t : { title: t }) as Record<string, unknown>;
      const title = str(y.title ?? y.name, 300); if (!title) return [];
      return [{ id: str(y.id, 12) || `${i + 1}.${j + 1}`, title, skills: Array.isArray(y.skills) ? y.skills.map((s) => str(s, 80)).filter(Boolean).slice(0, 20) : [] }];
    }) : [];
    return { id: `d${i + 1}`, name: str(x.name ?? x.title, 160), weight: Math.max(0, Math.min(100, num(x.weight) ?? 0)), tasks };
  }).filter((d) => d.name) : [];
  const total = domains.reduce((s, d) => s + d.weight, 0);
  if (!domains.length || total < 80 || total > 120) return null; // not an exam guide's weighting
  const scale = Array.isArray(o.scale) && o.scale.length === 2 ? [num(o.scale[0]) ?? 0, num(o.scale[1]) ?? 100] as [number, number] : [100, 1000] as [number, number];
  const parsed = blueprint.safeParse({
    code: examKey(str(o.code, 40)), name: str(o.name, 160), provider: str(o.provider, 60), url: /^https:\/\//.test(str(o.url, 500)) ? str(o.url, 500) : "",
    questions: Math.round(num(o.questions) ?? 0), scored: num(o.scored) ? Math.round(num(o.scored)!) : undefined, minutes: Math.round(num(o.minutes) ?? 0),
    passing: num(o.passing) ?? 0, scale, formats: Array.isArray(o.formats) ? o.formats.map((f) => str(f, 80)).filter(Boolean).slice(0, 6) : [],
    domains, source: "research", run, at: now,
  });
  return parsed.success && parsed.data.code && parsed.data.passing > parsed.data.scale[0] ? parsed.data : null;
}

/**
 * Questions from a ```quiz block: only well-formed ones (the answer is among the options, "choose N" has N answers,
 * no duplicate options), tagged to a domain the blueprint has. At most 20 from one reply.
 */
export function parseQuestions(raw: unknown, bp: Pick<Blueprint, "code" | "domains">, run: string, now = Date.now(), id = () => `q_${Math.random().toString(36).slice(2, 10)}`): Question[] {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { questions?: unknown }).questions) ? (raw as { questions: unknown[] }).questions : [];
  const tasks = new Map(bp.domains.flatMap((d) => d.tasks.map((t) => [t.id, d.id] as const)));
  const out: Question[] = [];
  for (const item of list.slice(0, 20)) {
    const o = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const letters = "ABCDEFGH";
    const options = Array.isArray(o.options) ? o.options.slice(0, 8).map((x, i) => typeof x === "string" ? { id: letters[i]!, text: str(x.replace(/^[A-H][.)]\s*/, ""), 700) } : { id: str((x as { id?: unknown })?.id, 1).toUpperCase() || letters[i]!, text: str((x as { text?: unknown })?.text, 700) }) : [];
    if (new Set(options.map((x) => x.text.toLowerCase())).size !== options.length || new Set(options.map((x) => x.id)).size !== options.length) continue;
    const answer = (Array.isArray(o.answer) ? o.answer : [o.answer]).map((a) => str(a, 1).toUpperCase()).filter((a) => options.some((x) => x.id === a));
    const taskId = str(o.task, 12), domainId = tasks.get(taskId) ?? (bp.domains.some((d) => d.id === str(o.domain, 12)) ? str(o.domain, 12) : "");
    if (!domainId || !answer.length || answer.length >= options.length) continue;
    const kind = answer.length > 1 ? "multi" : "single";
    const why = o.why && typeof o.why === "object" ? Object.fromEntries(Object.entries(o.why as Record<string, unknown>).map(([k, v]) => [k.toUpperCase(), str(v, 500)]).filter(([k, v]) => options.some((x) => x.id === k) && v)) : {};
    const parsed = question.safeParse({
      id: id(), cert: bp.code, domain: domainId, task: tasks.has(taskId) ? taskId : "", kind, stem: str(o.stem ?? o.question, 3000), options, answer: [...new Set(answer)].sort(),
      explain: str(o.explain ?? o.explanation, 2000), why, refs: Array.isArray(o.refs) ? o.refs.map((r) => str(r, 500)).filter((r) => /^https:\/\//.test(r)).slice(0, 4) : [],
      difficulty: Math.min(3, Math.max(1, Math.round(num(o.difficulty) ?? 2))), evidence: str(o.evidence ?? o.source, 800), run, created: now,
    });
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** The store: one file, owner-only, written atomically; an unreadable file is kept aside, never overwritten. */
export class ExamPrep {
  private value: ExamState;
  constructor(private file: string) {
    let v: ExamState = ExamSchema.parse({});
    try {
      if (existsSync(file)) {
        const p = ExamSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
        if (p.success) v = p.data; else copyFileSync(file, `${file}.unreadable-${Date.now()}`);
      }
    } catch { try { copyFileSync(file, `${file}.unreadable-${Date.now()}`); } catch { /* nothing to keep */ } }
    this.value = v;
  }
  get(): ExamState { return this.value; }
  edit(fn: (s: ExamState) => ExamState): ExamState {
    const next = ExamSchema.parse(fn(this.value));
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(next), { mode: 0o600 }); renameSync(tmp, this.file);
    try { chmodSync(this.file, 0o600); } catch { /* best effort */ }
    this.value = next;
    return next;
  }
  /** A cert's blueprint: researched if we have it, else the built-in one. */
  blueprint(code: string): Blueprint | null {
    const key = examKey(code);
    return this.value.blueprints[key] ?? (BUILTIN[key] ? { ...BUILTIN[key]!, at: 0 } : null);
  }
}

/** Shua's check of one question against the docs. */
export interface Verdict { id: string; verdict: "correct" | "wrong" | "unclear"; answer?: string[]; explain?: string; why?: Record<string, string>; evidence?: string; refs?: string[]; note?: string }

/** A check run's verdicts, kept only where they name a real question and say something definite. */
export function parseVerdicts(raw: unknown): Verdict[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x): Verdict[] => {
    const o = (x ?? {}) as Record<string, unknown>, id = str(o.id, 80), v = str(o.verdict, 12).toLowerCase();
    if (!id || !["correct", "wrong", "unclear"].includes(v)) return [];
    const answer = Array.isArray(o.answer) ? o.answer.map((a) => str(a, 1).toUpperCase()).filter((a) => /^[A-H]$/.test(a)) : undefined;
    const why = o.why && typeof o.why === "object" ? Object.fromEntries(Object.entries(o.why as Record<string, unknown>).filter(([k, t]) => /^[A-H]$/.test(k) && typeof t === "string").map(([k, t]) => [k, str(t, 500)])) : undefined;
    const refs = Array.isArray(o.refs) ? o.refs.map((r) => str(r, 500)).filter((r) => /^https:\/\//.test(r)).slice(0, 4) : undefined;
    return [{ id, verdict: v as Verdict["verdict"], answer, explain: str(o.explain, 2000) || undefined, why, evidence: str(o.evidence, 800) || undefined, refs, note: str(o.note, 300) || undefined }];
  });
}

/**
 * Apply a check: confirmed keys get their evidence; a wrong key is corrected (same number of answers, so the stem's
 * "choose two" still holds) and every past answer to it is graded again; one the docs can't settle is taken out.
 * Returns the questions whose key changed or that were taken out (their miss cards carry the old answer).
 */
export function applyVerdicts(s: ExamState, verdicts: Verdict[], now = Date.now()): { state: ExamState; changed: Question[] } {
  const byId = new Map(verdicts.map((v) => [v.id, v])), changed: Question[] = [], regrade = new Map<string, string[]>();
  const questions = s.questions.map((q) => {
    const v = byId.get(q.id); if (!v || q.flag) return q;
    const refs = v.refs?.length ? [...new Set([...v.refs, ...q.refs])].slice(0, 4) : q.refs;
    if (v.verdict === "correct") return { ...q, evidence: v.evidence ?? q.evidence, refs, checked: now };
    const fixed = v.verdict === "wrong" && v.answer && v.answer.length === q.answer.length && new Set(v.answer).size === v.answer.length && v.answer.every((a) => q.options.some((o) => o.id === a));
    if (fixed) {
      const answer = [...v.answer!].sort(), next = { ...q, answer, explain: v.explain ?? v.note ?? "", why: v.why ?? {}, evidence: v.evidence ?? "", refs, checked: now };
      changed.push(q); regrade.set(q.id, answer); return next;
    }
    changed.push(q);
    return { ...q, checked: now, flag: { at: now, note: `Shua couldn't confirm this one against the official docs${v.note ? `: ${v.note}` : "."}`.slice(0, 500) } };
  });
  const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
  const attempts = regrade.size ? s.attempts.map((a) => (regrade.has(a.q) ? { ...a, correct: same(a.chosen, regrade.get(a.q)!) } : a)) : s.attempts;
  return { state: { ...s, questions, attempts }, changed };
}
