/**
 * Specs: requirements, then design, then tasks. Each phase is a markdown file under
 * `{repo}/.shuacrew/specs/{id}/`, approved here, and the tasks become queued runs.
 *
 * A seed draft lands immediately so you can review. A planner session then rewrites
 * that file in the repo (not a worktree). Comments on a line go back as one run.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AnyEvent } from "@shuacrew/core";
import type { EventStore } from "./store.js";
import type { LaunchSpec } from "./runs.js";

export const PHASES = ["requirements", "design", "tasks"] as const;
export type Phase = (typeof PHASES)[number];

export interface SpecComment {
  phase: Phase;
  line: number;
  text: string;
}

export interface SpecView {
  id: string;
  title: string;
  ask: string;
  repo: string;
  phase: Phase;
  approved: Phase[];
  runs: string[];
  comments: SpecComment[];
  file: string;
  /** Live session rewriting the current phase, if any. */
  planning?: string;
}

export type SpecDetail = SpecView & { text: string };

const PHASE = new Set<string>(PHASES);

export function draftRequirements(title: string, ask: string): string {
  const sentence = ask.replace(/\s+/g, " ").trim().replace(/\.$/, "");
  return `# ${title}\n\n${ask.trim()}\n\n## Requirements\n\n- WHEN someone asks for this, THE SYSTEM SHALL ${sentence}.\n- IF a phase is not approved, THEN THE SYSTEM SHALL not start the next one.\n- WHILE a phase is in review, THE SYSTEM SHALL keep the draft in .shuacrew/specs/.\n`;
}

export function draftDesign(requirements: string): string {
  const lines = requirements.split("\n").map((l) => l.trim()).filter((l) => /THE SYSTEM SHALL/.test(l));
  const sections = lines.map((line, i) => {
    const name = line.replace(/^- /, "").slice(0, 72);
    return `## ${i + 1}. ${name}\n\nShow this phase in the spec review. Approve it before the next one exists.\n`;
  });
  return `# Design\n\n${sections.join("\n") || "No requirements to design from.\n"}`;
}

export function draftTasks(design: string): string {
  const heads = design.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("## "));
  const tasks = heads.map((head) => `- [ ] ${head.replace(/^##\s*/, "")}`);
  return `# Tasks\n\n${tasks.join("\n") || "- [ ] Implement the approved design"}\n`;
}

/** Checkbox lines and numbered lines, as the ask a run should carry. */
export function taskLines(tasks: string): string[] {
  return tasks
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[-*]\s+\[[ xX]\]\s+\S/.test(l) || /^\d+\.\s+\S/.test(l))
    .map((l) => l.replace(/^[-*]\s+\[[ xX]\]\s+/, "").replace(/^\d+\.\s+/, ""));
}

export class Specs {
  constructor(
    private store: EventStore,
    private launch: (spec: LaunchSpec) => string,
  ) {}

  list(): SpecView[] {
    return [...fold(this.store.read(0)).values()]
      .map((spec) => ({ ...spec, planning: spec.planning && this.stillRunning(spec.planning) ? spec.planning : undefined }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  get(id: string): SpecDetail | undefined {
    const spec = fold(this.store.read(0)).get(id);
    if (!spec) return undefined;
    const text = readFileSync(spec.file, "utf8");
    const planning = spec.planning && this.stillRunning(spec.planning) ? spec.planning : undefined;
    return { ...spec, text, planning, comments: spec.comments.filter((c) => c.phase === spec.phase) };
  }

  open(ask: string, repo: string): SpecDetail {
    const title = ask.replace(/\s+/g, " ").trim().slice(0, 60);
    const id = `s_${randomUUID().slice(0, 8)}`;
    const root = specRoot(repo, id);
    mkdirSync(root, { recursive: true });
    const file = path.join(root, "requirements.md");
    writeFileSync(file, draftRequirements(title, ask));
    this.store.append("spec.opened", { id, title, ask: ask.trim(), repo: path.resolve(repo) });
    this.store.append("spec.advanced", { id, phase: "requirements" });
    this.plan(id, "requirements", file, path.resolve(repo), ask.trim());
    return this.get(id)!;
  }

  comment(id: string, line: number, text: string): SpecDetail {
    const spec = this.require(id);
    this.store.append("spec.comment", { id, phase: spec.phase, line, text: text.trim() });
    return this.get(id)!;
  }

  /** One run, carrying every comment on the current phase. */
  revise(id: string): { run: string } {
    const spec = this.get(id);
    if (!spec) throw new Error("no such spec");
    const notes = spec.comments.map((c) => `line ${c.line}: ${c.text}`).join("\n");
    if (!notes) throw new Error("comment on a line first");
    const run = this.launch({
      ask: `Revise ${spec.file}. Address these comments, keep the same phase, and stop:\n\n${notes}`,
      title: `Revise ${spec.title}`,
      repo: spec.repo,
      labels: ["spec", spec.id],
      inPlace: true,
      approveAll: true,
    });
    return { run };
  }

  approve(id: string): SpecDetail {
    const spec = this.get(id);
    if (!spec) throw new Error("no such spec");
    if (spec.approved.includes(spec.phase)) throw new Error(`${spec.phase} is already approved`);
    const tasks = spec.phase === "tasks" ? taskLines(spec.text) : [];
    if (spec.phase === "tasks" && !tasks.length) throw new Error("no tasks to fan out");
    this.store.append("spec.approved", { id, phase: spec.phase });
    if (spec.phase === "requirements") this.writeNext(spec, "design", draftDesign(spec.text), spec.text);
    else if (spec.phase === "design") this.writeNext(spec, "tasks", draftTasks(spec.text), spec.text);
    else {
      const runs = tasks.map((task) => this.launch({ ask: task, title: task.slice(0, 60), repo: spec.repo, labels: ["spec", spec.id] }));
      this.store.append("spec.fanned", { id, runs });
    }
    return this.get(id)!;
  }

  private writeNext(spec: SpecView, phase: Phase, body: string, prior: string): void {
    const file = path.join(specRoot(spec.repo, spec.id), `${phase}.md`);
    writeFileSync(file, body);
    this.store.append("spec.advanced", { id: spec.id, phase });
    this.plan(spec.id, phase, file, spec.repo, spec.ask, prior);
  }

  private plan(id: string, phase: Phase, file: string, repo: string, ask: string, prior?: string): void {
    const run = this.launch({
      ask: planAsk(phase, file, ask, prior),
      title: `Draft ${phase}`,
      repo,
      labels: ["spec", id, "planner"],
      inPlace: true,
      approveAll: true,
    });
    this.store.append("spec.planned", { id, phase, run });
  }

  private require(id: string): SpecView {
    const spec = fold(this.store.read(0)).get(id);
    if (!spec) throw new Error("no such spec");
    return spec;
  }

  private stillRunning(run: string): boolean {
    const last = [...this.store.forRun(run)].reverse().find((e) => e.kind === "run.status");
    return last?.kind === "run.status" ? !["done", "failed", "cancelled", "merged"].includes(last.body.status) : true;
  }
}

function specRoot(repo: string, id: string): string {
  if (!/^s_[a-z0-9]+$/i.test(id)) throw new Error("bad spec id");
  const root = path.resolve(repo);
  if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) throw new Error("repo is not a directory");
  const dir = path.resolve(root, ".shuacrew", "specs", id);
  if (!dir.startsWith(root + path.sep)) throw new Error("spec path escapes the repo");
  return dir;
}

function fold(events: Iterable<AnyEvent>): Map<string, SpecView> {
  const specs = new Map<string, SpecView>();
  for (const event of events) {
    if (event.kind === "spec.opened") {
      specs.set(event.body.id, {
        id: event.body.id,
        title: event.body.title,
        ask: event.body.ask,
        repo: event.body.repo,
        phase: "requirements",
        approved: [],
        runs: [],
        comments: [],
        file: path.join(event.body.repo, ".shuacrew", "specs", event.body.id, "requirements.md"),
        planning: undefined,
      });
    }
    const spec = "id" in (event.body as object) ? specs.get((event.body as { id: string }).id) : undefined;
    if (!spec) continue;
    if (event.kind === "spec.advanced" && PHASE.has(event.body.phase)) {
      spec.phase = event.body.phase;
      spec.file = path.join(spec.repo, ".shuacrew", "specs", spec.id, `${event.body.phase}.md`);
    }
    if (event.kind === "spec.approved" && !spec.approved.includes(event.body.phase)) spec.approved.push(event.body.phase);
    if (event.kind === "spec.comment") spec.comments.push({ phase: event.body.phase, line: event.body.line, text: event.body.text });
    if (event.kind === "spec.fanned") spec.runs = event.body.runs;
    if (event.kind === "spec.planned") spec.planning = event.body.run;
  }
  return specs;
}

function planAsk(phase: Phase, file: string, ask: string, prior?: string): string {
  const stop = `Replace the whole file at ${file}. Do not change anything else. Then stop.`;
  if (phase === "requirements") {
    return `Rewrite the requirements for this spec. Use EARS (WHEN / IF / WHILE … THE SYSTEM SHALL). ${stop}\n\n${ask}`;
  }
  if (phase === "design") {
    return `Write the design from the approved requirements. One section per SHALL. ${stop}\n\n${prior ?? ask}`;
  }
  return `Write checkbox tasks from the approved design. Each task is one implementable run. ${stop}\n\n${prior ?? ask}`;
}
