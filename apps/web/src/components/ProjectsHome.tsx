/**
 * The top of Projects when you're still finding the money: a first-dollar quest that checks itself off from real
 * state, and an idea forge (quick starts that prefill a project, or the crew researching three ideas that fit you).
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, Flame, Lightbulb, Rocket, Sparkles } from "lucide-react";
import type { VentureView } from "@shuacrew/core/projections";
import { api } from "../lib/api";
import { useLive } from "../lib/live";

export interface FirstDollarState { ventures: number; validated: boolean; site: boolean; earned: boolean }

/** The four steps to a first dollar, each true only when the workspace shows it. */
export function firstDollarSteps(s: FirstDollarState) {
  return [
    { id: "idea", label: "Pick an idea", hint: "One thing someone would pay for", done: s.ventures > 0 },
    { id: "validate", label: "Let the crew validate it", hint: "Real demand, real competitors, real prices", done: s.validated },
    { id: "site", label: "Put a page in front of people", hint: "A landing page with a price on it", done: s.site },
    { id: "earn", label: "Log your first dollar", hint: "Even $1 from one real customer", done: s.earned },
  ];
}

export function FirstDollar({ onNew }: { onNew: () => void }) {
  const ventures = useLive((s) => s.crew.ventures), sites = useLive((s) => s.crew.sites), income = useLive((s) => s.crew.income);
  const list = Object.values(ventures) as VentureView[];
  const steps = firstDollarSteps({
    ventures: list.length,
    validated: list.some((v) => v.stage !== "idea"),
    site: Object.keys(sites).length > 0,
    earned: Object.keys(income).length > 0 || list.some((v) => (v.metrics?.revenue30d ?? 0) > 0 || (v.metrics?.mrr ?? 0) > 0),
  });
  const done = steps.filter((s) => s.done).length;
  if (steps.at(-1)!.done) return null; // the quest is the first dollar: once it lands, it is over
  const next = steps.find((s) => !s.done)!;
  return <section className="ph-quest" aria-label="First dollar">
    <header><span className="ph-kicker"><Flame size={13} /> Quest</span><h2>Your first dollar</h2><small>{done} of {steps.length}</small></header>
    <div className="ph-meter" aria-hidden><i style={{ width: `${(done / steps.length) * 100}%` }} /></div>
    <ol>{steps.map((s, i) => <li key={s.id} className={s.done ? "is-done" : s === next ? "is-next" : ""}>
      <i>{s.done ? <Check size={13} strokeWidth={3} /> : i + 1}</i><div><strong>{s.label}</strong><small>{s.hint}</small></div>
      {s === next && s.id === "idea" && <button type="button" onClick={onNew}>Start</button>}
    </li>)}</ol>
  </section>;
}

const STARTERS: Array<{ name: string; pitch: string; customer: string; emoji: string }> = [
  { name: "Shua Labs: AI platform consulting", pitch: "Set up AI agents and platform engineering for small teams, done in two weeks.", customer: "Startups with 5–50 engineers", emoji: "🧪" },
  { name: "DevOps audit in a day", pitch: "A fixed-price review of CI/CD, AWS costs and reliability with a prioritized fix list.", customer: "Seed–Series A SaaS teams", emoji: "🛠️" },
  { name: "Build in public", pitch: "Short videos and posts about building ShuaCrew, growing an audience that buys later.", customer: "Developers and indie hackers", emoji: "🎥" },
];

export function IdeaForge({ onStart }: { onStart: (draft: Partial<VentureView>) => void }) {
  const navigate = useNavigate();
  const [about, setAbout] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const forge = async () => {
    setBusy(true); setError("");
    const ask = [
      "You are my venture researcher. Propose exactly three ideas I could start making money from within 30 days, given who I am.",
      `About me: ${about.trim() || "AI platform / DevOps engineer, building ShuaCrew (an agent workspace); brand Shua Labs (consulting), content, small products. Limited hours outside a day job."}`,
      "For each: a one-line pitch, who pays and how much (a real price), why now, the fastest way to get the first paying customer this week, and one honest risk. Check real competitors and prices on the web.",
      "End with which one you'd start today and why, in two sentences.",
    ].join("\n");
    try { const r = await api<{ id: string }>("/api/runs", { body: { ask, title: "Idea forge: three ways to earn", labels: ["money"] } }); void navigate({ to: "/sessions/$id", params: { id: r.id } }); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  };
  return <section className="ph-forge" aria-label="Idea forge">
    <header><span className="ph-kicker"><Lightbulb size={13} /> Idea forge</span><h2>What could you sell?</h2></header>
    <div className="ph-starters">{STARTERS.map((s) => <button key={s.name} type="button" onClick={() => onStart({ name: s.name, pitch: s.pitch, customer: s.customer, emoji: s.emoji })}>
      <span className="ph-emoji">{s.emoji}</span><span><strong>{s.name}</strong><small>{s.pitch}</small></span><Rocket size={14} />
    </button>)}</div>
    <div className="ph-forge-ask">
      <textarea rows={2} placeholder="What you're good at, who you know, how many hours a week… (optional)" value={about} onChange={(e) => setAbout(e.target.value)} />
      <button type="button" disabled={busy} onClick={() => void forge()}><Sparkles size={14} />{busy ? "Starting…" : "Forge 3 ideas with the crew"}</button>
    </div>
    {error && <p className="ph-error">{error}</p>}
  </section>;
}
