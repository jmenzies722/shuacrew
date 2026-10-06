/**
 * A finished turn, retold as a short record Shua can teach from: what you asked, the plan, each step,
 * what proved it works (or that nothing did), and the reply. Pure, so it's tested without a session.
 */
import type { Item, Receipt } from "./conversation";

/** The command as you'd type it: Codex wraps each one as `/bin/zsh -lc '…'`. */
export function shellCommand(cmd: string): string {
  const m = /^\s*(?:\/bin\/|\/usr\/bin\/)?(?:zsh|bash|sh)\s+-l?c\s+(['"])([\s\S]*)\1\s*$/.exec(cmd);
  return (m ? m[2]! : cmd).replace(/\s+/g, " ").trim();
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const base = (p: string) => p.split("/").slice(-2).join("/");

function stepLine(item: Item): string | null {
  switch (item.kind) {
    case "tool": {
      const input = (item.input ?? {}) as Record<string, unknown>;
      const target = typeof input.command === "string" ? `\`${clip(shellCommand(input.command), 80)}\`` : typeof input.file_path === "string" ? base(input.file_path) : typeof input.pattern === "string" ? `"${clip(input.pattern, 40)}"` : typeof input.query === "string" ? `"${clip(input.query, 60)}"` : typeof input.url === "string" ? input.url : "";
      return `${item.tool}${target ? ` ${target}` : ""}${item.ok === false ? " (failed)" : ""}`;
    }
    case "check":
      return `Check \`${shellCommand(item.command)}\` ${item.passed ? "passed" : "failed"}`;
    case "subagent":
      return `Delegated to ${item.name}: ${clip(item.task, 80)}${item.summary ? ` → ${clip(item.summary, 100)}` : ""}`;
    case "denied":
      return `Blocked by policy: ${item.tool} (${item.reason})`;
    case "approval":
      return `Asked you before ${item.tool}${item.decided ? (item.decided.allow ? " (you allowed it)" : " (you said no)") : ""}`;
    default:
      return null;
  }
}

const VERDICT: Record<Receipt["outcome"], string> = {
  verified: "Verified: the last check passed after the change.",
  unverified: "Not verified: files changed but nothing ran a check on them.",
  failing: "Failing: the last check failed.",
  answered: "No files changed: this turn was an answer, not a change.",
  stopped: "Stopped: the run failed before it finished the turn.",
};

/** The record of the turn that `finished` closes, from the items around it. */
export function turnRecord(items: Item[], finished: Extract<Item, { kind: "finished" }>): string {
  const end = items.indexOf(finished);
  let start = end;
  while (start > 0 && items[start - 1]!.kind !== "ask") start--;
  const ask = items[start - 1];
  const turn = items.slice(start, end);
  const plan = turn.findLast((i): i is Extract<Item, { kind: "plan" }> => i.kind === "plan");
  const steps = turn.map(stepLine).filter((s): s is string => !!s);
  const reply = turn.findLast((i): i is Extract<Item, { kind: "prose" }> => i.kind === "prose");
  const r = finished.receipt;
  return [
    ask?.kind === "ask" ? `I asked: ${clip(ask.text, 400)}` : null,
    plan ? `Its plan: ${plan.steps.map((s) => `${s.status === "done" ? "[x]" : "[ ]"} ${s.text}`).join("; ")}` : null,
    steps.length ? `What it did, in order:\n${steps.slice(0, 25).map((s, i) => `${i + 1}. ${s}`).join("\n")}${steps.length > 25 ? `\n…and ${steps.length - 25} more steps` : ""}` : null,
    r.files.length ? `Files changed: ${r.files.slice(0, 12).map(base).join(", ")}${r.files.length > 12 ? ` and ${r.files.length - 12} more` : ""}` : null,
    VERDICT[r.outcome],
    r.plan?.left.length ? `Left undone: ${r.plan.left.join("; ")}` : null,
    reply ? `Its reply: ${clip(reply.text, 700)}` : null,
  ].filter(Boolean).join("\n");
}

/** What Shua is asked when you tap Explain: teach it, don't just summarise it. */
export function explainAsk(title: string, record: string): string {
  return [
    `Teach me what my crew just did in the session "${title}", so I understand it and could do it myself next time.`,
    "In plain words and briefly: what the problem really was, what it did step by step and why each step, how we know it works (or that we don't yet), and the one engineering idea worth learning from it. If something was skipped or risky, say so.",
    "Here is the record:",
    record,
  ].join("\n\n");
}
