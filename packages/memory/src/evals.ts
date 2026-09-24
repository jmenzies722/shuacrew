/**
 * Proven, not hoped: does recall hand each run the lessons it needs, and only those? A fixed set of
 * lessons and asks with the answers a person would give. `pnpm eval` prints the scores; the test
 * suite fails if they drop.
 */
import { emptyMemory, type MemoryView } from "./memory.js";
import { recall } from "./recall.js";

const LESSONS: Array<{ id: string; text: string; project?: string; confidence?: number }> = [
  { id: "pnpm", text: "Use pnpm to install packages, never npm or yarn.", project: "/r/web" },
  { id: "fake-timers", text: "Tests must use the injected Clock, never real timers or sleeps." },
  { id: "migrations", text: "Database migrations need a matching down migration and a backfill plan." },
  { id: "terraform", text: "Never run terraform apply; stop after terraform plan and ask for review." },
  { id: "changelog", text: "Add a CHANGELOG entry for every user-visible change." },
  { id: "commits", text: "Commit messages use the imperative mood and explain why, not what." },
  { id: "flaky", text: "When a test is flaky, find the race before adding retries." },
  { id: "swift", text: "SwiftUI views stay under 200 lines; extract subviews early.", project: "/r/mac" },
  { id: "doubted", text: "Always add retries to flaky upload tests.", confidence: 0.2 },
  { id: "api-errors", text: "API handlers return typed errors, never throw strings." },
];

const CASES: Array<{ ask: string; project?: string; want: string[] }> = [
  { ask: "Fix the flaky upload retry test on CI", project: "/r/web", want: ["flaky", "fake-timers"] },
  { ask: "Add a users.last_seen column and migrate existing rows", want: ["migrations"] },
  { ask: "Plan the terraform change for the new S3 bucket", want: ["terraform"] },
  { ask: "Install zod and add a schema for the settings form", project: "/r/web", want: ["pnpm"] },
  { ask: "Split the 400-line SettingsView into smaller views", project: "/r/mac", want: ["swift"] },
  { ask: "Split the 400-line SettingsView into smaller views", project: "/r/web", want: [] },
  { ask: "Ship the dark mode toggle to users", want: ["changelog"] },
  { ask: "Make the sync test stop sleeping for 2 seconds", want: ["fake-timers"] },
  { ask: "Return a 404 error from the GET /projects handler when missing", want: ["api-errors"] },
  { ask: "Rename the README title", want: [] },
];

export interface EvalResult {
  precision: number;
  recall: number;
  /** Cases where recall returned exactly what was wanted (as a set, within the top 3). */
  exact: number;
  cases: Array<{ ask: string; project?: string; want: string[]; got: string[] }>;
}

export function evalMemory(): MemoryView {
  const m = emptyMemory();
  for (const l of LESSONS) {
    const confidence = l.confidence ?? 0.7;
    m.lessons[l.id] = {
      id: l.id,
      text: l.text,
      scope: l.project ? "project" : "global",
      project: l.project,
      origin: "stated",
      base: confidence,
      confidence,
      learnedAt: 0,
      applied: 0,
      wins: 0,
      losses: 0,
    };
  }
  return m;
}

export function runRecallEval(limit = 3): EvalResult {
  const memory = evalMemory();
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let exact = 0;
  const cases = CASES.map((c) => {
    const got = recall(memory, c.ask, c.project, limit).map((r) => r.lesson.id);
    const want = new Set(c.want);
    tp += got.filter((g) => want.has(g)).length;
    fp += got.filter((g) => !want.has(g)).length;
    fn += c.want.filter((w) => !got.includes(w)).length;
    if (got.length === want.size && got.every((g) => want.has(g))) exact += 1;
    return { ...c, got };
  });
  return { precision: tp / (tp + fp || 1), recall: tp / (tp + fn || 1), exact: exact / CASES.length, cases };
}
