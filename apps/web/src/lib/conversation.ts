/**
 * A run's events, as a conversation a person can read.
 *
 * Pure: the run view and the timeline scrubber both call it — the scrubber just stops folding at
 * the chosen sequence number, which is all "replay" needs to be.
 */
import type { AnyEvent } from "@shuacrew/core/events";

export type Item =
  | { kind: "ask"; seq: number; turn: number; text: string; by: string; at: number }
  | { kind: "prose"; seq: number; turn: number; text: string; streaming: boolean }
  | { kind: "tool"; seq: number; id: string; tool: string; input: unknown; subagent?: string; ok?: boolean; output?: string; durationMs?: number; at: number }
  | { kind: "files"; seq: number; paths: string[] }
  | { kind: "check"; seq: number; command: string; passed: boolean; output: string }
  | { kind: "subagent"; seq: number; id: string; name: string; task: string; done: boolean; ok?: boolean; summary?: string }
  | { kind: "approval"; seq: number; id: string; tool: string; input: unknown; risk: string; reason: string; rule: string; decided?: { allow: boolean; by: string } }
  | { kind: "denied"; seq: number; tool: string; rule: string; reason: string }
  | { kind: "checkpoint"; seq: number; turn: number; commit?: string; note: string }
  | { kind: "note"; seq: number; text: string; tone: "live" | "bad" | "idle" | "wait" }
  | { kind: "finished"; seq: number; durationMs?: number; route: string };

export function conversation(events: AnyEvent[], until = Number.POSITIVE_INFINITY): Item[] {
  const items: Item[] = [];
  const tools = new Map<string, number>();
  const subagents = new Map<string, number>();
  const approvals = new Map<string, number>();
  let prose: Extract<Item, { kind: "prose" }> | null = null;

  const endProse = () => {
    if (prose) prose.streaming = false;
    prose = null;
  };

  for (const e of events) {
    if (e.seq > until) break;
    switch (e.kind) {
      case "turn.started":
        endProse();
        items.push({ kind: "ask", seq: e.seq, turn: e.body.turn, text: e.body.text, by: e.body.by, at: e.at });
        break;
      case "agent.delta":
        if (!prose || prose.turn !== e.body.turn) {
          prose = { kind: "prose", seq: e.seq, turn: e.body.turn, text: "", streaming: true };
          items.push(prose);
        }
        prose.text += e.body.text;
        break;
      case "agent.message": {
        const text = e.body.text.trim();
        const last = items[items.length - 1];
        // Runtimes often repeat their last words as the final result; show them once.
        if (e.body.final && last?.kind === "prose" && last.text.trim().endsWith(text)) {
          endProse();
          break;
        }
        endProse();
        if (text) items.push({ kind: "prose", seq: e.seq, turn: e.body.turn, text, streaming: false });
        break;
      }
      case "tool.called":
        endProse();
        tools.set(e.body.id, items.length);
        items.push({ kind: "tool", seq: e.seq, id: e.body.id, tool: e.body.tool, input: e.body.input, subagent: e.body.subagent, at: e.at });
        break;
      case "tool.returned": {
        const at = tools.get(e.body.id);
        const item = at === undefined ? undefined : items[at];
        if (item?.kind === "tool") {
          item.ok = e.body.ok;
          item.output = e.body.output;
          item.durationMs = e.body.durationMs ?? e.at - item.at;
        }
        break;
      }
      case "file.changed": {
        endProse();
        const last = items[items.length - 1];
        if (last?.kind === "files") {
          if (!last.paths.includes(e.body.path)) last.paths.push(e.body.path);
        } else items.push({ kind: "files", seq: e.seq, paths: [e.body.path] });
        break;
      }
      case "check.ran":
        endProse();
        items.push({ kind: "check", seq: e.seq, command: e.body.command, passed: e.body.exitCode === 0, output: e.body.output });
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
        items.push({ kind: "approval", seq: e.seq, id: e.body.id, tool: e.body.tool, input: e.body.input, risk: e.body.risk, reason: e.body.reason, rule: e.body.rule });
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
          items.push({ kind: "denied", seq: e.seq, tool: e.body.tool, rule: e.body.rule, reason: e.body.reason });
        }
        break;
      case "checkpoint.created":
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
        items.push({ kind: "finished", seq: e.seq, durationMs: e.body.durationMs, route: [e.body.route.runtime, e.body.route.model, e.body.route.effort].filter(Boolean).join(" · ") });
        break;
      case "run.status":
        if (e.body.status === "cancelled") items.push({ kind: "note", seq: e.seq, text: e.body.reason ?? "Cancelled", tone: "idle" });
        break;
      default:
        break;
    }
  }
  return items;
}
