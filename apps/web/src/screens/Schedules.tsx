import { Routines } from "../components/Routines";
import "../screens/today.css";
import { Button, Chip, Eyebrow, Panel, StatusGlyph, since } from "@shuacrew/ui";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { CalendarClock } from "lucide-react";
import { PaneHeader } from "../components/Pane";
import { StatStrip } from "../components/StatStrip";
import { AutopilotWeek } from "../components/AutopilotWeek";
import "./autopilot-week.css";

interface Schedule {
  id: string;
  name: string;
  cron: string;
  timezone?: string;
  ask?: string;
  script?: string;
  paused: boolean;
  lastFired?: number;
  lastOk?: boolean;
  lastRun?: string;
  next: number[];
}
interface Hook {
  id: string;
  name: string;
  ask: string;
  received: number;
  lastAt?: number;
}
interface Beat {
  id: string;
  name: string;
  command: string;
  everyMinutes: number;
  threshold: number;
  ask?: string;
  ok?: boolean;
  streak: number;
  detail?: string;
  checkedAt?: number;
}

const fmt = (ms: number) => new Date(ms).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Work that runs while you don't — each kind written the way you'd say it. */
export function Schedules() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [beats, setBeats] = useState<Beat[]>([]);
  const refresh = async () => {
    const [s, h, b] = await Promise.all([api<Schedule[]>("/api/schedules"), api<Hook[]>("/api/webhooks"), api<Beat[]>("/api/heartbeats")]);
    setSchedules(s);
    setHooks(h);
    setBeats(b);
  };
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 15_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1440px] px-8 pb-12 pt-8">
        <PaneHeader {...(() => { const active = schedules.filter((x) => !x.paused).length; return active ? { status: `${active} schedule${active === 1 ? "" : "s"} running on their own${beats.length ? ` · ${beats.length} heartbeat${beats.length === 1 ? "" : "s"}` : ""}`, tone: "ok" as const } : { status: "Nothing scheduled. Work here keeps going while you're away.", tone: "idle" as const }; })()} actions={<div className="sched-links"><Link to="/settings" hash="quiet">Quiet hours →</Link><Link to="/settings" hash="schedule">Scheduled modes →</Link></div>} eyebrow="Brain" icon={CalendarClock} title="Schedules & Triggers" />
        <AutopilotWeek schedules={schedules} />
        <Routines onChange={() => void refresh()} />

        <NewSchedule onSaved={refresh} />

        <Eyebrow className="mb-2.5 mt-7">Schedules</Eyebrow>
        <Panel className="divide-y divide-line">
          {schedules.length === 0 && <div className="px-4 py-5 text-[12.5px] text-fg-3">No schedules yet — add one above.</div>}
          {schedules.map((s) => (
            <div key={s.id} className="flex items-start gap-4 px-4 py-3 max-[640px]:flex-wrap">
              <StatusGlyph tone={s.paused ? "idle" : s.lastOk === false ? "bad" : "ok"} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[13.5px] font-medium">
                  {s.name}
                  {s.script && <Chip mono>script · no model</Chip>}
                  {s.paused && <Chip>paused</Chip>}
                </div>
                <div className="mono mt-0.5 text-[11.5px] text-fg-3">
                  {s.cron}
                  {s.timezone ? ` · ${s.timezone}` : ""}
                  {s.lastFired ? ` · last ${since(s.lastFired)}` : " · never run"}
                  {s.lastRun && (
                    <>
                      {" · "}
                      <Link to="/sessions/$id" params={{ id: s.lastRun }} className="text-amber hover:underline">
                        last run
                      </Link>
                    </>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {s.next.slice(0, 3).map((n) => (
                    <Chip key={n} mono>
                      {fmt(n)}
                    </Chip>
                  ))}
                </div>
              </div>
              <div className="flex gap-1.5 max-[640px]:w-full max-[640px]:pl-7">
                <Button size="s" onClick={async () => (await api(`/api/schedules/${s.id}/run`, { body: {} }), refresh())}>
                  Run now
                </Button>
                <Button size="s" variant="ghost" onClick={async () => (await api("/api/schedules", { body: { id: s.id, name: s.name, when: s.cron + (s.timezone ? ` ${s.timezone}` : ""), ask: s.ask, script: s.script, paused: !s.paused } }), refresh())}>
                  {s.paused ? "Resume" : "Pause"}
                </Button>
                <Button size="s" variant="danger" onClick={async () => (await api(`/api/schedules/${s.id}`, { method: "DELETE" }), refresh())}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </Panel>

        <div className="mt-7 grid grid-cols-2 gap-5 max-[900px]:grid-cols-1">
          <Webhooks hooks={hooks} onChange={refresh} />
          <Heartbeats beats={beats} onChange={refresh} />
        </div>
      </div>
    </div>
  );
}

function NewSchedule({ onSaved }: { onSaved: () => void }) {
  const [when, setWhen] = useState("weekdays 9am ET");
  const [ask, setAsk] = useState("");
  const [script, setScript] = useState("");
  const [scriptMode, setScriptMode] = useState(false);
  const [preview, setPreview] = useState<{ words?: string; cron?: string; timezone?: string; next?: number[]; error?: string }>({});

  useEffect(() => {
    const t = setTimeout(() => {
      api<{ words: string; cron: string; timezone?: string; next: number[] }>(`/api/schedules/preview?when=${encodeURIComponent(when)}`)
        .then((p) => setPreview(p))
        .catch((e: Error) => setPreview({ error: e.message }));
    }, 150);
    return () => clearTimeout(t);
  }, [when]);

  const save = async () => {
    try {
      await api("/api/schedules", { body: { when, ask: ask || undefined, script: scriptMode ? script : undefined } });
      setAsk("");
      setScript("");
      onSaved();
    } catch (e) {
      setPreview({ error: (e as Error).message });
    }
  };

  return (
    <Panel className="mt-6 p-5">
      <Eyebrow className="mb-3">New schedule</Eyebrow>
      <div className="grid grid-cols-[1fr_1fr] gap-4 max-[900px]:grid-cols-1">
        <div>
          <label className="text-[12px] text-fg-3" htmlFor="when">
            When
          </label>
          <input
            id="when"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="mono mt-1 h-9 w-full rounded-[var(--radius-m)] border border-line-strong bg-raised px-3 text-[13px] outline-none focus:border-amber"
          />
          <div className="mt-2 text-[12px]" aria-live="polite">
            {preview.error ? (
              <span className="text-bad">{preview.error}</span>
            ) : (
              <>
                <div className="text-fg-2">
                  {preview.words} <span className="mono text-fg-3">({preview.cron})</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {preview.next?.map((n) => (
                    <Chip key={n} mono>
                      {fmt(n)}
                    </Chip>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2 text-[12px] text-fg-3">
            What
            <button onClick={() => setScriptMode((v) => !v)} className={`ml-auto rounded-[var(--radius-s)] border px-1.5 py-0.5 ${scriptMode ? "border-amber text-amber" : "border-line-strong"}`} aria-pressed={scriptMode}>
              script first (no model call)
            </button>
          </div>
          {scriptMode && (
            <input
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="pnpm outdated --json | jq -e 'length == 0' || (echo ESCALATE: deps are stale; exit 2)"
              className="mono mt-1 h-9 w-full rounded-[var(--radius-m)] border border-line-strong bg-raised px-3 text-[12px] outline-none focus:border-amber"
              aria-label="Script"
            />
          )}
          <textarea
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            rows={scriptMode ? 2 : 3}
            placeholder={scriptMode ? "…and only if it escalates (exit 2), ask an agent to:" : "Triage new issues and draft replies"}
            className="mt-1 w-full resize-none rounded-[var(--radius-m)] border border-line-strong bg-raised px-3 py-2 text-[13px] outline-none focus:border-amber"
            aria-label="Ask"
          />
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <Button variant="primary" onClick={() => void save()} disabled={!!preview.error || (!ask.trim() && !script.trim())}>
          Save schedule
        </Button>
      </div>
    </Panel>
  );
}

function Webhooks({ hooks, onChange }: { hooks: Hook[]; onChange: () => void }) {
  const [name, setName] = useState("");
  const [ask, setAsk] = useState("");
  const [created, setCreated] = useState<{ id: string; secret: string } | null>(null);
  return (
    <div>
      <Eyebrow className="mb-2.5">Webhooks</Eyebrow>
      <Panel className="p-4">
        <div className="flex flex-col gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name — e.g. CI failed" className="h-8.5 rounded-[var(--radius-m)] border border-line-strong bg-raised px-3 text-[13px] outline-none focus:border-amber" />
          <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="What should the agent do with it?" className="h-8.5 rounded-[var(--radius-m)] border border-line-strong bg-raised px-3 text-[13px] outline-none focus:border-amber" />
          <Button
            onClick={async () => {
              setCreated(await api<{ id: string; secret: string }>("/api/webhooks", { body: { name, ask } }));
              setName("");
              setAsk("");
              onChange();
            }}
            disabled={!name.trim() || !ask.trim()}
          >
            Create webhook
          </Button>
        </div>
        {created && (
          <div className="mt-3 rounded-[var(--radius-m)] border border-amber/40 bg-[var(--amber-soft)] p-3 text-[12px]">
            <div className="font-medium text-amber">Copy the secret now — it won't be shown again.</div>
            <pre className="mono mt-2 whitespace-pre-wrap break-all text-[11px] text-fg">{`secret: ${created.secret}

ts=$(date +%s); body='{"status":"failed"}'
sig="sha256=$(printf '%s.%s' "$ts" "$body" | openssl dgst -sha256 -hmac '${created.secret}' | awk '{print $2}')"
curl -X POST ${location.origin}/hooks/${created.id} -H 'Content-Type: application/json' \\
  -H "X-ShuaCrew-Timestamp: $ts" -H "X-ShuaCrew-Signature: $sig" -d "$body"`}</pre>
          </div>
        )}
        <div className="mt-3 divide-y divide-line">
          {hooks.map((h) => (
            <div key={h.id} className="flex items-center gap-2 py-2 text-[12.5px]">
              <StatusGlyph tone="ok" size={7} />
              <span className="font-medium">{h.name}</span>
              <span className="mono text-[11px] text-fg-3">/hooks/{h.id}</span>
              <span className="ml-auto text-[11px] text-fg-3">{h.received} received</span>
              <button className="text-[11px] text-bad" onClick={async () => (await api(`/api/webhooks/${h.id}`, { method: "DELETE" }), onChange())}>
                remove
              </button>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Heartbeats({ beats, onChange }: { beats: Beat[]; onChange: () => void }) {
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [every, setEvery] = useState(5);
  const [ask, setAsk] = useState("");
  return (
    <div>
      <Eyebrow className="mb-2.5">Heartbeats</Eyebrow>
      <Panel className="p-4">
        <div className="flex flex-col gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name — e.g. Staging API up" className="h-8.5 rounded-[var(--radius-m)] border border-line-strong bg-raised px-3 text-[13px] outline-none focus:border-amber" />
          <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="curl -fsS https://staging.example.com/health" className="mono h-8.5 rounded-[var(--radius-m)] border border-line-strong bg-raised px-3 text-[12px] outline-none focus:border-amber" />
          <div className="flex items-center gap-2 text-[12px] text-fg-3">
            every
            <input type="number" min={1} value={every} onChange={(e) => setEvery(Number(e.target.value))} className="mono h-8 w-16 rounded-[var(--radius-m)] border border-line-strong bg-raised px-2 text-[12px]" aria-label="Minutes" />
            min · after 2 failures in a row:
          </div>
          <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="ask an agent to… (optional)" className="h-8.5 rounded-[var(--radius-m)] border border-line-strong bg-raised px-3 text-[13px] outline-none focus:border-amber" />
          <Button
            onClick={async () => {
              await api("/api/heartbeats", { body: { name, command, everyMinutes: every, ask: ask || undefined } });
              setName("");
              setCommand("");
              setAsk("");
              onChange();
            }}
            disabled={!name.trim() || !command.trim()}
          >
            Add heartbeat
          </Button>
        </div>
        <div className="mt-3 divide-y divide-line">
          {beats.map((b) => (
            <div key={b.id} className="flex items-center gap-2 py-2 text-[12.5px]">
              <StatusGlyph tone={b.ok === undefined ? "idle" : b.ok ? "ok" : "bad"} size={7} />
              <span className="font-medium">{b.name}</span>
              <span className="mono truncate text-[11px] text-fg-3">every {b.everyMinutes}m</span>
              {b.streak > 0 && <span className="text-[11px] text-bad">{b.streak}× failing</span>}
              <button className="ml-auto text-[11px] text-fg-2 hover:text-fg" onClick={async () => (await api(`/api/heartbeats/${b.id}/check`, { body: {} }), onChange())}>
                check now
              </button>
              <button className="text-[11px] text-bad" onClick={async () => (await api(`/api/heartbeats/${b.id}`, { method: "DELETE" }), onChange())}>
                remove
              </button>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
