/**
 * Earnings: what everything you run actually brings in — subscription revenue your ventures' Stripe reports, plus
 * the money it doesn't see (consulting, content, sponsorships, one-off sales) that you log in one step. Shua reads
 * the same numbers when you ask how to grow them.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plus, Sparkles, X } from "lucide-react";
import type { IncomeEntry, IncomeKind, VentureView } from "@shuacrew/core/projections";
import { api } from "../lib/api";
import { companionName, useCompanion } from "../lib/companion";
import "./earnings.css";

const KINDS: Array<[IncomeKind, string]> = [["consulting", "Consulting"], ["content", "Content"], ["product", "Product"], ["sponsorship", "Sponsorship"], ["other", "Other"]];
const usd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n >= 1000 || n % 1 === 0 ? 0 : 2 }).format(n);
const DAY = 86_400_000;

export function Earnings({ ventures, income }: { ventures: VentureView[]; income: Record<string, IncomeEntry> }) {
  const name = companionName(useCompanion());
  const navigate = useNavigate();
  const [logging, setLogging] = useState(false), [busy, setBusy] = useState(""), [error, setError] = useState("");
  const [draft, setDraft] = useState<{ amount: string; kind: IncomeKind; venture: string; note: string }>({ amount: "", kind: "consulting", venture: "", note: "" });
  const now = Date.now(), month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0);
  const entries = useMemo(() => Object.values(income).filter((e) => e.currency === "usd").sort((a, b) => b.on - a.on), [income]);
  // Only real money: test-mode Stripe readings never count.
  const live = ventures.filter((v) => v.metrics && v.metrics.currency === "usd" && v.metrics.mode !== "test");
  const mrr = live.reduce((n, v) => n + (v.metrics!.mrr ?? 0), 0);
  const subs30 = live.reduce((n, v) => n + (v.metrics!.revenue30d ?? 0), 0);
  const logged30 = entries.filter((e) => now - e.on < 30 * DAY).reduce((n, e) => n + e.amount, 0);
  const thisMonth = entries.filter((e) => e.on >= month.getTime()).reduce((n, e) => n + e.amount, 0) + mrr;
  const goal = ventures.reduce((n, v) => n + (v.goalMrr ?? 0), 0);
  // Six months of logged income, oldest first: the shape of the last half-year at a glance.
  const months = Array.from({ length: 6 }, (_, i) => {
    const start = new Date(month); start.setMonth(start.getMonth() - (5 - i));
    const end = new Date(start); end.setMonth(end.getMonth() + 1);
    return { label: start.toLocaleString([], { month: "short" }), total: entries.filter((e) => e.on >= start.getTime() && e.on < end.getTime()).reduce((n, e) => n + e.amount, 0) };
  });
  const peak = Math.max(1, ...months.map((m) => m.total));
  const byKind = KINDS.map(([k, label]) => ({ k, label, total: entries.filter((e) => e.kind === k && now - e.on < 90 * DAY).reduce((n, e) => n + e.amount, 0) })).filter((x) => x.total > 0);

  const log = async () => {
    const amount = Number(draft.amount.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) { setError("How much came in?"); return; }
    setBusy("log"); setError("");
    try { await api("/api/income", { body: { amount, kind: draft.kind, venture: draft.venture || undefined, note: draft.note || undefined } }); setDraft({ ...draft, amount: "", note: "" }); setLogging(false); }
    catch (e) { setError((e as Error).message.replace(/^\d+\s*/, "")); } finally { setBusy(""); }
  };
  const advise = async () => {
    setBusy("advise"); setError("");
    const lines = [
      `You are ${name}, my business advisor. I want to make real money from what I build: products I host and sell, Shua Labs consulting, and content.`,
      `My numbers right now (USD): MRR ${usd(mrr)}; last 30 days ${usd(subs30 + logged30)} (${usd(logged30)} logged outside subscriptions); goal MRR ${goal ? usd(goal) : "not set"}.`,
      byKind.length ? `Last 90 days by kind: ${byKind.map((k) => `${k.label} ${usd(k.total)}`).join(", ")}.` : "No logged income in the last 90 days.",
      ventures.length ? `Projects: ${ventures.map((v) => `${v.name} (${v.stage}${v.metrics?.mrr ? `, ${usd(v.metrics.mrr)} MRR` : ""})`).join("; ")}.` : "No projects yet.",
      "Give me: 1) the single highest-leverage move for the next 7 days and why, with the numbers; 2) three money ideas that fit what I already have (pricing, who buys, how to reach them); 3) what to stop doing. Be concrete and honest; say when the data is too thin.",
    ];
    try { const r = await api<{ id: string }>("/api/runs", { body: { ask: lines.join("\n"), title: "How do I grow what I earn?", labels: ["money"] } }); void navigate({ to: "/sessions/$id", params: { id: r.id } }); }
    catch (e) { setError((e as Error).message.replace(/^\d+\s*/, "")); setBusy(""); }
  };

  return <section className="earn" aria-label="Earnings">
    <div className="earn-figures">
      <div className="earn-lead"><span>This month</span><strong>{usd(thisMonth)}</strong>
        {goal > 0 && <div className="earn-goal" title={`${usd(mrr)} of ${usd(goal)} goal MRR`}><i style={{ width: `${Math.min(100, (mrr / goal) * 100)}%` }} /><small>{Math.round((mrr / goal) * 100)}% of {usd(goal)} goal</small></div>}
      </div>
      <div><span>MRR</span><strong>{usd(mrr)}</strong></div>
      <div><span>Last 30 days</span><strong>{usd(subs30 + logged30)}</strong></div>
      <div className="earn-chart" aria-label="Logged income, last six months">
        {months.map((m) => <span key={m.label} title={`${m.label}: ${usd(m.total)}`}><i style={{ height: `${Math.max(4, (m.total / peak) * 100)}%` }} className={m.total ? "is-on" : ""} /><small>{m.label}</small></span>)}
      </div>
    </div>
    <div className="earn-actions">
      <button type="button" className="earn-primary" onClick={() => setLogging((v) => !v)}><Plus size={14} />Log income</button>
      <button type="button" className="earn-ask" disabled={!!busy} onClick={() => void advise()}><Sparkles size={14} />{busy === "advise" ? "Starting…" : `Ask ${name} how to grow it`}</button>
      {byKind.length > 0 && <div className="earn-kinds">{byKind.map((k) => <span key={k.k}><i data-kind={k.k} />{k.label} {usd(k.total)}</span>)}</div>}
    </div>
    {logging && <form className="earn-form" onSubmit={(e) => { e.preventDefault(); void log(); }}>
      <input autoFocus inputMode="decimal" placeholder="$ amount" aria-label="Amount" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
      <div className="earn-seg" role="radiogroup" aria-label="Kind">{KINDS.map(([k, label]) => <button key={k} type="button" role="radio" aria-checked={draft.kind === k} className={draft.kind === k ? "is-on" : ""} onClick={() => setDraft({ ...draft, kind: k })}>{label}</button>)}</div>
      <select aria-label="Project" value={draft.venture} onChange={(e) => setDraft({ ...draft, venture: e.target.value })}><option value="">No project</option>{ventures.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
      <input placeholder="What for? (optional)" aria-label="Note" maxLength={300} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
      <button type="submit" className="earn-primary" disabled={busy === "log"}>{busy === "log" ? "Saving…" : "Save"}</button>
    </form>}
    {error && <p className="earn-error" role="alert">{error}</p>}
    {entries.length > 0 && <ul className="earn-recent">{entries.slice(0, 4).map((e) => <li key={e.id}>
      <i data-kind={e.kind} /><span>{e.note || KINDS.find(([k]) => k === e.kind)![1]}<small>{new Date(e.on).toLocaleDateString([], { month: "short", day: "numeric" })}{e.venture && ventures.find((v) => v.id === e.venture) ? ` · ${ventures.find((v) => v.id === e.venture)!.name}` : ""}</small></span>
      <b>{usd(e.amount)}</b>
      <button type="button" aria-label="Remove this entry" title="Remove" onClick={() => void api(`/api/income/${e.id}/remove`, { body: {} })}><X size={12} /></button>
    </li>)}</ul>}
  </section>;
}
