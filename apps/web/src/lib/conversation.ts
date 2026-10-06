/**
 * A run's events, as a conversation a person can read.
 *
 * Pure: the run view and the timeline scrubber both call it — the scrubber just stops folding at
 * the chosen sequence number, which is all "replay" needs to be.
 */
import type { AnyEvent } from "@shuacrew/core/events";
export { queuedMessages as queued } from "@shuacrew/core/queue";

export type Item =
  | { kind: "ask"; seq: number; turn: number; text: string; by: string; at: number }
  | { kind: "prose"; seq: number; turn: number; text: string; streaming: boolean }
  | { kind: "tool"; seq: number; id: string; tool: string; input: unknown; subagent?: string; ok?: boolean; output?: string; durationMs?: number; at: number }
  | { kind: "files"; seq: number; paths: string[] }
  | { kind: "check"; seq: number; command: string; passed: boolean; output: string }
  | { kind: "subagent"; seq: number; id: string; name: string; task: string; done: boolean; ok?: boolean; summary?: string }
  | { kind: "approval"; seq: number; id: string; tool: string; input: unknown; risk: string; reason: string; rule: string; layer?: string; decided?: { allow: boolean; by: string } }
  | { kind: "denied"; seq: number; tool: string; rule: string; layer?: string; reason: string }
  | { kind: "checkpoint"; seq: number; turn: number; commit?: string; note: string }
  | { kind: "note"; seq: number; text: string; tone: "live" | "bad" | "idle" | "wait" }
  | { kind: "thought"; seq: number; turn: number; text: string; streaming: boolean }
  | { kind: "compacted"; seq: number; text: string }
  /** The agent's own checklist for a turn: one card, updated in place as steps move. */
  | { kind: "plan"; seq: number; turn: number; steps: PlanStep[]; note: string }
  | {
      kind: "finished";
      seq: number;
      turn: number;
      durationMs?: number;
      route: string;
      runtime?: string;
      model?: string;
      tokens?: number;
      commit?: string;
      /** Lesson ids this turn was given (the text comes from memory). */
      lessons: string[];
      /** What the turn actually did, so "done" is never claimed on faith. */
      receipt: Receipt;
    };

export interface PlanStep { text: string; status: "pending" | "active" | "done" }

/**
 * A turn's receipt: what changed, whether anything proved it works, and what's left.
 * `outcome` is the honest one-word verdict:
 *  - "verified": files changed and the last check passed
 *  - "unverified": files changed and nothing checked them
 *  - "failing": the last check failed
 *  - "answered": nothing changed (a reply, research, a question)
 *  - "stopped": the run failed before finishing the turn (no failing check to blame)
 */
export interface Receipt {
  files: string[];
  checks: { passed: number; failed: number; last?: { command: string; passed: boolean } };
  failedSteps: number;
  plan?: { done: number; total: number; left: string[] };
  outcome: "verified" | "unverified" | "failing" | "answered" | "stopped";
}

const EDIT_TOOL = /^(edit|multiedit|write|create|notebookedit|filechange|apply_patch|str_replace)/i;
/** Plumbing, not work: loading deferred tools, and the checklist (it has a card of its own). */
const HIDDEN_TOOL = new Set(["ToolSearch", "TodoWrite"]);

function receiptOf(files: Set<string>, checks: Receipt["checks"], failedSteps: number, plan?: Extract<Item, { kind: "plan" }>, stopped = false): Receipt {
  const left = plan ? plan.steps.filter((s) => s.status !== "done").map((s) => s.text) : [];
  const outcome = checks.last && !checks.last.passed ? "failing" : stopped ? "stopped" : files.size === 0 ? "answered" : checks.last?.passed ? "verified" : "unverified";
  return {
    files: [...files],
    checks,
    failedSteps,
    plan: plan && plan.steps.length ? { done: plan.steps.length - left.length, total: plan.steps.length, left } : undefined,
    outcome,
  };
}

export function conversation(events: AnyEvent[], until = Number.POSITIVE_INFINITY): Item[] {
  const items: Item[] = [];
  const tools = new Map<string, number>();
  const subagents = new Map<string, number>();
  const approvals = new Map<string, number>();
  let prose: Extract<Item, { kind: "prose" }> | null = null;
  // What the current turn has gathered for its footer.
  let turn = 0;
  let lessons: string[] = [];
  let tokens = 0;
  let commit: string | undefined;
  // The receipt this turn is building.
  let files = new Set<string>();
  let checks: Receipt["checks"] = { passed: 0, failed: 0 };
  let failedSteps = 0;
  let plan: Extract<Item, { kind: "plan" }> | null = null;
  // The last ask, and whether anything answered it: a run moved to another model after a usage limit starts the same
  // ask again as a new turn, which used to show your message (and any cut-off partial answer) twice or more.
  let lastAsk: Extract<Item, { kind: "ask" }> | null = null;
  let answered = false;

  const endProse = () => {
    if (prose) prose.streaming = false;
    prose = null;
  };

  for (const e of events) {
    if (e.seq > until) break;
    switch (e.kind) {
      case "turn.started": {
        endProse();
        const retry = lastAsk && !answered && lastAsk.text === e.body.text;
        if (retry) {
          // Same ask, never answered: the earlier attempt's half-written prose and thoughts go; tool work stays (it happened).
          const from = items.indexOf(lastAsk!);
          for (let i = items.length - 1; i > from; i--) { const it = items[i]!; if (it.kind === "prose" || it.kind === "thought" || it.kind === "plan") items.splice(i, 1); }
          lastAsk!.turn = e.body.turn;
        }
        turn = e.body.turn;
        lessons = [];
        tokens = 0;
        commit = undefined;
        answered = false;
        files = new Set();
        checks = { passed: 0, failed: 0 };
        failedSteps = 0;
        plan = null;
        if (!retry) { lastAsk = { kind: "ask", seq: e.seq, turn: e.body.turn, text: e.body.text, by: e.body.by, at: e.at }; items.push(lastAsk); }
        break;
      }
      case "agent.thinking": {
        endProse();
        // The runtime's note that it compacted the conversation gets a card of its own.
        if (/^Compacted the conversation/.test(e.body.text)) {
          items.push({ kind: "compacted", seq: e.seq, text: e.body.text });
          break;
        }
        const last = items[items.length - 1];
        if (last?.kind === "thought" && last.turn === e.body.turn) last.text += e.body.text;
        else items.push({ kind: "thought", seq: e.seq, turn: e.body.turn, text: e.body.text, streaming: true });
        break;
      }
      case "agent.delta":
        if (!prose || prose.turn !== e.body.turn) {
          prose = { kind: "prose", seq: e.seq, turn: e.body.turn, text: "", streaming: true };
          items.push(prose);
        }
        prose.text += e.body.text;
        break;
      case "agent.message": {
        const text = e.body.text.trim();
        // A runtime checkpoint can arrive between the streamed answer and its final copy.
        // Ignore that bookkeeping, but never deduplicate across turns or actual tool work.
        const last = items.findLast((item) => item.kind !== "checkpoint");
        if (e.body.final && last?.kind === "prose" && last.turn === e.body.turn && last.text.trim() === text) {
          endProse();
          break;
        }
        endProse();
        if (text) items.push({ kind: "prose", seq: e.seq, turn: e.body.turn, text, streaming: false });
        break;
      }
      case "tool.called":
        if (HIDDEN_TOOL.has(e.body.tool)) break;
        endProse();
        if (EDIT_TOOL.test(e.body.tool)) {
          const input = e.body.input as { file_path?: string; path?: string; changes?: Array<{ path?: string }> } | undefined;
          for (const p of [input?.file_path, input?.path, ...(input?.changes ?? []).map((c) => c.path)]) if (p) files.add(p);
        }
        tools.set(e.body.id, items.length);
        items.push({ kind: "tool", seq: e.seq, id: e.body.id, tool: e.body.tool, input: e.body.input, subagent: e.body.subagent, at: e.at });
        break;
      case "tool.returned": {
        const at = tools.get(e.body.id);
        const item = at === undefined ? undefined : items[at];
        if (item?.kind === "tool") {
          item.ok = e.body.ok;
          if (!e.body.ok) failedSteps += 1;
          item.output = e.body.output;
          item.durationMs = e.body.durationMs ?? e.at - item.at;
        }
        break;
      }
      case "file.changed": {
        endProse();
        files.add(e.body.path);
        const last = items[items.length - 1];
        if (last?.kind === "files") {
          if (!last.paths.includes(e.body.path)) last.paths.push(e.body.path);
        } else items.push({ kind: "files", seq: e.seq, paths: [e.body.path] });
        break;
      }
      case "check.ran": {
        endProse();
        const passed = e.body.exitCode === 0;
        checks = { passed: checks.passed + (passed ? 1 : 0), failed: checks.failed + (passed ? 0 : 1), last: { command: e.body.command, passed } };
        items.push({ kind: "check", seq: e.seq, command: e.body.command, passed, output: e.body.output });
        break;
      }
      case "plan.updated":
        // The newest copy wins, in the place the plan first appeared: one card that moves, not a stack of them.
        if (plan && plan.turn === e.body.turn) Object.assign(plan, { steps: e.body.steps, note: e.body.note });
        else { endProse(); plan = { kind: "plan", seq: e.seq, turn: e.body.turn, steps: e.body.steps, note: e.body.note }; items.push(plan); }
        break;
      case "subagent.started":
        endProse();
        subagents.set(e.body.id, items.length);
        items.push({ kind: "subagent", seq: e.seq, id: e.body.id, name: e.body.name, task: e.body.task, done: false });
        break;
      case "subagent.finished": {
        const at = subagents.get(e.body.id);
        const item = at === undefined ? undefined : items[at];
        if (item?.kind === "subagent") {
          item.done = true;
          item.ok = e.body.ok;
          item.summary = e.body.summary;
        }
        break;
      }
      case "approval.requested":
        endProse();
        approvals.set(e.body.id, items.length);
        items.push({ kind: "approval", seq: e.seq, id: e.body.id, tool: e.body.tool, input: e.body.input, risk: e.body.risk, reason: e.body.reason, rule: e.body.rule, layer: e.body.layer });
        break;
      case "approval.decided": {
        const at = approvals.get(e.body.id);
        const item = at === undefined ? undefined : items[at];
        if (item?.kind === "approval") item.decided = { allow: e.body.allow, by: e.body.by };
        break;
      }
      case "policy.decided":
        if (e.body.verdict === "deny") {
          endProse();
          items.push({ kind: "denied", seq: e.seq, tool: e.body.tool, rule: e.body.rule, layer: e.body.layer, reason: e.body.reason });
        }
        break;
      case "task.planned":
        items.push({ kind: "note", seq: e.seq, text: `Planned ${e.body.steps.length} steps${e.body.validate ? ` · checked by ${e.body.validate}` : ""}`, tone: "idle" });
        break;
      case "task.step": {
        const tone = e.body.status === "passed" ? "idle" : e.body.status === "failed" ? "bad" : e.body.status === "retrying" ? "wait" : "live";
        const verb = ({ started: "Started", passed: "Passed", retrying: "Retrying", failed: "Stopped at", skipped: "Skipped" } as const)[e.body.status];
        items.push({ kind: "note", seq: e.seq, text: `${verb} step ${e.body.index + 1}${e.body.status !== "passed" && e.body.detail ? ` — ${e.body.detail}` : ""}`, tone });
        break;
      }
      case "lesson.applied":
        lessons.push(e.body.id);
        break;
      case "usage.recorded":
        tokens += e.body.inputTokens + e.body.outputTokens;
        break;
      case "checkpoint.created":
        commit = e.body.commit ?? commit;
        items.push({ kind: "checkpoint", seq: e.seq, turn: e.body.turn, commit: e.body.commit, note: e.body.note });
        break;
      case "runtime.limited":
        endProse();
        items.push({ kind: "note", seq: e.seq, text: `${e.body.runtime} hit its usage window — paused until ${new Date(e.body.until).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}; it resumes by itself`, tone: "live" });
        break;
      case "run.routed":
        items.push({ kind: "note", seq: e.seq, text: `Moved to ${e.body.runtime}: ${e.body.reason}`, tone: "idle" });
        break;
      case "error.raised":
        endProse();
        items.push({ kind: "note", seq: e.seq, text: e.body.message, tone: "bad" });
        break;
      case "turn.completed":
        endProse();
        answered = true;
        items.push({
          kind: "finished",
          seq: e.seq,
          turn: e.body.turn ?? turn,
          durationMs: e.body.durationMs,
          route: [e.body.route.runtime, e.body.route.model, e.body.route.effort].filter(Boolean).join(" · "),
          runtime: e.body.route.runtime,
          model: e.body.route.model,
          tokens: tokens || undefined,
          commit,
          lessons: [...lessons],
          receipt: receiptOf(files, checks, failedSteps, plan ?? undefined),
        });
        break;
      case "run.status":
        if (e.body.status === "cancelled") items.push({ kind: "note", seq: e.seq, text: e.body.reason ?? "Cancelled", tone: "idle" });
        // A run that fails mid-turn never completes it: close the turn here, so what it did and what's left still show.
        if (e.body.status === "failed" && lastAsk && !answered) {
          endProse();
          answered = true;
          items.push({ kind: "finished", seq: e.seq, turn, route: "", lessons: [...lessons], tokens: tokens || undefined, commit, receipt: receiptOf(files, checks, failedSteps, plan ?? undefined, true) });
        }
        break;
      default:
        break;
    }
  }
  return items;
}
