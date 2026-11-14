import { useState } from "react";
import { Link } from "@tanstack/react-router";
import type { RunView } from "@shuacrew/core/projections";
import { api } from "../lib/api";
import "./review-pass.css";

const NAME: Record<string, string> = { claude: "Claude", codex: "Codex", mock: "Demo" };

/**
 * The review pass in a session's header (core/review.ts): ask a second agent to read the change, and see what it
 * said. While there is no review it is one quiet button; afterwards it is the verdict, linking to the reviewer's own
 * session. It only appears for a session at rest that has a branch with changes.
 */
export function ReviewPass({ run }: { run: RunView }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pass = run.reviewPass;
  const atRest = ["reviewing", "done"].includes(run.status);
  if (!run.worktree || run.labels?.includes("review")) return null;
  if (pass) {
    const who = NAME[pass.runtime] ?? pass.runtime;
    const [label, tone] = pass.state === "running" ? [`${who} is reviewing`, "live"]
      : pass.state === "passed" ? [`Review passed`, "ok"]
      : pass.state === "changes" ? [`Review asked for changes`, "wait"]
      : [`Review unclear`, "idle"];
    return <Link to="/sessions/$id" params={{ id: pass.run }} className={`review-pass is-${tone}`}
      title={pass.state === "running" ? "Open the reviewer's session" : pass.state === "changes" ? `${who}'s findings went back to this session. Open the review.` : pass.state === "unclear" ? `${who}'s reply didn't give a clear verdict, so nothing was passed on. Open it to read.` : `${who} found nothing that must be fixed. Open the review.`}>
      <i aria-hidden />{label}{pass.state !== "running" && <small>{who}</small>}
    </Link>;
  }
  if (!atRest || run.files.length === 0) return null;
  const ask = async () => {
    setBusy(true); setError("");
    try { await api(`/api/runs/${run.id}/review-pass`, { body: {} }); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <>
    <button type="button" className="review-pass is-ask" onClick={() => void ask()} disabled={busy}
      title="Another agent reads this session's diff and either passes it or lists what must be fixed. It cannot change files.">{busy ? "Starting…" : "Get a review"}</button>
    {error && <span className="review-pass-error" role="alert">{error}</span>}
  </>;
}

/**
 * A race in a session's header (core/race.ts): who this session is racing, and how it came out. It links to the
 * other side, and the reason is one hover away.
 */
export function RaceResult({ run }: { run: RunView }) {
  const race = run.race;
  if (!race) return null;
  const rival = NAME[race.rivalRuntime] ?? race.rivalRuntime;
  const [label, tone] = !race.outcome ? [`Racing ${rival}`, "live"]
    : race.outcome === "won" ? ["Won the race", "ok"]
    : race.outcome === "lost" ? ["Lost the race", "idle"]
    : ["Race: your call", "wait"];
  return <Link to="/sessions/$id" params={{ id: race.rival }} className={`review-pass is-${tone}`} title={`${race.reason ?? `${rival} is working on the same task in its own branch.`} Open ${rival}'s side.`}>
    <i aria-hidden />{label}{race.outcome && <small>vs {rival}</small>}
  </Link>;
}
