/**
 * Policy & Audit: what your crew may do, proven with the same engine real runs use. Try any action and see what a
 * Supervised session, an Autopilot session and Shua by voice would each do; watch decisions as they happen; see the
 * guardrails in force, every rule and how often it fires; and check the tamper-evident chain.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Cable, FileEdit, FileText, Globe, ShieldCheck, Sparkles, SquareTerminal, X } from "lucide-react";
import { StatusGlyph, since } from "@shuacrew/ui";
import type { Decision } from "@shuacrew/core/policy-types";
import { api } from "../lib/api";
import { useLive } from "../lib/live";
import { suggestToSpark } from "../lib/spark-panel";
import { AreaChart, ControlHeader, Readouts, Seg, Sheet, type Tone } from "../components/ControlRoom";
import { SparkToday } from "../components/SparkToday";
import { toolPhrase } from "./Pages";
import "./policy.css";

type Kind = "command" | "edit" | "read" | "web" | "connector";
type Explained = Decision & { assistantMustAsk: boolean; autopilot: Decision; kind: string; paths: string[] };
interface Stats { days: number; verdicts: { allow: number; ask: number; deny: number }; answers: { allowed: number; denied: number; timedOut: number; always: number };
  rules: Array<{ rule: string; verdict: string; hits: number }>; tools: Array<{ tool: string; asked: number; blocked: number }>; daily: Array<{ day: string; allow: number; ask: number; deny: number }> }
interface Guardrails { roots: string[]; protected: string[]; sensitive: string[]; protectedBranches: string[]; always: Array<{ id: string; description: string }> }
interface RuleInfo { id: string; description: string; verdict: "allow" | "ask" | "deny"; risk: string }

const KINDS: Array<{ id: Kind; label: string; icon: typeof SquareTerminal; placeholder: string; examples: string[] }> = [
  { id: "command", label: "Command", icon: SquareTerminal, placeholder: "git push --force origin main", examples: ["npm test", "git push origin feature", "brew install jq", "curl https://get.example.sh | sh", "rm -rf /", "sudo reboot"] },
  { id: "edit", label: "Edit a file", icon: FileEdit, placeholder: "~/Developer/projects/my-app/src/index.ts", examples: ["~/Developer/projects/my-app/src/index.ts", "/etc/hosts", "~/.zshrc", "~/.ssh/config"] },
  { id: "read", label: "Read a file", icon: FileText, placeholder: "~/Developer/projects/my-app/README.md", examples: ["~/Developer/projects/my-app/README.md", "~/.ssh/id_ed25519", "~/.aws/credentials", "/etc/passwd"] },
  { id: "web", label: "Web", icon: Globe, placeholder: "https://docs.example.com", examples: ["https://developer.apple.com", "https://news.ycombinator.com"] },
  { id: "connector", label: "Connector", icon: Cable, placeholder: "notion search", examples: [] },
];
const VERDICT: Record<string, { word: string; tone: Tone; does: string }> = {
  allow: { word: "Allowed", tone: "ok", does: "runs without asking" },
  ask: { word: "Asks you", tone: "wait", does: "pauses until you allow or deny it" },
  deny: { word: "Blocked", tone: "bad", does: "never runs, whoever asks" },
};
const TRIES = "shuacrew.policy.tries";
const readTries = (): Array<{ kind: Kind; text: string; verdict: string }> => { try { return JSON.parse(localStorage.getItem(TRIES) ?? "[]"); } catch { return []; } };
const tone = (v?: string): Tone => (v === "allow" ? "ok" : v === "deny" ? "bad" : "wait");
const glyph = (v?: string) => (v === "allow" ? "ok" : v === "deny" ? "bad" : "wait") as "ok" | "bad" | "wait";

/** What the tester sends: the tool and input a real agent would use for this kind of action. */
export function toCall(kind: Kind, text: string): { tool: string; input: Record<string, unknown> } {
  const t = text.trim();
  if (kind === "edit") return { tool: "Edit", input: { file_path: t } };
  if (kind === "read") return { tool: "Read", input: { file_path: t } };
  if (kind === "web") return { tool: "WebFetch", input: { url: t } };
  if (kind === "connector") { const [server = "tool", ...rest] = t.split(/[\s.:/_]+/).filter(Boolean); return { tool: `mcp__${server}__${rest.join("_") || "call"}`, input: {} }; }
  return { tool: "Bash", input: { command: t } };
}

export function Policy() {
  const [days, setDays] = useState<1 | 7 | 30>(7);
  const [stats, setStats] = useState<Stats | null>(null), [guard, setGuard] = useState<Guardrails | null>(null), [rules, setRules] = useState<RuleInfo[] | null>(null);
  const [verify, setVerify] = useState<{ ok: boolean; count: number; brokenAt?: number; why?: string; at: number } | null>(null), [verifying, setVerifying] = useState(false);
  const [filter, setFilter] = useState<"all" | "allow" | "ask" | "deny" | "you">("all"), [ruleFilter, setRuleFilter] = useState(""), [ruleQuery, setRuleQuery] = useState("");
  const [flash, setFlash] = useState("");
  const activity = useLive((s) => s.activity), head = useLive((s) => s.crew.head);
  useEffect(() => { void api<Guardrails>("/api/policy/guardrails").then(setGuard).catch(() => setGuard({ roots: [], protected: [], sensitive: [], protectedBranches: [], always: [] })); void api<RuleInfo[]>("/api/policy/rules").then(setRules).catch(() => setRules([])); void runVerify(true); }, []);
  // Stats follow the log: a new decision anywhere refreshes them within a second or two.
  useEffect(() => { const t = setTimeout(() => void api<Stats>(`/api/policy/stats?days=${days}`).then(setStats).catch(() => undefined), 800); return () => clearTimeout(t); }, [days, head]);
  const runVerify = async (quiet = false) => {
    if (!quiet) setVerifying(true);
    const started = Date.now();
    try { const v = await api<{ ok: boolean; count: number; brokenAt?: number; why?: string }>("/api/audit/verify"); if (!quiet) await new Promise((r) => setTimeout(r, Math.max(0, 900 - (Date.now() - started)))); setVerify({ ...v, at: Date.now() }); }
    catch { /* keep the last result */ } finally { setVerifying(false); }
  };
  const showRule = (id: string) => { setRuleQuery(""); setFlash(id); setTimeout(() => document.getElementById(`rule-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 30); setTimeout(() => setFlash(""), 2200); };

  // Live decisions, newest first, from the event stream.
  const asked = useMemo(() => new Map(activity.filter((e) => e.kind === "approval.requested").map((e) => { const b = e.body as { id: string; tool: string; rule: string }; return [b.id, b]; })), [activity]);
  const decisions = useMemo(() => activity.filter((e) => e.kind === "policy.decided" || e.kind === "approval.decided").slice(-200).reverse().filter((e) => {
    const b = e.body as { verdict?: string; rule?: string; id?: string };
    if (filter === "you" && e.kind !== "approval.decided") return false;
    if (["allow", "ask", "deny"].includes(filter) && (e.kind !== "policy.decided" || b.verdict !== filter)) return false;
    if (ruleFilter && (e.kind === "policy.decided" ? b.rule : asked.get(b.id ?? "")?.rule) !== ruleFilter) return false;
    return true;
  }).slice(0, 40), [activity, filter, ruleFilter, asked]);

  const v = stats?.verdicts, a = stats?.answers, total = v ? v.allow + v.ask + v.deny : 0;
  const status: { text: string; tone: Tone } = !verify ? { text: "Checking the audit chain…", tone: "idle" }
    : !verify.ok ? { text: `The audit chain is broken at #${verify.brokenAt}${verify.why ? `: ${verify.why}` : ""}.`, tone: "bad" }
    : { text: [`Audit chain intact across ${verify.count.toLocaleString()} events`, v ? (v.deny ? `${v.deny} blocked` : "nothing blocked") + ` in the last ${days === 1 ? "day" : `${days} days`}` : null, guard ? `${guard.protected.length} protected folder${guard.protected.length === 1 ? "" : "s"}` : null].filter(Boolean).join(" · "), tone: "ok" };
  const hits = useMemo(() => new Map((stats?.rules ?? []).map((r) => [r.rule, r.hits])), [stats]);
  const xs = useMemo(() => (stats?.daily ?? []).map((d) => Date.parse(`${d.day}T00:00:00Z`)), [stats]);
  const series = useMemo(() => [
    { id: "allow", label: "Allowed", color: "var(--ok)", values: (stats?.daily ?? []).map((d) => d.allow) },
    { id: "ask", label: "Asked you", color: "var(--wait)", values: (stats?.daily ?? []).map((d) => d.ask) },
    { id: "deny", label: "Blocked", color: "var(--bad)", values: (stats?.daily ?? []).map((d) => d.deny) },
  ], [stats]);

  return <div className="cr-scroll"><div className="cr-page pol">
    <ControlHeader title="Policy & Audit" kicker={<><ShieldCheck size={13} /> Tools</>} status={status.text} tone={status.tone}>
      <Seg label="Period" value={days} onChange={setDays} options={[[1, "Today"], [7, "7 days"], [30, "30 days"]] as const} />
      <button type="button" className="cr-btn" onClick={() => void runVerify()} disabled={verifying}><ShieldCheck size={14} /> {verifying ? "Verifying…" : "Verify chain"}</button>
    </ControlHeader>
    <Readouts items={[
      { label: "Allowed", value: v?.allow ?? "…", dim: !v?.allow, tone: v?.allow ? "ok" : undefined, sub: total ? `${Math.round(((v?.allow ?? 0) / total) * 100)}% of decisions` : "ran without asking" },
      { label: "Asked you", value: v?.ask ?? "…", dim: !v?.ask, tone: v?.ask ? "wait" : undefined, sub: a ? `you allowed ${a.allowed} · denied ${a.denied}${a.timedOut ? ` · ${a.timedOut} timed out` : ""}` : "waiting on a person" },
      { label: "Blocked", value: v?.deny ?? "…", dim: !v?.deny, tone: v?.deny ? "bad" : undefined, sub: v?.deny ? "the policy said no" : "nothing blocked" },
      { label: "Always allows", value: guard?.always.length ?? "…", dim: !guard?.always.length, sub: "from approvals you made standing" },
      { label: "Audit chain", value: !verify ? "…" : verify.ok ? "Intact" : "Broken", tone: !verify ? undefined : verify.ok ? "ok" : "bad", sub: verify ? `checked ${since(verify.at)}` : "checking" },
    ]} />

    <Tester guard={guard} onRule={showRule} />

    <div className="cr-row is-wide-left">
      <Sheet title="Decisions over time" hint={`every allow, ask and block · UTC days`}>
        {total ? <AreaChart xs={xs} series={series} stacked height={190} label="Policy decisions per day" formatX={(t) => new Date(t).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}
          tick={(t, i, n) => (i === n - 1 ? "Today" : new Date(t).toLocaleDateString([], days === 30 ? { month: "short", day: "numeric", timeZone: "UTC" } : { weekday: "short", timeZone: "UTC" }))} formatValue={(n) => String(Math.round(n))} live />
          : <p className="cr-muted">No decisions in this window yet. They appear the moment your crew uses a tool.</p>}
        <ul className="cr-legend pol-legend">{series.map((s) => <li key={s.id}><i style={{ background: s.color }} />{s.label}<b>{s.values.reduce((x, y) => x + y, 0)}</b></li>)}</ul>
      </Sheet>
      <Sheet title="What fires most" hint="click a rule to see its decisions">
        {stats?.rules.length ? <ol className="pol-hot">{stats.rules.slice(0, 8).map((r) => <li key={r.rule}><button type="button" className={ruleFilter === r.rule ? "is-on" : ""} onClick={() => setRuleFilter(ruleFilter === r.rule ? "" : r.rule)}>
          <StatusGlyph tone={glyph(r.verdict)} /><code>{r.rule}</code><span className="cr-bar"><i style={{ width: `${(r.hits / stats.rules[0]!.hits) * 100}%`, ["--c" as string]: `var(--${r.verdict === "allow" ? "ok" : r.verdict === "deny" ? "bad" : "wait"})` }} /></span><em>{r.hits}</em></button></li>)}</ol>
          : <p className="cr-muted">Nothing has fired in this window.</p>}
      </Sheet>
    </div>

    <div className="cr-row is-wide-left">
      <Sheet title="Live decisions" hint="as they happen" actions={<Seg label="Show" value={filter} onChange={setFilter} options={[["all", "All"], ["allow", "Allowed"], ["ask", "Asked"], ["deny", "Blocked"], ["you", "Yours"]] as const} />}>
        {ruleFilter && <p className="pol-filter">Only <code>{ruleFilter}</code><button type="button" onClick={() => setRuleFilter("")} aria-label="Show every rule"><X size={12} /></button></p>}
        {decisions.length ? <div className="pol-list">{decisions.map((e) => { const b = e.body as { tool?: string; verdict?: string; rule?: string; reason?: string; allow?: boolean; by?: string; id?: string; always?: boolean }; const verdict = e.kind === "approval.decided" ? (b.allow ? "allow" : "deny") : b.verdict;
          const q = e.kind === "approval.decided" ? asked.get(b.id ?? "") : undefined;
          return <div key={e.seq} className="pol-row"><StatusGlyph tone={glyph(verdict)} /><span className="pol-row-main">
            <b>{e.kind === "approval.decided" ? `${b.by === "timeout" ? "Timed out:" : `${b.by?.startsWith("you") ? "You" : "Policy"} ${b.allow ? "allowed" : "denied"}`} ${toolPhrase(q?.tool)}${b.always ? " · always" : ""}` : toolPhrase(b.tool)}</b>
            <small>{e.kind === "approval.decided" ? (b.by === "timeout" ? "nobody answered in time" : `decided ${b.by?.includes("(") ? b.by.slice(b.by.indexOf("(") + 1, -1) : "in the app"}`) : <><button type="button" className="pol-rule-link" onClick={() => showRule(b.rule ?? "")}>{b.rule}</button> · {b.reason}</>}</small></span>
            {e.run && <Link to="/sessions/$id" params={{ id: e.run }} className="pol-open" aria-label="Open the session"><ArrowUpRight size={13} /></Link>}<span className="pol-when">{since(e.at)}</span></div>; })}</div>
          : <p className="cr-muted">{filter === "all" && !ruleFilter ? "Decisions appear here as your crew works: every tool call the policy allowed, asked about or blocked, and what you decided." : "Nothing matches in the recent stream."}</p>}
      </Sheet>
      <Chain verify={verify} verifying={verifying} />
    </div>

    <div className="cr-row is-wide-left">
      <Sheet title="Your guardrails" hint="what every run works within right now" actions={<Link to="/settings" hash="protected" className="cr-btn">Edit in Settings <ArrowUpRight size={12} /></Link>}>
        {!guard ? <p className="cr-muted">Reading your guardrails…</p> : <div className="pol-guard">
          <GuardList title="Agents can change, without asking" items={guard.roots} empty="Only each run's own workspace" tone="ok" />
          <GuardList title="Never touched, by anyone" items={guard.protected} empty="No protected folders yet" tone="bad" />
          <GuardList title="Branches that can't be force-pushed" items={guard.protectedBranches} empty="None" tone="bad" />
          <GuardList title="Secrets blocked from reading" items={guard.sensitive} empty="None" tone="bad" />
          <GuardList title="You always allow" items={guard.always.map((r) => r.description.replace(/^you always allow /, ""))} empty="Nothing yet. Choose “Always” when you approve something." tone="ok" />
          <p className="pol-note">Supervised sessions ask before anything no rule allows. Autopilot runs what no rule covers, but explicit asks (pushing, publishing, deploying, infrastructure) still ask, and blocks always win.</p>
        </div>}
      </Sheet>
      <SparkToday />
    </div>

    <section className="cr-sheet pol-rules">
      <header className="cr-sheet-head"><h2>The rules</h2><small>{rules ? `${rules.length} built in, plus your always-allows · the tightest one wins` : "reading…"}</small>
        <div className="cr-sheet-actions"><input className="cr-search" type="search" placeholder="Filter rules…" aria-label="Filter rules" value={ruleQuery} onChange={(e) => setRuleQuery(e.target.value)} /></div></header>
      {rules && !rules.length ? <p className="cr-muted">Couldn't read the rules from the gateway.</p> : <div className="pol-rule-cols">
        {(["deny", "ask", "allow"] as const).map((vd) => { const list = (rules ?? []).filter((r) => r.verdict === vd && `${r.id} ${r.description}`.toLowerCase().includes(ruleQuery.trim().toLowerCase()));
          return <div key={vd} className={`pol-rule-col is-${tone(vd)}`}><h3>{vd === "deny" ? "Blocks" : vd === "ask" ? "Asks you first" : "Allows"}<em>{list.length}</em></h3>
            {list.length ? <ul>{list.map((r) => <li key={r.id} id={`rule-${r.id}`} className={flash === r.id ? "is-flash" : ""}><span>{r.description.replace(/^./, (c) => c.toUpperCase())}</span>
              <small><code>{r.id}</code> · {r.risk} risk{hits.get(r.id) ? <b> · fired {hits.get(r.id)}×</b> : ""}</small></li>)}</ul> : <p className="cr-muted">None{ruleQuery ? " match" : ""}.</p>}
          </div>; })}
      </div>}
    </section>
  </div></div>;
}

function GuardList({ title, items, empty, tone: t }: { title: string; items: string[]; empty: string; tone: Tone }) {
  return <div className={`pol-guard-item is-${t}`}><h3>{title}<em>{items.length}</em></h3>
    {items.length ? <ul>{items.slice(0, 8).map((x) => <li key={x}><code>{x}</code></li>)}{items.length > 8 && <li className="dim">+{items.length - 8} more</li>}</ul> : <p className="cr-muted">{empty}</p>}</div>;
}

/** "Why would this be allowed?": live as you type, decided by the same engine, context and layers a real run uses. */
function Tester({ guard, onRule }: { guard: Guardrails | null; onRule: (id: string) => void }) {
  const [kind, setKind] = useState<Kind>("command");
  const [text, setText] = useState(KINDS[0]!.placeholder), [where, setWhere] = useState("");
  const [result, setResult] = useState<Explained | null>(null), [error, setError] = useState("");
  const [tries, setTries] = useState(readTries), [servers, setServers] = useState<string[]>([]);
  const seq = useRef(0);
  useEffect(() => { void api<Array<{ name: string }>>("/api/mcp").then((s) => setServers(s.map((x) => x.name))).catch(() => undefined); }, []);
  useEffect(() => {
    if (!text.trim()) { setResult(null); return; }
    const n = ++seq.current;
    const t = setTimeout(() => {
      const call = toCall(kind, text);
      void api<Explained>("/api/policy/explain", { body: { ...call, workspace: where.trim() || undefined } }).then((raw) => {
        if (n !== seq.current) return;
        // An older gateway answers without Autopilot's verdict or the paths; fall back rather than break the page.
        const r: Explained = { ...raw, autopilot: raw.autopilot ?? raw, kind: raw.kind ?? kind, paths: raw.paths ?? [], trail: raw.trail ?? [] };
        setResult(r); setError("");
        const next = [{ kind, text: text.trim(), verdict: r.verdict }, ...readTries().filter((x) => !(x.kind === kind && x.text === text.trim()))].slice(0, 6);
        try { localStorage.setItem(TRIES, JSON.stringify(next)); } catch { /* this view only */ } setTries(next);
      }, (e: Error) => { if (n === seq.current) setError(e.message); });
    }, 280);
    return () => clearTimeout(t);
  }, [kind, text, where]);
  const k = KINDS.find((x) => x.id === kind)!;
  const examples = kind === "connector" ? (servers.length ? servers.slice(0, 4).map((s) => `${s} search`) : ["notion search", "github create_issue"]) : k.examples;
  const sup = result ? VERDICT[result.verdict]! : null, auto = result ? VERDICT[result.autopilot.verdict]! : null;
  const voice = !result ? "" : result.verdict === "deny" ? "Shua can't do it either" : result.assistantMustAsk ? "Shua asks you out loud first" : result.verdict === "allow" ? "Shua just does it" : "Shua does it, and tells you";
  return <section className="cr-sheet pol-tester">
    <header className="cr-sheet-head"><h2>Why would this be allowed?</h2><small>live as you type · the same engine, guardrails and always-allows a real run uses · nothing runs</small></header>
    <div className="pol-kinds" role="group" aria-label="Kind of action">{KINDS.map(({ id, label, icon: Icon, placeholder }) => <button key={id} type="button" aria-pressed={kind === id} className={kind === id ? "is-on" : ""}
      onClick={() => { setKind(id); setText(id === "connector" ? (servers[0] ? `${servers[0]} search` : placeholder) : placeholder); }}><Icon size={14} />{label}</button>)}</div>
    <div className="pol-ask">
      <span className="pol-prompt" aria-hidden="true">{kind === "command" ? "$" : <k.icon size={14} />}</span>
      <input value={text} onChange={(e) => setText(e.target.value)} className="pol-input" aria-label={`${k.label} to explain`} placeholder={k.placeholder} spellCheck={false} />
      {text && <button type="button" className="pol-clear" onClick={() => setText("")} aria-label="Clear"><X size={13} /></button>}
    </div>
    <div className="pol-where"><span>Runs in</span><input value={where} onChange={(e) => setWhere(e.target.value)} placeholder={guard?.roots[0] ?? "~/Developer"} aria-label="Folder the action runs in" spellCheck={false} />
      <small>Edits inside this folder count as the run's own workspace.</small></div>
    <div className="pol-try">{examples.map((t) => <button key={t} type="button" className={t === text ? "is-on" : ""} onClick={() => setText(t)}>{t}</button>)}</div>
    {error && <p className="cr-error">{error}</p>}
    {result && sup && auto && <div className="pol-result" key={`${kind}:${text}:${result.rule}:${result.autopilot.rule}`}>
      <div className="pol-modes">
        <article className={`pol-mode is-${sup.tone}`}><small>Supervised session</small><strong>{sup.word}</strong><span>{sup.does}</span></article>
        <article className={`pol-mode is-${auto.tone}`}><small>Autopilot session</small><strong>{auto.word}</strong><span>{result.autopilot.verdict === result.verdict ? "same as Supervised" : auto.does}</span></article>
        <article className={`pol-mode is-voice is-${result.verdict === "deny" ? "bad" : result.assistantMustAsk ? "wait" : "ok"}`}><small>Shua, by voice</small><strong><Sparkles size={15} /></strong><span>{voice}</span></article>
      </div>
      <ol className="pol-path" aria-label="How the policy decided">
        <li><small>Kind</small><b>{result.kind}</b></li>
        <li><small>Layer</small><b>{result.layer}</b></li>
        <li><small>Rule</small><button type="button" className="mono" onClick={() => onRule(result.rule)} title="Show this rule">{result.rule}</button></li>
        <li className={`is-verdict is-${sup.tone}`}><small>Verdict</small><b>{sup.word}</b></li>
      </ol>
      <p className="pol-why">{result.reason.replace(/^./, (c) => c.toUpperCase())}<span> · {result.risk} risk</span></p>
      {result.paths.length > 0 && <p className="pol-paths">Touches {result.paths.slice(0, 4).map((p) => <code key={p}>{p}</code>)}</p>}
      {result.trail.length > 1 && <ul className="pol-trail" aria-label="What each layer said">{result.trail.map((t) => <li key={`${t.layer}-${t.rule}`} className={`is-${tone(t.verdict)}`}><b>{t.layer}</b><span>{t.verdict}</span><small>{t.rule}</small></li>)}</ul>}
      <div className="pol-result-actions">
        <button type="button" className="cr-btn" onClick={() => suggestToSpark(`In Policy & Audit I tested this ${k.label.toLowerCase()}: "${text.trim()}". It came out ${sup.word.toLowerCase()} (rule ${result.rule}: ${result.reason}). Explain in plain words why, what could go wrong if it ran, and whether I should add a protected folder or change how I work.`)}><Sparkles size={13} /> Ask Shua why</button>
      </div>
    </div>}
    {tries.length > 0 && <div className="pol-tries"><span>Recent</span>{tries.map((t) => <button key={`${t.kind}:${t.text}`} type="button" onClick={() => { setKind(t.kind); setText(t.text); }}><i className={`is-${tone(t.verdict)}`} />{t.text}</button>)}</div>}
  </section>;
}

/** The chain: the newest events as linked blocks with their hashes; Verify sends a seal down it. */
function Chain({ verify, verifying }: { verify: { ok: boolean; count: number } | null; verifying: boolean }) {
  const activity = useLive((s) => s.activity);
  const chain = activity.slice(-8).reverse();
  return <section className={`cr-sheet pol-chain${verifying ? " is-verifying" : ""}${verify && !verifying ? (verify.ok ? " is-ok" : " is-bad") : ""}`}>
    <header className="cr-sheet-head"><h2>Audit chain</h2><small>each event sealed to the one before</small></header>
    <ol className="pol-blocks">{chain.map((e, i) => <li key={e.seq} style={{ ["--i" as string]: i }}>
      <span className="pol-seal" aria-hidden="true" /><b>#{e.seq.toLocaleString()}</b><span className="pol-kind">{e.kind}</span>
      {e.hash && <code title={`SHA-256 ${e.hash}`}>{e.hash.slice(0, 8)}</code>}<time>{since(e.at)}</time>
    </li>)}</ol>
    <p className="pol-note">SHA-256 links every event to the one before it. Change, delete or reorder any of them and the chain breaks, and Verify names where.</p>
  </section>;
}
