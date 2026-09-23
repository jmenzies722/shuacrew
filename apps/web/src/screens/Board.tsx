import { COLUMNS, type RunView } from "@shuacrew/core/projections";
import { Eyebrow, StatusGlyph, toneOf } from "@shuacrew/ui";
import { LayoutGroup } from "motion/react";
import { useMemo, useState } from "react";
import { AgentCard } from "../components/AgentCard";
import { api } from "../lib/api";
import { useLive } from "../lib/live";

/** Every run by where it stands. Cards glide between columns as their status changes. */
export function Board() {
  const runs = useLive((s) => s.crew.runs);
  const [runtime, setRuntime] = useState("all");
  const all = useMemo(() => Object.values(runs).filter((r) => !r.parent), [runs]);
  const runtimes = useMemo(() => [...new Set(all.map((r) => r.runtime))], [all]);
  const shown = all.filter((r) => runtime === "all" || r.runtime === runtime);
  const [dragging, setDragging] = useState<string | null>(null);

  const reprioritise = async (id: string, above?: RunView) => {
    const priority = above ? above.priority + 1 : 0;
    await api(`/api/runs/${id}/priority`, { body: { priority } });
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-4 border-b border-line px-6 py-4">
        <h1 className="text-[18px] font-semibold tracking-[-0.015em]">Board</h1>
        <div className="ml-auto flex items-center gap-1.5 text-[12px]" role="radiogroup" aria-label="Filter by runtime">
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
      </header>
      <LayoutGroup>
        <div className="grid min-h-0 flex-1 grid-cols-5 gap-3 overflow-x-auto p-4 max-[1200px]:grid-cols-[repeat(5,300px)]">
          {COLUMNS.map((column) => {
            const cards = shown
              .filter((r) => column.statuses.includes(r.status))
              .sort((a, b) => (column.id === "queued" ? b.priority - a.priority || a.createdAt - b.createdAt : b.updatedAt - a.updatedAt));
            return (
              <section
                key={column.id}
                className="flex min-h-0 flex-col rounded-[var(--radius-l)] bg-panel/60"
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
                  {cards.length === 0 && <div className="rounded-[var(--radius-m)] border border-dashed border-line px-3 py-6 text-center text-[12px] text-fg-3">Empty</div>}
                  {cards.map((run) => (
                    <div
                      key={run.id}
                      draggable={column.id === "queued"}
                      onDragStart={() => setDragging(run.id)}
                      title={column.id === "queued" ? "Drag to the top to run it next" : undefined}
                    >
                      <AgentCard run={run} compact />
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
