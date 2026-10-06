/**
 * The two cards that make a turn legible end to end:
 *  - PlanCard: the agent's own checklist, live — what it means to do, where it is, what's left.
 *  - Receipt: what the turn actually did, and the honest verdict on it (verified, not verified, failing),
 *    with the one next move that closes the gap: Verify it, Fix it, Continue the plan, or Explain it to me.
 */
import { Check, CircleDashed, Hand, ListChecks, LoaderCircle, OctagonX, ShieldAlert, ShieldCheck, ShieldQuestion, Sparkles, StepForward } from "lucide-react";
import { useState } from "react";
import type { RunView } from "@shuacrew/core/projections";
import { followUp } from "../lib/api";
import type { Item, Receipt as ReceiptData } from "../lib/conversation";
import { explainAsk, turnRecord } from "../lib/turn-story";
import { native, post } from "../screens/spark/bridge";
import "./turn-cards.css";

/** `state`: live (the agent is on it), waiting (it needs your OK to go on), or idle (the turn is over). */
export function PlanCard({ item, state }: { item: Extract<Item, { kind: "plan" }>; state: "live" | "waiting" | "idle" }) {
  const live = state === "live";
  const done = item.steps.filter((s) => s.status === "done").length;
  const total = item.steps.length;
  if (!total) return null;
  const finished = done === total;
  return (
    <section className={`plan-card${live && !finished ? " is-live" : ""}${state === "waiting" && !finished ? " is-waiting" : ""}${finished ? " is-done" : ""}`} aria-label="The agent's plan">
      <header>
        <ListChecks size={14} aria-hidden />
        <strong>Plan</strong>
        <span className="plan-count">{finished ? "all done" : `${done} of ${total}`}{state === "waiting" && !finished ? " · waiting for your OK" : ""}</span>
        <i className="plan-bar" aria-hidden><b style={{ width: `${(done / total) * 100}%` }} /></i>
      </header>
      {item.note && <p className="plan-note">{item.note}</p>}
      <ol>
        {item.steps.map((s, i) => (
          <li key={i} data-status={s.status} aria-current={s.status === "active" ? "step" : undefined}>
            {s.status === "done" ? <Check size={13} aria-label="done" /> : s.status === "active" ? (live ? <LoaderCircle size={13} className="animate-spin" aria-label="in progress" /> : state === "waiting" ? <Hand size={13} aria-label="waiting for you" /> : <StepForward size={13} aria-label="stopped here" />) : <CircleDashed size={13} aria-label="to do" />}
            <span className={s.status === "active" && live ? "shimmer-text" : undefined}>{s.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

const VERDICT: Record<Exclude<ReceiptData["outcome"], "answered">, { Icon: typeof ShieldCheck; label: string; tone: string }> = {
  verified: { Icon: ShieldCheck, label: "Verified", tone: "ok" },
  unverified: { Icon: ShieldQuestion, label: "Not verified", tone: "wait" },
  failing: { Icon: ShieldAlert, label: "Checks failing", tone: "bad" },
  stopped: { Icon: OctagonX, label: "Stopped before finishing", tone: "bad" },
};

/** What to send so the agent closes the gap the verdict names. */
const NEXT = {
  verify: "Verify what you just changed: run this project's checks (tests, typecheck, lint, build — whichever exist), fix anything that fails, and tell me the result. Don't call it done until a check passes.",
  fix: "The last check failed. Find the real cause, fix it, and re-run the check until it passes. Tell me what was wrong.",
  continue: (left: string[]) => `Continue the plan from where you stopped: ${left.join("; ")}. Verify each step as you go, and tell me when it's all done and checked.`,
};

export function Receipt({ item, run, items, working }: { item: Extract<Item, { kind: "finished" }>; run?: RunView; items: () => Item[]; working: boolean }) {
  const r = item.receipt;
  const [sent, setSent] = useState("");
  const [open, setOpen] = useState(false);
  if (run?.labels.includes("buddy")) return null; // Shua's own chat: nothing to verify or retell
  const verdict = r.outcome === "answered" ? null : VERDICT[r.outcome];
  const left = r.plan?.left ?? [];
  if (!verdict && !left.length && !r.files.length) return <ExplainOnly item={item} run={run} items={items} />;
  const send = async (key: string, text: string) => {
    if (!run || sent) return;
    setSent(key);
    try { await followUp(run.id, text); } catch { setSent(""); }
  };
  const canAct = !!run && !working && !sent;
  return (
    <section className={`receipt${verdict ? ` is-${verdict.tone}` : ""}`} aria-label="What this turn did">
      <div className="receipt-row">
        {verdict && (
          <span className="receipt-verdict" title={r.checks.last ? `Last check: ${r.checks.last.command}` : "No check ran after the change"}>
            <verdict.Icon size={14} aria-hidden />
            {verdict.label}
            {r.checks.last && <code>{r.checks.last.command}</code>}
          </span>
        )}
        {r.files.length > 0 && (
          <button type="button" className="receipt-files" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {r.files.length} file{r.files.length === 1 ? "" : "s"} changed
          </button>
        )}
        {r.plan && <span className="receipt-plan">{r.plan.done}/{r.plan.total} planned steps done</span>}
        <span className="receipt-actions">
          {r.outcome === "unverified" && <button type="button" disabled={!canAct} onClick={() => void send("verify", NEXT.verify)}>{sent === "verify" ? "Sent" : "Verify it"}</button>}
          {r.outcome === "failing" && <button type="button" disabled={!canAct} onClick={() => void send("fix", NEXT.fix)}>{sent === "fix" ? "Sent" : "Fix it"}</button>}
          {left.length > 0 && r.outcome !== "failing" && <button type="button" className="is-primary" disabled={!canAct} onClick={() => void send("continue", NEXT.continue(left))}>{sent === "continue" ? "Sent" : `Continue · ${left.length} left`}</button>}
          <Explain item={item} run={run} items={items} />
        </span>
      </div>
      {open && <ul className="receipt-paths">{r.files.map((f) => <li key={f} title={f}>{f.split("/").slice(-3).join("/")}</li>)}</ul>}
      {left.length > 0 && <p className="receipt-left">Left: {left.join(" · ")}</p>}
    </section>
  );
}

/** A plain answer still gets a way to understand it — quietly, on hover. */
function ExplainOnly({ item, run, items }: { item: Extract<Item, { kind: "finished" }>; run?: RunView; items: () => Item[] }) {
  return <div className="receipt-quiet"><Explain item={item} run={run} items={items} /></div>;
}

/** Shua teaches the turn back to you: the problem, each step and why, how we know it works, the idea behind it. */
function Explain({ item, run, items }: { item: Extract<Item, { kind: "finished" }>; run?: RunView; items: () => Item[] }) {
  const [asked, setAsked] = useState(false);
  const inApp = !!native();
  return (
    <button
      type="button"
      className="receipt-explain"
      disabled={!inApp || asked}
      title={inApp ? "Shua walks you through what happened and why" : "Explain works in the ShuaCrew Mac app"}
      onClick={() => {
        post({ type: "shuaAsk", text: explainAsk(run?.title ?? "this session", turnRecord(items(), item)) });
        setAsked(true);
      }}
    >
      <Sparkles size={12} aria-hidden />
      {asked ? "Shua is explaining" : "Explain"}
    </button>
  );
}
