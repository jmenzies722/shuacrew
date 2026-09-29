import type { RoomView } from "@shuacrew/core/rooms";
import { useLive } from "../lib/live";
import { roomResults } from "../lib/room-view";
import { SourceLink } from "./Pane";

export function RoomResults({ room }: { room: RoomView }) {
  const runs = useLive(s => s.crew.runs), members = useLive(s => s.crew.members);
  const results = roomResults(room, runs);
  return <section className="room-results" aria-label="Recorded crew results"><h2>Results with a source</h2><p className="room-note">Recorded output, not a guarantee of correctness. Files remain in their original run.</p>
    {!results.length && <p className="room-empty">No results recorded yet. Your crew’s responses will appear here with their source and checks.</p>}
    {results.map(result => <article className="room-result" key={result.id}><header><strong>{members[result.author]?.name ?? result.author}</strong><span className="room-pill">{result.status === "partial" ? "Partial output" : result.status === "unavailable" ? "Source unavailable" : result.status === "completed" ? "Run completed" : "In progress"}</span><time dateTime={new Date(result.at).toISOString()}>{new Date(result.at).toLocaleString()}</time></header>
      {result.task && <h3>{result.task}</h3>}<p className="room-result-text">{result.text}</p>
      <details><summary>{result.verification === "unavailable" ? "Check history unavailable" : result.verification === "not-recorded" ? "No verification recorded" : `${result.checks.length} recorded check${result.checks.length === 1 ? "" : "s"}`}</summary>{result.checks.map((check, index) => <div key={index}><code>{check.command}</code><span> · {check.passed ? "Passed" : "Failed"}</span></div>)}</details>
      {runs[result.runId] ? <SourceLink to={`/sessions/${result.runId}`} label="Inspect source and artifacts" /> : <span className="room-note">Run is archived or unavailable in this view.</span>}
    </article>)}
  </section>;
}
