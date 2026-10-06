import { SparkToday } from "../components/SparkToday";
import "./policy.css";
import type { Decision } from "@shuacrew/core/policy-types";
import { Button, Eyebrow, Panel, StatusGlyph, since } from "@shuacrew/ui";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { ACCENTS, PALETTES, resolvePalette, type Palette } from "../lib/appearance";
import { useLive } from "../lib/live";
import { ControlHeader, Readouts, type Tone } from "../components/ControlRoom";
import { PaneHeader } from "../components/Pane";
import { ShieldCheck } from "lucide-react";

export { Specs } from "./Specs";

function Page({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1440px] px-8 pb-12 pt-8">
        <PaneHeader eyebrow="System" icon={ShieldCheck} title={title} description={subtitle} />
        <div className="flex flex-col gap-5">{children}</div>
      </div>
    </div>
  );
}

/** Empty states teach: what this screen is for, and two or three ways to start. */
function Starter({ items }: { items: Array<{ title: string; detail: string; onClick?: () => void }> }) {
  return (
    <div className="grid grid-cols-3 gap-3 max-[900px]:grid-cols-1">
      {items.map((s) => (
        <button key={s.title} onClick={s.onClick} className="rounded-[var(--radius-l)] border border-dashed border-line-strong bg-panel p-4 text-left transition hover:border-amber">
          <div className="text-[13.5px] font-medium">{s.title}</div>
          <div className="mt-1.5 text-[12.5px] leading-relaxed text-fg-2">{s.detail}</div>
        </button>
      ))}
    </div>
  );
}

export { Integrations } from "./Integrations";

const TRY = ["git push --force origin main", "rm -rf ~/Developer", "curl https://get.example.sh | sh", "cat .env", "npm install left-pad", "git commit -am wip"];
export function Policy() {
  const [verify, setVerify] = useState<{ ok: boolean; count: number; brokenAt?: number; why?: string } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [command, setCommand] = useState(TRY[0]!);
  const [explained, setExplained] = useState<Decision | null>(null);
  const activity = useLive((s) => s.activity);
  const explain = async (c = command) => { setCommand(c); setExplained(await api<Decision>("/api/policy/explain", { body: { tool: "Bash", input: { command: c } } })); };
  // Verifying walks the whole chain on the gateway; the seal sweep runs at least once so you can see it happen.
  const runVerify = async () => {
    setVerifying(true);
    const started = Date.now();
    try { const v = await api<NonNullable<typeof verify>>("/api/audit/verify"); await new Promise((r) => setTimeout(r, Math.max(0, 900 - (Date.now() - started)))); setVerify(v); }
    catch { /* the badge keeps the last result */ }
    finally { setVerifying(false); }
  };
  const [rules, setRules] = useState<Array<{ id: string; description: string; verdict: "allow" | "ask" | "deny"; risk: string }> | null>(null), [ruleFilter, setRuleFilter] = useState("");
  useEffect(() => { void explain(); void api<typeof verify>("/api/audit/verify").then(setVerify).catch(() => {}); void api<NonNullable<typeof rules>>("/api/policy/rules").then(setRules).catch(() => setRules([])); }, []);
  // Real decisions, newest first: what the policy decided on its own, and what you decided when it asked.
  const decisions = useMemo(() => activity.filter((e) => e.kind === "policy.decided" || e.kind === "approval.decided").slice(-40).reverse(), [activity]);
  const asked = useMemo(() => new Map(activity.filter((e) => e.kind === "approval.requested").map((e) => { const b = e.body as { id: string; tool: string }; return [b.id, b.tool]; })), [activity]);
  const counts = useMemo(() => { const c = { allow: 0, deny: 0, ask: 0, you: 0 }; for (const e of activity) { if (e.kind === "policy.decided") c[(e.body as { verdict: "allow" | "deny" | "ask" }).verdict]++; if (e.kind === "approval.decided") c.you++; } return c; }, [activity]);
  const tone = (v?: string) => (v === "allow" ? "ok" : v === "deny" ? "bad" : "wait");
  const chain = activity.slice(-7).reverse();
  const status: { text: string; tone: Tone } = !verify ? { text: "Checking the audit chain…", tone: "idle" }
    : !verify.ok ? { text: `The audit chain is broken at #${verify.brokenAt}${verify.why ? `: ${verify.why}` : ""}.`, tone: "bad" }
    : { text: [`Audit chain intact across ${verify.count.toLocaleString()} events`, counts.deny ? `${counts.deny} blocked recently` : "nothing blocked recently", counts.ask ? `${counts.ask} asked you` : null].filter(Boolean).join(" · "), tone: "ok" };
  return (
    <div className="cr-scroll"><div className="cr-page pol">
      <ControlHeader title="Policy & Audit" kicker={<><ShieldCheck size={13} /> Tools</>} status={status.text} tone={status.tone}>
        <button type="button" className="cr-btn" onClick={() => void runVerify()} disabled={verifying}><ShieldCheck size={14} /> {verifying ? "Verifying…" : "Verify chain"}</button>
      </ControlHeader>
      <Readouts items={[
        { label: "Allowed by policy", value: counts.allow, sub: "ran without asking" },
        { label: "Asked you", value: counts.ask, tone: counts.ask ? "wait" : undefined, dim: !counts.ask, sub: `${counts.you} decided by you` },
        { label: "Blocked", value: counts.deny, tone: counts.deny ? "bad" : undefined, dim: !counts.deny, sub: counts.deny ? "the policy said no" : "nothing blocked" },
        { label: "Audit chain", value: !verify ? "…" : verify.ok ? "Intact" : "Broken", tone: !verify ? undefined : verify.ok ? "ok" : "bad", sub: verify ? `${verify.count.toLocaleString()} events sealed` : "checking" },
      ]} />
      <div className="cr-row is-wide-left">
        <section className="cr-sheet pol-tester">
          <header className="cr-sheet-head"><h2>Why would this be allowed?</h2><small>try any command; nothing runs</small></header>
          <div className="pol-ask">
            <span className="pol-prompt" aria-hidden="true">$</span>
            <input value={command} onChange={(e) => setCommand(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void explain()} className="pol-input" aria-label="Command to explain" spellCheck={false} />
            <button type="button" className="cr-btn is-primary" onClick={() => void explain()}>Explain</button>
          </div>
          <div className="pol-try">{TRY.map((t) => <button key={t} type="button" className={t === command ? "is-on" : ""} onClick={() => void explain(t)}>{t}</button>)}</div>
          {explained && <div className={`pol-verdict is-${tone(explained.verdict)}`} key={`${command}-${explained.rule}`}>
            <ol className="pol-path" aria-label="How the policy decided">
              <li><small>Tool</small><b>Bash</b></li>
              <li><small>Layer</small><b>{explained.layer}</b></li>
              <li><small>Rule</small><b className="mono">{explained.rule}</b></li>
              <li className="is-verdict"><small>Verdict</small><b>{explained.verdict}</b></li>
            </ol>
            <p>{explained.reason}<span> · risk {explained.risk}</span></p>
            {explained.trail.length > 1 && <ul className="pol-trail" aria-label="What each layer said">{explained.trail.map((t) => <li key={`${t.layer}-${t.rule}`} className={`is-${tone(t.verdict)}`}><b>{t.layer}</b><span>{t.verdict}</span><small>{t.rule}</small></li>)}</ul>}
          </div>}
        </section>
        <section className={`cr-sheet pol-chain${verifying ? " is-verifying" : ""}${verify && !verifying ? (verify.ok ? " is-ok" : " is-bad") : ""}`}>
          <header className="cr-sheet-head"><h2>Audit chain</h2><small>each event sealed to the one before</small></header>
          <ol className="pol-blocks">{chain.map((e, i) => <li key={e.seq} style={{ ["--i" as string]: i }}>
            <span className="pol-seal" aria-hidden="true" />
            <b>#{e.seq.toLocaleString()}</b><span className="pol-kind">{e.kind}</span>
            {e.hash && <code title={`SHA-256 ${e.hash}`}>{e.hash.slice(0, 8)}</code>}
            <time>{since(e.at)}</time>
          </li>)}</ol>
          <p className="pol-note">SHA-256 links every event to the one before it. Change, delete or reorder any of them and the chain breaks, and Verify names where.</p>
        </section>
      </div>
      <div className="cr-row is-wide-left">
        <section className="cr-sheet pol-decisions">
          <header className="cr-sheet-head"><h2>Decisions</h2><small>every allow, ask and block, newest first</small></header>
          {decisions.length === 0 && <p className="cr-muted">Decisions appear here as your crew works: every tool call the policy allowed, asked about or blocked, and what you decided.</p>}
          <div className="pol-list">{decisions.map((e) => { const b = e.body as { tool?: string; verdict?: string; rule?: string; reason?: string; allow?: boolean; by?: string }; const v = e.kind === "approval.decided" ? (b.allow ? "allow" : "deny") : b.verdict;
            return <div key={e.seq} className="pol-row"><StatusGlyph tone={tone(v)} /><span className="pol-row-main"><b>{e.kind === "approval.decided" ? `${b.by === "timeout" ? "Timed out:" : `${b.by?.startsWith("you") ? "You" : "Policy"} ${b.allow ? "allowed" : "denied"}`} ${toolPhrase(asked.get((b as { id?: string }).id ?? ""))}` : toolPhrase(b.tool)}</b><small>{e.kind === "approval.decided" ? (b.by === "timeout" ? "timed out" : `decided ${b.by?.includes("(") ? b.by.slice(b.by.indexOf("(") + 1, -1) : "in the app"}`) : `${b.rule} · ${b.reason}`}</small></span><span className="pol-when">{since(e.at)}</span></div>; })}</div>
        </section>
        <SparkToday />
      </div>
      <section className="cr-sheet pol-rules">
        <header className="cr-sheet-head"><h2>The rules</h2><small>{rules ? `${rules.length} rules · the tightest one wins, and every decision names it` : "reading…"}</small>
          <div className="cr-sheet-actions"><input className="cr-search" type="search" placeholder="Filter rules…" aria-label="Filter rules" value={ruleFilter} onChange={(e) => setRuleFilter(e.target.value)} /></div></header>
        {rules && !rules.length ? <p className="cr-muted">Couldn't read the rules from the gateway.</p> : <div className="pol-rule-cols">
          {(["deny", "ask", "allow"] as const).map((v) => { const list = (rules ?? []).filter((r) => r.verdict === v && `${r.id} ${r.description}`.toLowerCase().includes(ruleFilter.trim().toLowerCase()));
            return <div key={v} className={`pol-rule-col is-${tone(v)}`}><h3>{v === "deny" ? "Blocks" : v === "ask" ? "Asks you first" : "Allows"}<em>{list.length}</em></h3>
              {list.length ? <ul>{list.map((r) => <li key={r.id}><span>{r.description.replace(/^./, (c) => c.toUpperCase())}</span><small><code>{r.id}</code> · {r.risk} risk</small></li>)}</ul> : <p className="cr-muted">None{ruleFilter ? " match" : ""}.</p>}
            </div>; })}
        </div>}
      </section>
    </div></div>
  );
}

interface RuntimeRow {
  id: string;
  label: string;
  authMode: string;
  status: { installed: boolean; signedIn: boolean | null; account?: string; version?: string; detail: string; overridingKeys: string[];
    accounts?: Array<{ dir: string; email?: string; plan?: string; signedIn: boolean; limitedUntil: number }> };
  limitedUntil: number | null;
}

export function RuntimeSettings() {
  const [runtimes, setRuntimes] = useState<RuntimeRow[]>([]);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState("");
  // A Terminal window opens to sign the new account in; "Test connections" afterwards picks it up.
  const addAccount = async () => {
    try { setAdding((await api<{ login: string }>("/api/runtimes/claude/accounts", { body: {} })).login); }
    catch (e) { setError((e as Error).message); }
  };
  const test = async () => {
    setTesting(true);
    setError("");
    try {
      setRuntimes(await api<RuntimeRow[]>("/api/runtimes?fresh=1"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTesting(false);
    }
  };
  useEffect(() => {
    void test();
  }, []);
  return (
      <Panel className="p-5">
        <div className="mb-3 flex items-center">
          <Button size="s" className="ml-auto" onClick={() => void test()} disabled={testing}>
            {testing ? "Testing…" : "Test connections"}
          </Button>
        </div>
        {error && <p role="alert" className="text-bad">{error}</p>}
        {!testing && !error && !runtimes.length && <p>No runtimes available.</p>}
        <div className="divide-y divide-line">
          {runtimes.map((r) => (
            <div key={r.id} className="flex items-center gap-3 py-2.5 text-[13px]">
              <StatusGlyph tone={!r.status.installed ? "bad" : r.limitedUntil ? "live" : r.status.signedIn === false ? "bad" : r.status.signedIn === null ? "wait" : "ok"} />
              <span className="w-40 font-medium">{r.label}</span>
              <span className="mono w-28 text-[12px] text-fg-2">{r.authMode}</span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-fg-2">
                {r.status.account ? `${r.status.account} · ` : ""}
                {r.status.detail}
              </span>
              {r.status.overridingKeys.length > 0 && <span className="text-[12px] text-bad">{r.status.overridingKeys.join(", ")} would override your plan</span>}
              {r.id === "claude" && r.authMode === "subscription" && <Button size="s" onClick={() => void addAccount()}>Add account</Button>}
            </div>
          ))}
        </div>
        {runtimes.find((r) => r.id === "claude")?.status.accounts?.map((a) => (
          <div key={a.dir || "default"} className="flex items-center gap-3 py-1.5 pl-6 text-[12px] text-fg-2">
            <StatusGlyph tone={!a.signedIn ? "bad" : a.limitedUntil ? "live" : "ok"} />
            <span className="w-56 truncate">{a.email ?? "not signed in"}</span>
            <span className="mono w-16">{a.plan ?? "—"}</span>
            <span className="min-w-0 flex-1 truncate">
              {!a.signedIn ? `sign in: CLAUDE_CONFIG_DIR=${a.dir} claude auth login` : a.limitedUntil ? `at its limit until ${new Date(a.limitedUntil).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "ready"}
            </span>
          </div>
        ))}
        {adding && <p className="mt-2 text-[12px] text-fg-2">Sign in to your other Claude account in the Terminal window that opened (<code className="mono">{adding}</code>), then press Test connections.</p>}
      </Panel>
  );
}

/** Encrypted nightly backups: when the last one ran, where they are, and how to restore. */
export function BackupsPanel() {
  const [info, setInfo] = useState<{ destination: string; last: { file: string; bytes: number; at: number; error?: string } | null; files: Array<{ file: string; bytes: number; at: number }> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showRestore, setShowRestore] = useState(false);
  const load = () => void api<typeof info>("/api/backups").then(setInfo).catch((e: Error) => setError(e.message));
  useEffect(load, []);
  const now = async () => {
    setBusy(true);
    setError("");
    try {
      await api("/api/backups", { body: {} });
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!info) return <Panel className="p-5"><p role="status">{error || "Loading backups…"}</p></Panel>;
  const last = info.last;
  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n > 10 * 1024 * 1024 ? 0 : 1)} MB`;
  const ago = (at: number) => {
    const h = (Date.now() - at) / 3_600_000;
    return h < 1 ? `${Math.max(1, Math.round(h * 60))} min ago` : h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} days ago`;
  };
  const where = info.destination.replace(/^.*Mobile Documents\/com~apple~CloudDocs/, "iCloud Drive").replace(/^\/Users\/[^/]+/, "~");
  return (
    <Panel className="p-5">
      <div className="mb-3 flex items-center gap-3">
        {last && <StatusGlyph tone={last.error ? "bad" : Date.now() - last.at < 36 * 3_600_000 ? "ok" : "wait"} />}
        <span className="text-[12.5px] text-fg-2">
          {!last ? "No backup yet — the first runs tonight at 2:30." : last.error ? `The last backup failed: ${last.error}` : `Last backup ${ago(last.at)} · ${mb(last.bytes)}`}
        </span>
        <Button size="s" className="ml-auto" onClick={() => void now()} disabled={busy}>
          {busy ? "Backing up…" : "Back up now"}
        </Button>
      </div>
      <p className="max-w-[760px] text-[12.5px] leading-relaxed text-fg-3">
        Every night at 2:30: your whole history, Library, skills, sites and keys — encrypted (AES-256) with a passphrase kept in your macOS Keychain, saved to <span className="text-fg-2">{where}</span>. The latest 14 are kept.
      </p>
      {error && <div className="mt-2 text-[12px] text-bad">{error}</div>}
      <button className="mt-3 text-[12px] text-fg-3 hover:text-fg" onClick={() => setShowRestore((v) => !v)}>
        {showRestore ? "Hide" : "How to restore"} ↓
      </button>
      {showRestore && (
        <pre className="mono mt-2 overflow-x-auto whitespace-pre rounded-[10px] border border-line bg-sunken p-3 text-[11.5px] leading-relaxed text-fg-2">
          {`mkdir -p ~/shuacrew-restore
security find-generic-password -s ShuaCrew-backup -w \\
  | openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass stdin \\
      -in "${info.files[0]?.file ?? "<backup file>"}" \\
  | tar xz -C ~/shuacrew-restore
# then: pnpm service uninstall, move ~/shuacrew-restore/* into ~/.shuacrew, pnpm service install`}
        </pre>
      )}
    </Panel>
  );
}

/** Whether the gateway runs as the login service — so work continues with the window closed. */
export function AlwaysOn() {
  const [health, setHealth] = useState<{ service?: boolean; pid?: number; uptimeS?: number } | null>(null);
  useEffect(() => {
    const load = () => void api<{ service?: boolean; pid?: number; uptimeS?: number }>("/api/health").then(setHealth).catch(() => setHealth(null));
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, []);
  const up = health?.uptimeS ?? 0;
  const since = up < 3600 ? `${Math.max(1, Math.round(up / 60))} min` : up < 86400 ? `${Math.round(up / 3600)} h` : `${Math.round(up / 86400)} days`;
  return (
    <Panel className="p-5">
      <div className="mb-3 flex items-center gap-3">
        {health && <StatusGlyph tone={health.service ? "ok" : "wait"} />}
        <span className="text-[12.5px] text-fg-2">
          {!health ? "Checking…" : health.service ? `On — starts at login and restarts itself. Up ${since}.` : `Off — the gateway runs only while something started it (up ${since}).`}
        </span>
      </div>
      <p className="max-w-[720px] text-[12.5px] leading-relaxed text-fg-3">
        With it on, playbooks, schedules, heartbeats and revenue syncs keep going when the window is closed, and after a restart. It runs as you, on this Mac only, with your agents' subscriptions — no keys, nothing listening beyond 127.0.0.1.
      </p>
      <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
        {(health?.service ? ["pnpm service status", "pnpm service restart", "pnpm service logs", "pnpm service uninstall"] : ["pnpm service install"]).map((c) => (
          <code key={c} className="mono rounded-[7px] border border-line bg-sunken px-2 py-1 text-fg-2">
            {c}
          </code>
        ))}
      </div>
    </Panel>
  );
}

/** Pick a look: each card is a small, true-to-palette picture of the app. */
export function Appearance() {
  const appearance = useLive((s) => s.appearance);
  const set = useLive((s) => s.setAppearance);
  const active = resolvePalette(appearance);
  const follow = appearance.palette === "system";
  return (
    <Panel className="p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Eyebrow>Appearance</Eyebrow>
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-[12.5px] text-fg-2">
          <input type="checkbox" checked={follow} onChange={(e) => set({ palette: e.target.checked ? "system" : active.id })} className="accent-[var(--amber)]" />
          Follow system — {PALETTES.find((p) => p.id === appearance.dark)?.name} at night, {PALETTES.find((p) => p.id === appearance.light)?.name} by day
        </label>
      </div>
      {(["dark", "light"] as const).map((mode) => (
        <div key={mode} className="mb-5">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-3">{mode === "dark" ? "Dark" : "Light"}</div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3" role="radiogroup" aria-label={`${mode} themes`}>
            {PALETTES.filter((p) => p.mode === mode).map((p) => {
              const selected = follow ? appearance[mode] === p.id : active.id === p.id;
              return (
                <button
                  key={p.id}
                  role="radio"
                  aria-checked={selected}
                  onClick={() => set(follow ? { [mode]: p.id } : { palette: p.id })}
                  className={`theme-card ${selected ? "is-selected" : ""}`}
                >
                  <ThemePreview palette={p} accent={ACCENTS.find((a) => a.id === appearance.accent)![p.mode]} />
                  <span className="mt-2 flex items-center justify-between px-0.5">
                    <span className="text-[12.5px] font-medium text-fg">{p.name}</span>
                    {selected && <span className="h-2 w-2 rounded-full bg-amber" />}
                  </span>
                  <span className="block px-0.5 text-left text-[11.5px] text-fg-3">{p.blurb}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-3">Accent</div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Accent colour">
        {ACCENTS.map((a) => (
          <button key={a.id} role="radio" aria-checked={appearance.accent === a.id} onClick={() => set({ accent: a.id })} className={`accent-pill ${appearance.accent === a.id ? "is-selected" : ""}`}>
            <span className="h-3.5 w-3.5 rounded-full" style={{ background: a[active.mode], boxShadow: "inset 0 0 0 1px rgba(128,128,128,.35)" }} />
            {a.name}
          </button>
        ))}
      </div>
    </Panel>
  );
}

/** A miniature of the app in a palette: rail, sessions, a thread, the composer. */
function ThemePreview({ palette, accent }: { palette: Palette; accent: string }) {
  const [win, panel, raised, text] = palette.swatch;
  const faint = palette.mode === "dark" ? "rgba(255,255,255,.14)" : "rgba(0,0,0,.12)";
  return (
    <svg viewBox="0 0 168 100" className="block w-full rounded-[8px]" aria-hidden>
      <rect width="168" height="100" fill={win} />
      <rect x="4" y="4" width="10" height="92" rx="3" fill={panel} />
      <circle cx="9" cy="11" r="2.2" fill={accent} />
      <rect x="18" y="4" width="42" height="92" rx="4" fill={panel} />
      <rect x="22" y="9" width="20" height="3" rx="1.5" fill={text} opacity=".8" />
      <rect x="21" y="16" width="36" height="14" rx="3" fill={raised} />
      <rect x="24" y="19" width="26" height="2.5" rx="1.2" fill={text} opacity=".7" />
      <rect x="24" y="24" width="18" height="2.5" rx="1.2" fill={accent} opacity=".9" />
      <rect x="21" y="33" width="36" height="12" rx="3" fill={faint} opacity=".35" />
      <rect x="64" y="4" width="100" height="92" rx="4" fill={panel} />
      <rect x="120" y="11" width="38" height="9" rx="4.5" fill={raised} />
      <rect x="70" y="25" width="70" height="3" rx="1.5" fill={text} opacity=".75" />
      <rect x="70" y="31" width="56" height="3" rx="1.5" fill={text} opacity=".45" />
      <rect x="70" y="39" width="88" height="14" rx="4" fill={raised} stroke={faint} strokeWidth=".6" />
      <circle cx="76" cy="46" r="2" fill={accent} />
      <rect x="81" y="44.8" width="40" height="2.5" rx="1.2" fill={text} opacity=".6" />
      <rect x="70" y="76" width="88" height="14" rx="5" fill={win} stroke={faint} strokeWidth=".6" />
      <circle cx="151" cy="83" r="4" fill={accent} />
    </svg>
  );
}

/** A tool as a person would say it: "a command", not "commandExecution". */
export function toolPhrase(tool: string | undefined): string {
  if (!tool) return "a tool call";
  if (/^(Bash|shell|commandExecution)$/i.test(tool)) return "a command";
  if (/^(Edit|Write|MultiEdit|NotebookEdit|apply_patch|fileChange)$/.test(tool)) return "a file edit";
  if (/^(Read|Grep|Glob|LS)$/.test(tool)) return "a file read";
  if (/^(WebFetch|WebSearch)$/.test(tool)) return "a web lookup";
  const mcp = /^mcp__([^_]+)__(.+)$/.exec(tool); if (mcp) return `${mcp[1]}: ${mcp[2]!.replace(/[-_]/g, " ")}`;
  return tool;
}
