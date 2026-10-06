import { COLUMNS, type RunView } from "@shuacrew/core/projections";
import { Button, Eyebrow, StatusGlyph, toneOf } from "@shuacrew/ui";
import { LayoutGroup } from "motion/react";
import { useMemo, useState } from "react";
import { AgentCard } from "../components/AgentCard";
import { api } from "../lib/api";
import { isTopLevelWork, scopeRuns } from "../lib/crew";
import { useLive } from "../lib/live";
import { PaneHeader } from "../components/Pane";
import "./board.css";
import { useNavigate } from "@tanstack/react-router";
import { KanbanSquare } from "lucide-react";
import { StatStrip } from "../components/StatStrip";
import { BacklogAdd, StartBacklog } from "../components/BacklogAdd";
import "./board-backlog.css";

const EMPTY: Record<string, string> = { queued: "Nothing waiting to start", running: "No one is working", awaiting: "Nothing needs you", reviewing: "Nothing to review", done: "Nothing finished yet" };

/** Every run by where it stands. Cards glide between columns as their status changes. */
export function Board() {
  const crewRuns = useLive((s) => s.crew.runs);
  const scope = useLive((s) => s.scope);
  const runs = useMemo(() => scopeRuns(crewRuns, scope), [crewRuns, scope]);
  const [runtime, setRuntime] = useState("all");
  const all = useMemo(() => Object.values(runs).filter((r) => isTopLevelWork(r, crewRuns)), [runs, crewRuns]);
  const runtimes = useMemo(() => [...new Set(all.map((r) => r.runtime))], [all]);
  const shown = all.filter((r) => runtime === "all" || r.runtime === runtime);
  const [dragging, setDragging] = useState<string | null>(null);
  const navigate = useNavigate();

  const reprioritise = async (id: string, above?: RunView) => {
    const priority = above ? above.priority + 1 : 0;
    await api(`/api/runs/${id}/priority`, { body: { priority } });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto w-full max-w-[1440px] px-8 pt-8">
        <PaneHeader {...(() => { const need = all.filter((r) => r.status === "awaiting_approval").length, fly = all.filter((r) => ["running", "planning"].includes(r.status)).length; return need ? { status: `${need} session${need === 1 ? " is" : "s are"} waiting on you`, tone: "wait" as const } : fly ? { status: `${fly} in flight right now`, tone: "live" as const } : { status: "Nothing in flight. New sessions land in Queued and move on their own.", tone: "idle" as const }; })()} eyebrow="Plan" icon={KanbanSquare} title="Board"
          actions={runtimes.length > 1 ? <>
        <div className="flex items-center gap-1.5 text-[12px]" role="radiogroup" aria-label="Filter by runtime">
          {["all", ...runtimes].map((r) => (
            <button
              key={r}
              role="radio"
              aria-checked={runtime === r}
              onClick={() => setRuntime(r)}
              className={`mono rounded-[var(--radius-s)] border px-2 py-1 ${runtime === r ? "border-amber text-amber" : "border-line-strong text-fg-2"}`}
            >
              {r}
            </button>
          ))}
        </div>
          </> : undefined} />
      </div>
      <LayoutGroup>
        <div className="mx-auto grid min-h-0 w-full max-w-[1440px] flex-1 grid-cols-5 gap-3 overflow-x-auto px-8 pb-8 max-[1200px]:grid-cols-[repeat(5,300px)]">
          {COLUMNS.map((column) => {
            const cards = shown
              .filter((r) => column.statuses.includes(r.status))
              .sort((a, b) => (column.id === "queued" ? b.priority - a.priority || a.createdAt - b.createdAt : b.updatedAt - a.updatedAt));
            return (
              <section
                key={column.id}
                className={`board-col is-${column.id}`}
                aria-label={column.title}
                onDragOver={(e) => column.id === "queued" && e.preventDefault()}
                onDrop={() => {
                  if (dragging && column.id === "queued") void reprioritise(dragging, cards[0]);
                  setDragging(null);
                }}
              >
                <div className="flex items-center gap-2 px-3 pb-2 pt-3">
                  <StatusGlyph tone={toneOf(column.statuses[0] ?? "queued")} size={7} />
                  <Eyebrow>{column.title}</Eyebrow>
                  <span className="mono ml-auto text-[11px] text-fg-3">{cards.length}</span>
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-3">
                  {column.id === "queued" && <BacklogAdd />}
                  {cards.length === 0 && (column.id === "queued" && all.length === 0
                    ? <div className="board-start"><strong>Start the board</strong><span>Every session you start lands here and moves right on its own: Running → Awaiting me → Reviewing → Done.</span><Button variant="primary" onClick={() => void navigate({ to: "/" })}>Start a session</Button></div>
                    : <div className="board-empty">{EMPTY[column.id] ?? "Nothing here"}</div>)}
                  {cards.map((run) => (
                    <div
                      key={run.id}
                      draggable={column.id === "queued"}
                      onDragStart={() => setDragging(run.id)}
                      title={column.id === "queued" ? "Drag to the top to run it next" : undefined}
                    >
                      <AgentCard run={run} compact />
                      {run.status === "paused" && run.labels?.includes("backlog") && run.statusReason?.startsWith("In your backlog") && <div className="bl-row"><StartBacklog id={run.id} /></div>}
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </LayoutGroup>
    </div>
  );
}
