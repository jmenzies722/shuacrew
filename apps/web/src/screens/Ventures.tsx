import type { PlayView, RunView, VentureStage, VentureView } from "@shuacrew/core/projections";
import { Button, StatusGlyph, toneOf } from "@shuacrew/ui";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowUp, Check, CreditCard, Globe, KeyRound, Pencil, Play, Plus, RefreshCw, Rocket, ShieldCheck, Target, Trash2, TrendingUp, Unplug, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useLive } from "../lib/live";
import { KIND } from "./Library";

const STAGES: Array<{ id: VentureStage; label: string; hint: string }> = [
  { id: "idea", label: "Idea", hint: "Worth testing?" },
  { id: "validating", label: "Validating", hint: "Do people want it?" },
  { id: "building", label: "Building", hint: "The smallest real thing" },
  { id: "launching", label: "Launching", hint: "First 100 customers" },
  { id: "earning", label: "Earning", hint: "Grow what works" },
];
const NEXT: Partial<Record<VentureStage, { playbook: string; label: string; why: string }>> = {
  idea: { playbook: "validate-idea", label: "Validate the idea", why: "Find out if people want it and will pay — before you build anything." },
  validating: { playbook: "landing-page", label: "Build a landing page", why: "Put the promise in front of real people and collect sign-ups." },
  building: { playbook: "mvp", label: "Spec and build the MVP", why: "Build the smallest version that delivers the promise." },
  launching: { playbook: "launch", label: "Plan the launch", why: "Reach the first 100 customers and take payment." },
  earning: { playbook: "growth-review", label: "Weekly growth review", why: "Read the numbers and run the next three experiments." },
};

const money = (n: number | undefined, currency = "usd") => {
  if (n === undefined) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: n >= 1000 ? 0 : n % 1 ? 2 : 0 }).format(n);
  } catch {
    return `${n}`;
  }
};
const stageIndex = (s: VentureStage) => STAGES.findIndex((x) => x.id === s);

/** Every startup you're working on, where each one is, and what it earns. */
export function Ventures() {
  const ventures = useLive((s) => s.crew.ventures);
  const [editing, setEditing] = useState<Partial<VentureView> | null>(null);
  const list = useMemo(() => Object.values(ventures).sort((a, b) => b.updatedAt - a.updatedAt), [ventures]);
  const mrr = list.reduce((sum, v) => sum + (v.metrics?.mrr ?? 0), 0);
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1180px] px-6 py-6">
        <header className="mb-6 flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-[24px] font-semibold tracking-[-0.02em]">Ventures</h1>
            <p className="mt-1 max-w-[640px] text-[13.5px] leading-relaxed text-fg-2">Each startup you're building — from idea to revenue. The crew works on it with its full context, and you see where it stands and what it earns.</p>
          </div>
          {list.length > 1 && mrr > 0 && (
            <div className="vn-total">
              <span>Total MRR</span>
              <strong>{money(mrr, list.find((v) => v.metrics)?.metrics?.currency)}</strong>
            </div>
          )}
          <Button variant={list.length ? "quiet" : "primary"} onClick={() => setEditing({})}>
            <Plus size={14} /> New venture
          </Button>
        </header>
        {list.length === 0 ? (
          <div className="crew-cta flex flex-col items-center py-14 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--amber-soft)] text-amber">
              <Rocket size={24} />
            </span>
            <div className="mt-4 text-[18px] font-semibold">Start your first venture</div>
            <p className="mt-2 max-w-[520px] text-[13.5px] leading-relaxed text-fg-3">
              Name the idea and say who it's for. The crew validates it, builds the page and the product, plans the launch, and — once you connect a read-only Stripe key — tracks what it earns.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2 text-[12px] text-fg-2">
              {STAGES.map((s, i) => (
                <span key={s.id} className="flex items-center gap-2">
                  {i > 0 && <span className="text-fg-3">→</span>}
                  <span className="vn-stage-chip">{s.label}</span>
                </span>
              ))}
            </div>
            <Button variant="primary" className="mt-6" onClick={() => setEditing({})}>
              <Plus size={14} /> New venture
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-4">
            {list.map((v) => (
              <VentureCard key={v.id} venture={v} />
            ))}
          </div>
        )}
      </div>
      {editing && <VentureEditor venture={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function VentureCard({ venture: v }: { venture: VentureView }) {
  const plays = useLive((s) => s.crew.plays);
  const runs = useLive((s) => s.crew.runs);
  const active = Object.values(plays).filter((p) => p.venture === v.id && (p.status === "running" || p.status === "waiting"));
  const working = Object.values(runs).filter((r) => r.venture === v.id && ["running", "planning", "awaiting_approval"].includes(r.status)).length;
  const waiting = active.filter((p) => p.status === "waiting").length;
  const i = stageIndex(v.stage);
  return (
    <Link to="/ventures/$id" params={{ id: v.id }} className="vn-card" style={{ "--venture": v.color } as React.CSSProperties}>
      <div className="flex items-start gap-3">
        <span className="vn-emoji">{v.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-semibold text-fg">{v.name}</div>
          <div className="line-clamp-2 text-[12.5px] leading-snug text-fg-3">{v.pitch || "No pitch yet"}</div>
        </div>
      </div>
      <div className="vn-rail" aria-label={`Stage: ${v.stage}`}>
        {STAGES.map((s, j) => (
          <span key={s.id} className={`vn-rail-seg ${j < i ? "is-past" : j === i ? "is-now" : ""}`} title={s.label} />
        ))}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11.5px]">
        <span className="font-medium text-fg-2">{v.stage === "paused" || v.stage === "stopped" ? v.stage[0]!.toUpperCase() + v.stage.slice(1) : STAGES[i]?.label}</span>
        {v.goal && <span className="truncate text-fg-3">Goal: {v.goal}</span>}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Metric label="MRR" value={money(v.metrics?.mrr, v.metrics?.currency)} />
        <Metric label="30 days" value={money(v.metrics?.revenue30d, v.metrics?.currency)} />
        <Metric label="Customers" value={v.metrics?.customers !== undefined ? String(v.metrics.customers) : "—"} />
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11.5px] text-fg-3">
        {waiting > 0 ? <span className="text-amber">● {waiting} waiting for your review</span> : working > 0 ? <span className="shimmer-text">{working} session{working === 1 ? "" : "s"} working</span> : <span>Quiet</span>}
        <span className="ml-auto">{v.stripe?.connected ? `Stripe · ${v.stripe.mode}` : v.metrics ? "Manual numbers" : "No revenue source"}</span>
      </div>
    </Link>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="vn-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <em>{sub}</em>}
    </div>
  );
}

// ── one venture ──────────────────────────────────────────────────────────────────────────

export function VenturePage() {
  const { id } = useParams({ from: "/ventures/$id" });
  const navigate = useNavigate();
  const v = useLive((s) => s.crew.ventures[id]);
  const plays = useLive((s) => s.crew.plays);
  const runs = useLive((s) => s.crew.runs);
  const artifacts = useLive((s) => s.crew.artifacts);
  const [editing, setEditing] = useState(false);
  const [revenue, setRevenue] = useState(false);
  if (!v) return <div className="p-10 text-center text-[13px] text-fg-3">No such venture.</div>;

  const mine = Object.values(plays).filter((p) => p.venture === id).sort((a, b) => b.updatedAt - a.updatedAt);
  const sessions = Object.values(runs).filter((r) => r.venture === id && !r.parent).sort((a, b) => b.updatedAt - a.updatedAt);
  const sessionIds = new Set(Object.values(runs).filter((r) => r.venture === id).map((r) => r.id));
  const made = Object.values(artifacts).filter((a) => a.run && sessionIds.has(a.run)).sort((a, b) => b.updatedAt - a.updatedAt);
  const next = NEXT[v.stage];
  const goal = v.goalMrr && v.metrics?.mrr !== undefined ? Math.min(v.metrics.mrr / v.goalMrr, 1) : undefined;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1100px] px-6 py-6" style={{ "--venture": v.color } as React.CSSProperties}>
        <Link to="/ventures" className="text-[12px] text-fg-3 hover:text-fg">
          ← Ventures
        </Link>
        <header className="mt-3 flex flex-wrap items-start gap-4">
          <span className="vn-emoji is-large">{v.emoji}</span>
          <div className="min-w-0 flex-1">
            <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em]">{v.name}</h1>
            {v.pitch && <p className="mt-1 max-w-[700px] text-[14px] leading-relaxed text-fg-2">{v.pitch}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-fg-3">
              {v.customer && <span>For {v.customer}</span>}
              {v.website && (
                <a href={v.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-fg">
                  <Globe size={12} /> {v.website.replace(/^https?:\/\//, "")}
                </a>
              )}
              {v.repo && <span className="mono">{v.repo}</span>}
            </div>
          </div>
          <Button variant="ghost" size="s" onClick={() => setEditing(true)}>
            <Pencil size={12} /> Edit
          </Button>
        </header>

        <StageStepper venture={v} />

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
          <section className="vn-panel">
            <div className="flex items-center gap-2">
              <h2 className="vn-h">
                <TrendingUp size={14} /> Revenue
              </h2>
              <span className="ml-auto text-[11.5px] text-fg-3">
                {v.stripe?.connected ? (
                  <>
                    Stripe {v.stripe.mode === "test" ? "(test mode)" : ""} {v.stripe.account ? `· ${v.stripe.account}` : ""}
                  </>
                ) : v.metrics ? (
                  "entered by you"
                ) : (
                  ""
                )}
              </span>
              <Button variant="ghost" size="s" onClick={() => setRevenue(true)}>
                {v.stripe?.connected ? "Manage" : "Connect"}
              </Button>
              {v.stripe?.connected && (
                <SyncButton id={v.id} />
              )}
            </div>
            {v.syncError && <div className="mt-2 rounded-[8px] bg-[color-mix(in_srgb,var(--bad)_10%,transparent)] px-3 py-2 text-[12px] text-bad">Last sync failed: {v.syncError}</div>}
            <div className="mt-4 grid grid-cols-3 gap-2.5">
              <Metric label="MRR" value={money(v.metrics?.mrr, v.metrics?.currency)} sub={delta(v, "mrr")} />
              <Metric label="Revenue, 30 days" value={money(v.metrics?.revenue30d, v.metrics?.currency)} />
              <Metric label="Paying customers" value={v.metrics?.customers !== undefined ? String(v.metrics.customers) : "—"} sub={delta(v, "customers")} />
            </div>
            <Sparkline venture={v} />
            {v.goal && (
              <div className="mt-4">
                <div className="flex items-center gap-2 text-[12px]">
                  <Target size={13} className="text-fg-3" />
                  <span className="text-fg-2">{v.goal}</span>
                  {goal !== undefined && <span className="ml-auto font-semibold tabular-nums text-fg">{Math.round(goal * 100)}%</span>}
                </div>
                {goal !== undefined && (
                  <div className="vn-goal">
                    <motion.span initial={{ width: 0 }} animate={{ width: `${goal * 100}%` }} transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }} />
                  </div>
                )}
              </div>
            )}
            {!v.metrics && !v.stripe?.connected && (
              <p className="mt-4 text-[12.5px] leading-relaxed text-fg-3">No numbers yet. Connect a read-only Stripe key to track MRR automatically, or type this week's numbers in.</p>
            )}
          </section>

          <section className="vn-panel vn-next">
            <h2 className="vn-h">
              <Rocket size={14} /> Next step
            </h2>
            {next ? (
              <>
                <div className="mt-3 text-[16px] font-semibold text-fg">{next.label}</div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-fg-3">{next.why}</p>
                {(() => {
                  const running = mine.find((p) => p.playbook === next.playbook && (p.status === "running" || p.status === "waiting"));
                  return running ? (
                    <Button variant="primary" className="mt-4" onClick={() => navigate({ to: "/plays/$id", params: { id: running.id } })}>
                      <Play size={13} /> {running.status === "waiting" ? "Review where it's at" : "See it working"}
                    </Button>
                  ) : (
                    <StartPlay venture={v} playbook={next.playbook} />
                  );
                })()}
              </>
            ) : (
              <p className="mt-3 text-[13px] text-fg-3">This venture is {v.stage}. Move it to a stage to get the next step.</p>
            )}
            <AskCrew venture={v} />
          </section>
        </div>

        {mine.length > 0 && (
          <section className="mt-6">
            <h2 className="pb-eyebrow">Playbooks</h2>
            <div className="flex flex-col gap-2">
              {mine.map((p) => (
                <PlayLine key={p.id} play={p} />
              ))}
            </div>
          </section>
        )}

        {made.length > 0 && (
          <section className="mt-6">
            <h2 className="pb-eyebrow">What the crew made</h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-2">
              {made.slice(0, 12).map((a) => {
                const K = KIND[a.kind];
                return (
                  <button key={a.id} className="art-inline" style={{ "--kind": K.tone } as React.CSSProperties} onClick={() => navigate({ to: "/library", hash: a.id })}>
                    <span className="art-inline-icon">
                      <K.icon size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-fg">{a.title}</span>
                      <span className="block truncate text-[11.5px] text-fg-3">{a.summary ?? `${K.label}${a.version > 1 ? ` · v${a.version}` : ""}`}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {sessions.length > 0 && (
          <section className="mt-6 mb-4">
            <h2 className="pb-eyebrow">Sessions</h2>
            <div className="flex flex-col gap-1">
              {sessions.slice(0, 15).map((r) => (
                <SessionLine key={r.id} run={r} />
              ))}
            </div>
          </section>
        )}
      </div>
      {editing && <VentureEditor venture={v} onClose={() => setEditing(false)} />}
      {revenue && <RevenueDialog venture={v} onClose={() => setRevenue(false)} />}
    </div>
  );
}

function delta(v: VentureView, key: "mrr" | "customers"): string | undefined {
  const now = v.metrics?.[key];
  const weekAgo = [...v.history].reverse().find((m) => m.at <= Date.now() - 6.5 * 86400_000 && m[key] !== undefined)?.[key];
  if (now === undefined || weekAgo === undefined) return undefined;
  const d = now - weekAgo;
  if (!d) return "flat this week";
  return `${d > 0 ? "+" : ""}${key === "mrr" ? money(d, v.metrics?.currency) : d} this week`;
}

function Sparkline({ venture: v }: { venture: VentureView }) {
  const points = v.history.filter((m) => m.mrr !== undefined);
  if (points.length < 2) return null;
  const max = Math.max(...points.map((p) => p.mrr!), 1);
  const w = 100 / (points.length - 1);
  const d = points.map((p, i) => `${i ? "L" : "M"}${(i * w).toFixed(2)},${(38 - (p.mrr! / max) * 34).toFixed(2)}`).join(" ");
  return (
    <svg className="vn-spark" viewBox="0 0 100 40" preserveAspectRatio="none" aria-label="MRR over time">
      <path d={`${d} L100,40 L0,40 Z`} className="vn-spark-fill" />
      <path d={d} className="vn-spark-line" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function StageStepper({ venture: v }: { venture: VentureView }) {
  const i = stageIndex(v.stage);
  const set = (stage: VentureStage) => void api(`/api/ventures/${v.id}/stage`, { body: { stage } });
  return (
    <div className="vn-stepper">
      {STAGES.map((s, j) => (
        <button key={s.id} onClick={() => set(s.id)} className={`vn-step ${j < i ? "is-past" : j === i ? "is-now" : ""}`} title={`Move to ${s.label}`}>
          <span className="vn-step-dot">{j < i ? <Check size={11} strokeWidth={3} /> : j + 1}</span>
          <span className="min-w-0">
            <span className="block text-[12.5px] font-semibold">{s.label}</span>
            <span className="block truncate text-[11px] text-fg-3">{s.hint}</span>
          </span>
        </button>
      ))}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {v.stage === "paused" || v.stage === "stopped" ? (
          <span className="lib-badge">{v.stage}</span>
        ) : (
          <button className="text-[11.5px] text-fg-3 hover:text-fg" onClick={() => set("paused")}>
            Pause
          </button>
        )}
      </div>
    </div>
  );
}

function StartPlay({ venture: v, playbook }: { venture: VentureView; playbook: string }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputs: Record<string, string> = {
    idea: v.pitch || v.name,
    customer: v.customer ?? "",
    product: `${v.name}${v.pitch ? ` — ${v.pitch}` : ""}`,
    audience: v.customer ?? "",
    cta: "Join the waitlist",
    metrics: v.metrics ? `MRR ${money(v.metrics.mrr, v.metrics.currency)}, revenue last 30 days ${money(v.metrics.revenue30d, v.metrics.currency)}, ${v.metrics.customers ?? "?"} paying customers` : "No numbers yet",
  };
  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const play = await api<{ id: string }>("/api/plays", { body: { playbook, venture: v.id, inputs, title: `${v.name} — ${NEXT[v.stage]?.label ?? playbook}` } });
      navigate({ to: "/plays/$id", params: { id: play.id } });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <>
      <Button variant="primary" className="mt-4" onClick={() => void start()} disabled={busy}>
        <Play size={13} /> {busy ? "Starting…" : "Start it"}
      </Button>
      {error && <div className="mt-2 text-[12px] text-bad">{error}</div>}
    </>
  );
}

function AskCrew({ venture: v }: { venture: VentureView }) {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const ask = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const { id } = await api<{ id: string }>(`/api/ventures/${v.id}/ask`, { body: { text } });
      navigate({ to: "/sessions/$id", params: { id } });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-5 border-t border-line pt-4">
      <div className="text-[12px] text-fg-3">Or ask the crew anything about {v.name} — it goes to whoever it's for, with the venture's context.</div>
      <div className="member-talk mt-2" style={{ "--member": v.color } as React.CSSProperties}>
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void ask()} placeholder="Draft a cold email to 20 freelancers…" aria-label={`Ask the crew about ${v.name}`} />
        <button className="member-send" disabled={!text.trim() || busy} onClick={() => void ask()} aria-label="Send">
          <ArrowUp size={14} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

function SyncButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button className="member-icon" title="Sync from Stripe now" aria-label="Sync from Stripe now" disabled={busy} onClick={() => (setBusy(true), void api(`/api/ventures/${id}/sync`, { body: {} }).catch(() => undefined).finally(() => setBusy(false)))}>
      <RefreshCw size={13} className={busy ? "animate-spin" : ""} />
    </button>
  );
}

function PlayLine({ play }: { play: PlayView }) {
  const review = play.phases.find((p) => p.status === "review");
  return (
    <Link to="/plays/$id" params={{ id: play.id }} className={`pb-row ${play.status === "waiting" ? "is-waiting" : ""}`}>
      <span className="pb-emoji is-small">{play.emoji || "✨"}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-semibold text-fg">{play.name}</span>
        <span className="block truncate text-[12px] text-fg-3">{review ? <span className="text-amber">{review.name} is ready for your review</span> : play.status === "running" ? <span className="shimmer-text">{play.phases.find((p) => p.status === "running")?.name ?? "Working"}</span> : play.status}</span>
      </span>
      <span className="pb-dots" aria-hidden>
        {play.phases.map((p, i) => (
          <span key={i} className={`pb-dot is-${p.status === "done" ? "ok" : p.status === "running" ? "live" : p.status === "review" ? "wait" : p.status === "failed" ? "bad" : "idle"}`} />
        ))}
      </span>
    </Link>
  );
}

function SessionLine({ run }: { run: RunView }) {
  const member = useLive((s) => (run.member ? s.crew.members[run.member] : undefined));
  return (
    <Link to="/sessions/$id" params={{ id: run.id }} className="vn-session">
      <StatusGlyph tone={toneOf(run.status)} />
      <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{run.title}</span>
      {member && (
        <span className="member-chip shrink-0" style={{ "--member": member.color } as React.CSSProperties}>
          <span>{member.emoji}</span>
          {member.name}
        </span>
      )}
      <span className="shrink-0 text-[11.5px] text-fg-3">{new Date(run.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
    </Link>
  );
}

function VentureEditor({ venture, onClose }: { venture: Partial<VentureView>; onClose: () => void }) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState({
    name: venture.name ?? "",
    emoji: venture.emoji ?? "🌱",
    color: venture.color ?? "#7bd88f",
    pitch: venture.pitch ?? "",
    customer: venture.customer ?? "",
    goal: venture.goal ?? "",
    website: venture.website ?? "",
    repo: venture.repo ?? "",
  });
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const set = (k: keyof typeof draft) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const save = async () => {
    try {
      const v = await api<{ id: string }>("/api/ventures", { body: { ...draft, id: venture.id } });
      onClose();
      if (!venture.id) navigate({ to: "/ventures/$id", params: { id: v.id } });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Dialog onClose={onClose} label="Venture">
      <div className="mb-4 text-[16px] font-semibold">{venture.id ? `Edit ${venture.name}` : "New venture"}</div>
      <div className="grid grid-cols-[72px_1fr] gap-3">
        <label className="field">
          <span>Emoji</span>
          <input value={draft.emoji} onChange={set("emoji")} maxLength={4} />
        </label>
        <label className="field">
          <span>Name</span>
          <input value={draft.name} onChange={set("name")} placeholder="Fern" autoFocus />
        </label>
      </div>
      <label className="field mt-3">
        <span>What it is, in a sentence</span>
        <textarea rows={2} value={draft.pitch} onChange={set("pitch")} placeholder="A steady weekly paycheck for freelancers with lumpy income" />
      </label>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="field">
          <span>Who it's for</span>
          <input value={draft.customer} onChange={set("customer")} placeholder="US freelance designers" />
        </label>
        <label className="field">
          <span>Goal</span>
          <input value={draft.goal} onChange={set("goal")} placeholder="$1k MRR by March" />
        </label>
        <label className="field">
          <span>Website (optional)</span>
          <input value={draft.website} onChange={set("website")} placeholder="https://fern.money" />
        </label>
        <label className="field">
          <span>Repo (optional)</span>
          <input className="mono" value={draft.repo} onChange={set("repo")} placeholder="~/Developer/projects/fern" />
        </label>
      </div>
      <div className="mt-3 flex gap-2">
        {["#7bd88f", "#6cb6ff", "#f778ba", "#ffb020", "#56d4dd", "#ff7a59", "#b392f0"].map((c) => (
          <button key={c} onClick={() => setDraft((d) => ({ ...d, color: c }))} className={`h-6 w-6 rounded-full ${draft.color === c ? "ring-2 ring-offset-2 ring-offset-[var(--panel)]" : ""}`} style={{ background: c, ["--tw-ring-color" as string]: c }} aria-label={`Colour ${c}`} />
        ))}
      </div>
      {error && <div className="mt-3 text-[12px] text-bad">{error}</div>}
      <div className="mt-5 flex items-center gap-2">
        {venture.id &&
          (confirm ? (
            <Button variant="danger" onClick={() => void api(`/api/ventures/${venture.id}`, { method: "DELETE" }).then(() => (onClose(), navigate({ to: "/ventures" })))}>
              Delete {venture.name}? Its sessions and Library items stay.
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setConfirm(true)}>
              <Trash2 size={13} />
            </Button>
          ))}
        <span className="flex-1" />
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => void save()} disabled={!draft.name.trim()}>
          {venture.id ? "Save" : "Create venture"}
        </Button>
      </div>
    </Dialog>
  );
}

function RevenueDialog({ venture: v, onClose }: { venture: VentureView; onClose: () => void }) {
  const [tab, setTab] = useState<"stripe" | "manual">(v.stripe?.connected || !v.metrics ? "stripe" : "manual");
  const [key, setKey] = useState("");
  const [nums, setNums] = useState({ mrr: "", revenue30d: "", customers: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await work();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const n = (s: string) => (s.trim() === "" ? undefined : Number(s.replace(/[$,\s]/g, "")));
  return (
    <Dialog onClose={onClose} label="Revenue">
      <div className="mb-1 text-[16px] font-semibold">Revenue for {v.name}</div>
      <p className="mb-4 text-[12.5px] text-fg-3">ShuaCrew only reads. It never charges, refunds or changes anything in Stripe.</p>
      <div className="seg mb-4" role="tablist">
        <button role="tab" aria-selected={tab === "stripe"} className={tab === "stripe" ? "is-on" : ""} onClick={() => setTab("stripe")}>
          <CreditCard size={13} /> Stripe
        </button>
        <button role="tab" aria-selected={tab === "manual"} className={tab === "manual" ? "is-on" : ""} onClick={() => setTab("manual")}>
          <Pencil size={13} /> Enter numbers
        </button>
      </div>
      {tab === "stripe" ? (
        v.stripe?.connected ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 rounded-[10px] border border-line bg-sunken px-3 py-2.5 text-[13px]">
              <ShieldCheck size={15} className="text-ok" /> Connected{v.stripe.account ? ` to ${v.stripe.account}` : ""} ({v.stripe.mode} mode). Syncs every 6 hours.
            </div>
            <Button variant="danger" disabled={busy} onClick={() => void run(() => api(`/api/ventures/${v.id}/stripe`, { method: "DELETE" }))}>
              <Unplug size={13} /> Disconnect and delete the key
            </Button>
          </div>
        ) : (
          <>
            <ol className="vn-howto">
              <li>
                In Stripe, open <b>Developers → API keys → Create restricted key</b>.
              </li>
              <li>
                Give it <b>Read</b> access to <b>Charges</b>, <b>Subscriptions</b>, <b>Customers</b> and <b>Balance</b>. Leave everything else at <b>None</b>.
              </li>
              <li>
                Paste the key (it starts with <span className="mono">rk_live_</span>). A <span className="mono">sk_test_</span> key works for trying it out.
              </li>
            </ol>
            <label className="field mt-3">
              <span>Restricted key</span>
              <input className="mono" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="rk_live_…" />
            </label>
            <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-fg-3">
              <KeyRound size={11} /> Stored only on this Mac in a file only you can read. Never logged, never shown again.
            </p>
          </>
        )
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <label className="field">
            <span>MRR</span>
            <input inputMode="decimal" value={nums.mrr} onChange={(e) => setNums((x) => ({ ...x, mrr: e.target.value }))} placeholder="$84" />
          </label>
          <label className="field">
            <span>Revenue, 30 days</span>
            <input inputMode="decimal" value={nums.revenue30d} onChange={(e) => setNums((x) => ({ ...x, revenue30d: e.target.value }))} placeholder="$120" />
          </label>
          <label className="field">
            <span>Paying customers</span>
            <input inputMode="numeric" value={nums.customers} onChange={(e) => setNums((x) => ({ ...x, customers: e.target.value }))} placeholder="7" />
          </label>
        </div>
      )}
      {error && <div className="mt-3 text-[12px] text-bad">{error}</div>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {v.stripe?.connected && tab === "stripe" ? "Done" : "Cancel"}
        </Button>
        {tab === "stripe" && !v.stripe?.connected && (
          <Button variant="primary" disabled={!key.trim() || busy} onClick={() => void run(() => api(`/api/ventures/${v.id}/stripe`, { body: { key } }))}>
            {busy ? "Checking…" : "Connect"}
          </Button>
        )}
        {tab === "manual" && (
          <Button variant="primary" disabled={busy} onClick={() => void run(() => api(`/api/ventures/${v.id}/metrics`, { body: { mrr: n(nums.mrr), revenue30d: n(nums.revenue30d), customers: n(nums.customers) } }))}>
            Save numbers
          </Button>
        )}
      </div>
    </Dialog>
  );
}

function Dialog({ children, onClose, label }: { children: React.ReactNode; onClose: () => void; label: string }) {
  useEffect(() => {
    const close = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label={label}>
      <motion.div initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="relative w-[580px] max-w-full rounded-[16px] border border-line-strong bg-panel p-5 shadow-[0_30px_90px_rgba(0,0,0,.45)]">
        <button className="member-icon absolute right-3 top-3" onClick={onClose} aria-label="Close">
          <X size={14} />
        </button>
        {children}
      </motion.div>
    </div>
  );
}
