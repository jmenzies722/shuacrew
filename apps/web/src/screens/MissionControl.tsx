import { Eyebrow, Panel, StatusGlyph, StatusPill, formatTokens, since } from "@shuacrew/ui";
import { Link, useNavigate } from "@tanstack/react-router";
import { AnimatePresence } from "motion/react";
import { useMemo } from "react";
import { AgentCard } from "../components/AgentCard";
import { policyLine, scopeRuns } from "../lib/crew";
import { useLive } from "../lib/live";
import { describe } from "../shell/CommandPalette";
import { newSession } from "../shell/Shell";

/** Home: what's running, what needs you, what just finished, what it's costing. */
export function MissionControl() {
  const crew = useLive((s) => s.crew);
  const scope = useLive((s) => s.scope);
  const openLaunch = useLive((s) => s.openLaunch);
  const scoped = useMemo(() => scopeRuns(crew.runs, scope), [crew.runs, scope]);
  const runs = useMemo(() => Object.values(scoped), [scoped]);
  const live = runs
    .filter((r) => ["running", "planning", "awaiting_approval", "paused", "queued"].includes(r.status) && !r.parent)
    .sort((a, b) => rank(a.status) - rank(b.status) || b.updatedAt - a.updatedAt);
  const finished = runs
    .filter((r) => ["done", "failed", "merged", "reviewing", "cancelled"].includes(r.status))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 8);
  const approvals = Object.values(crew.approvals)
    .filter((a) => !scope || (a.run ? Boolean(scoped[a.run]) : false))
    .sort((a, b) => b.seq - a.seq);
  const byRuntime = useMemo(() => {
    const totals = new Map<string, number>();
    for (const r of runs) totals.set(r.runtime, (totals.get(r.runtime) ?? 0) + r.usage.inputTokens + r.usage.outputTokens);
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [runs]);
  const maxRuntime = Math.max(1, ...byRuntime.map(([, n]) => n));
  const running = live.filter((r) => r.status === "running" || r.status === "planning").length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1440px] px-6 pb-10 pt-6">
        <header className="mb-5 flex items-end gap-4">
          <div>
            <Eyebrow>{new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</Eyebrow>
            <h1 className="mt-1 text-[22px] font-semibold tracking-[-0.02em]">Today</h1>
          </div>
          <div className="ml-auto flex items-center gap-6 pb-1 text-[12px] text-fg-2">
            <Stat label="running" value={running} tone={running ? "live" : "idle"} />
            <Stat label="awaiting you" value={approvals.length} tone={approvals.length ? "wait" : "idle"} />
            <Stat label="finished today" value={finished.filter((r) => isToday(r.updatedAt)).length} tone="ok" />
            <Stat label="tokens today" value={formatTokens(crew.today.tokens)} tone="idle" />
          </div>
        </header>

        <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-5 max-[1100px]:grid-cols-1">
          <section aria-label="Live agents">
            <div className="mb-2.5 flex items-center justify-between">
              <Eyebrow>Live agents</Eyebrow>
              {live.length > 0 && (
                <button onClick={() => openLaunch()} className="text-[12px] text-fg-3 hover:text-fg">
                  + launch another
                </button>
              )}
            </div>
            {live.length === 0 ? (
              <EmptyCrew />
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(330px,1fr))] gap-3">
                <AnimatePresence initial={false}>
                  {live.map((run) => (
                    <AgentCard key={run.id} run={run} />
                  ))}
                </AnimatePresence>
              </div>
            )}

            <div className="mb-2.5 mt-7 flex items-center justify-between">
              <Eyebrow>Recent completions</Eyebrow>
              <Link to="/board" className="text-[12px] text-fg-3 hover:text-fg">
                Board →
              </Link>
            </div>
            <Panel className="divide-y divide-line">
              {finished.length === 0 && <div className="px-4 py-6 text-center text-[12.5px] text-fg-3">Finished work settles here.</div>}
              {finished.map((run) => (
                <Link key={run.id} to="/sessions/$id" params={{ id: run.id }} className="flex items-center gap-3 px-4 py-2.5 hover:bg-raised">
                  <StatusPill status={run.status} />
                  <span className="min-w-0 flex-1 truncate text-[13px]">{run.title}</span>
                  <span className="mono text-[11px] text-fg-3">{run.runtime}</span>
                  <span className="mono w-14 text-right text-[11px] tabular-nums text-fg-2">{formatTokens(run.usage.inputTokens + run.usage.outputTokens)}</span>
                  <span className="w-16 text-right text-[11px] text-fg-3">{since(run.updatedAt)}</span>
                </Link>
              ))}
            </Panel>
          </section>

          <aside className="flex flex-col gap-5" aria-label="Queue, schedule and usage">
            <div>
              <Eyebrow className="mb-2.5">Approvals queue</Eyebrow>
              <Panel className="divide-y divide-line">
                {approvals.length === 0 && (
                  <div className="flex items-center gap-2 px-4 py-4 text-[12.5px] text-fg-3">
                    <StatusGlyph tone="ok" /> Nothing waiting on you.
                  </div>
                )}
                {approvals.map((a) => (
                  <Link key={a.id} to="/sessions/$id" params={{ id: a.run ?? "" }} className="block px-4 py-3 hover:bg-raised">
                    <div className="flex items-center gap-2 text-[12px]">
                      <StatusGlyph tone="wait" />
                      <span className="text-fg">{a.tool}</span>
                      <span className="ml-auto text-[11px] uppercase text-fg-3">{a.risk}</span>
                    </div>
                    <div className="mono mt-1 truncate text-[11.5px] text-fg-2">{describe(a.input)}</div>
                    <div className="mono mt-0.5 truncate text-[11px] text-fg-3">{policyLine("ask", a.rule, a.layer)}</div>
                  </Link>
                ))}
              </Panel>
            </div>

            <div>
              <Eyebrow className="mb-2.5">Today's schedule</Eyebrow>
              <Panel className="px-4 py-4 text-[12.5px] text-fg-3">
                Nothing scheduled.{" "}
                <Link to="/schedules" className="text-amber hover:underline">
                  Add a job
                </Link>{" "}
                — “weekdays 9am: triage new issues”.
              </Panel>
            </div>

            <div>
              <Eyebrow className="mb-2.5">Usage by runtime</Eyebrow>
              <Panel className="px-4 py-3.5">
                {byRuntime.length === 0 && <div className="text-[12.5px] text-fg-3">No usage yet.</div>}
                {byRuntime.map(([runtime, n]) => (
                  <div key={runtime} className="mb-2.5 last:mb-0">
                    <div className="mb-1 flex items-center justify-between text-[12px]">
                      <span className="mono text-fg-2">{runtime}</span>
                      <span className="mono tabular-nums text-fg">
                        {formatTokens(n)}
                        {crew.limited[runtime] && <span className="ml-2 text-amber">limited</span>}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-sunken">
                      <div className="h-full rounded-full bg-[color-mix(in_srgb,var(--amber)_70%,var(--text-3))]" style={{ width: `${(n / maxRuntime) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </Panel>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function rank(status: string): number {
  return { awaiting_approval: 0, running: 1, planning: 1, paused: 2, queued: 3 }[status] ?? 4;
}

function isToday(ms: number): boolean {
  return new Date(ms).toDateString() === new Date().toDateString();
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone: "live" | "wait" | "ok" | "idle" }) {
  return (
    <div className="flex items-center gap-2">
      <StatusGlyph tone={tone} size={7} />
      <span className="mono text-[15px] font-medium tabular-nums text-fg">{value}</span>
      <span>{label}</span>
    </div>
  );
}

/** An empty screen teaches: three ways to put the crew to work. */
function EmptyCrew() {
  const navigate = useNavigate();
  const starters = [
    { title: "Start a session", detail: "Say what you want done. Claude or Codex works on it on your own plan and asks before anything risky.", action: () => newSession(navigate) },
    { title: "Hand over a whole task", detail: "Turn on Task in the composer: it plans steps, checks each one, retries what fails and checkpoints as it goes.", action: () => newSession(navigate) },
    { title: "Put work on a schedule", detail: "“Weekdays 9am: triage new issues” — schedules, webhooks and heartbeats run while you're away.", action: () => navigate({ to: "/schedules" }) },
  ];
  return (
    <div className="grid grid-cols-3 gap-3 max-[1100px]:grid-cols-1">
      {starters.map((s) => (
        <button key={s.title} onClick={() => void s.action()} className="rounded-[var(--radius-l)] border border-dashed border-line-strong bg-panel p-4 text-left transition hover:border-amber">
          <div className="text-[13.5px] font-medium text-fg">{s.title}</div>
          <div className="mt-1.5 text-[12.5px] leading-relaxed text-fg-2">{s.detail}</div>
        </button>
      ))}
    </div>
  );
}
