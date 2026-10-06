import { Button } from "@shuacrew/ui";
import { BookOpen, Check, ChevronDown, Cloud, Download, Eye, Globe, KeyRound, Loader2, Lock, PenLine, Plug, Plus, RefreshCw, Search, Sparkles, Terminal, Trash2, Wrench, X, Cable } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Markdown } from "../components/Markdown";
import { api } from "../lib/api";
import { isMac, pickFolder } from "../lib/native";
import { BrandIcon } from "../components/ToolActivityCard";
import { ControlHeader, Seg, type Tone } from "../components/ControlRoom";
import "./tools-skills.css";
import { commandArguments } from "../lib/integration-setup";

interface Server {
  id: string;
  name: string;
  command?: string;
  args: string[];
  url?: string;
  auth: "none" | "oauth";
  signedIn: boolean;
  spark?: boolean;
  brand?: { assetId: string | null; publisher: "official" | "community" | "unknown" };
}
interface Tool {
  name: string;
  title?: string;
  description: string;
  readOnly?: boolean;
  destructive?: boolean;
}
interface Connection {
  ok: boolean;
  server?: { name: string; version: string };
  tools: Tool[];
  error?: string;
  at: number;
}
interface Featured {
  id: string;
  name: string;
  title: string;
  category: string;
  blurb: string;
  url?: string;
  command?: string;
  auth: "none" | "oauth";
  asksForFolder?: boolean;
  added: string | null;
  brand?: { assetId: string | null; publisher: "official" | "community" | "unknown" };
}
interface RegistryCard {
  id: string;
  title: string;
  description: string;
  kind: "command" | "remote";
  command?: string;
  args: string[];
  url?: string;
  auth: "none" | "oauth";
}
interface SkillInfo {
  name: string;
  description: string;
  files: number;
  bytes: number;
  source: "catalog" | "yours" | "learned";
}
interface CatalogSkill {
  name: string;
  description: string;
  files: number;
  installed: boolean;
}

const CATEGORIES = ["Build", "Ship", "Business", "Work", "Research"];
type Summary = { text: string; tone: Tone };

/** Tools (MCP servers) and skills: what your agents can reach, and what they know how to do. */
export function Integrations() {
  const [tab, setTab] = useState<"tools" | "skills">(() => (location.hash === "#skills" ? "skills" : "tools"));
  const [summary, setSummary] = useState<Summary>({ text: "Reading your connections…", tone: "idle" });
  useEffect(() => history.replaceState(null, "", `#${tab}`), [tab]);
  return (
    <div className="cr-scroll">
      <div className="cr-page tk">
        <ControlHeader title="Tools & Skills" kicker={<><Cable size={13} /> Tools</>} status={summary.text} tone={summary.tone}>
          <Seg label="Show" value={tab} onChange={(v) => { setTab(v); setSummary({ text: "Reading…", tone: "idle" }); }} options={[["tools", "Tools"], ["skills", "Skills"]] as const} />
        </ControlHeader>
        {tab === "tools" ? <Tools onSummary={setSummary} /> : <SkillsTab onSummary={setSummary} />}
      </div>
    </div>
  );
}

// ── tools ────────────────────────────────────────────────────────────────────────────────

function Tools({ onSummary }: { onSummary: (s: Summary) => void }) {
  const [servers, setServers] = useState<Server[]>([]);
  const [featured, setFeatured] = useState<Featured[]>([]);
  const [known, setKnown] = useState<Record<string, Connection>>({});
  const [error, setError] = useState("");
  const [custom, setCustom] = useState(false);
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState(false);
  const load = async () => {
    const [s, f, k] = await Promise.all([api<Server[]>("/api/mcp"), api<Featured[]>("/api/mcp/featured"), api<Record<string, Connection>>("/api/mcp/tools")]);
    setServers(s);
    setFeatured(f);
    setKnown(k);
    setLoaded(true);
  };
  useEffect(() => void load().catch((e: Error) => setError(e.message)), []);
  useEffect(() => {
    if (error && !loaded) return onSummary({ text: `Couldn't read your connections: ${error}`, tone: "bad" });
    if (!loaded) return;
    const waiting = servers.filter((s) => s.auth === "oauth" && !s.signedIn).length, broken = servers.filter((s) => known[s.id] && !known[s.id]!.ok).length;
    const voice = servers.filter((s) => s.spark).length, tools = servers.reduce((n, s) => n + (known[s.id]?.ok ? known[s.id]!.tools.length : 0), 0);
    onSummary(!servers.length ? { text: "Nothing connected yet. Add a tool below and your agents can reach it.", tone: "idle" }
      : broken ? { text: `${broken} connection${broken === 1 ? " is" : "s are"} failing its last check.`, tone: "bad" }
      : waiting ? { text: `${waiting} connection${waiting === 1 ? " needs" : "s need"} you to sign in.`, tone: "wait" }
      : { text: [`${servers.length} connection${servers.length === 1 ? "" : "s"}`, tools ? `${tools} tools found at last check` : null, voice ? `Shua can use ${voice} by voice` : null].filter(Boolean).join(" · "), tone: "ok" });
  }, [loaded, servers, known, error, onSummary]);

  const add = async (f: Featured) => {
    setError("");
    try {
      let folder: string | undefined;
      if (f.asksForFolder) {
        folder = (isMac() ? await pickFolder() : window.prompt("Folder it may read and write", "~/Developer/projects")) ?? undefined;
        if (!folder) return;
      }
      const server = await api<Server>(`/api/mcp/featured/${f.id}`, { body: { folder } });
      if (f.auth === "oauth" && !server.signedIn) await api(`/api/mcp/${server.id}/signin`, { body: {} });
      await load();
    } catch (e) {
      setError((e as Error).message);
      await load().catch(() => undefined);
    }
  };
  const categories = ["All", ...CATEGORIES.filter((c) => featured.some((f) => f.category === c))];
  const q = query.trim().toLowerCase();
  const shown = featured.filter((f) => (category === "All" || f.category === category) && (!q || `${f.title} ${f.blurb} ${f.name}`.toLowerCase().includes(q)));

  return (
    <>
      {error && <p className="cr-error" role="alert">{error}</p>}
      <section className="cr-sheet">
        <header className="cr-sheet-head">
          <h2>Your connections</h2><small>{servers.length ? "checks run only when you ask" : ""}</small>
          <div className="cr-sheet-actions"><button type="button" className="cr-btn" onClick={() => setCustom(true)}><Plus size={13} /> Add your own</button></div>
        </header>
        {servers.length ? <>
          <div className="tk-grid">
            {servers.map((s) => (
              <ServerRow key={s.id} server={s} initial={known[s.id]} onChange={() => void load().catch((e: Error) => setError(e.message))} />
            ))}
          </div>
          <p className="cr-muted tk-note"><Sparkles size={12} /> Shua may use a connection marked <b>Voice</b> by voice without asking. Crew sessions get every connection, and your policy still decides what runs.</p>
        </> : <p className="cr-muted">{loaded ? "No connections yet. Pick a tool below or add your own, then check it to see what it can do." : "Reading…"}</p>}
      </section>

      <section className="cr-sheet">
        <header className="cr-sheet-head">
          <h2>Add a tool</h2><small>{shown.length} of {featured.length}</small>
          <div className="cr-sheet-actions"><label className="tk-search"><Search size={13} /><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a tool…" aria-label="Find a tool" /></label></div>
        </header>
        <div className="tk-cats" role="group" aria-label="Category">{categories.map((c) => <button key={c} type="button" aria-pressed={category === c} className={category === c ? "is-on" : ""} onClick={() => setCategory(c)}>{c}<small>{c === "All" ? featured.length : featured.filter((f) => f.category === c).length}</small></button>)}</div>
        {shown.length ? <div className="tk-grid is-gallery">{shown.map((f) => <FeaturedCard key={f.id} item={f} onAdd={() => add(f)} />)}</div>
          : <p className="cr-muted">{featured.length ? "Nothing here matches. Try the registry below." : "Reading the catalog…"}</p>}
        <Registry onAdded={() => void load().catch((e: Error) => setError(e.message))} installed={new Set(servers.map((s) => s.name))} />
      </section>

      {custom && <CustomServer onClose={() => setCustom(false)} onAdded={() => void load().catch((e: Error) => setError(e.message))} />}
    </>
  );
}

function monogram(name: string) {
  return name.replace(/[^a-z0-9]/gi, "").slice(0, 1).toUpperCase() || "M";
}
/** A tile for tools without a brand mark: its initial on a colour of its own, so the gallery isn't grey squares. */
function Monogram({ name }: { name: string }) {
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 17);
  return <span className="tk-mono" style={{ ["--h" as string]: hue }}>{monogram(name)}</span>;
}

function FeaturedCard({ item, onAdd }: { item: Featured; onAdd: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <article className={`tk-card ${item.added ? "is-added" : ""}`}>
      <div className="tk-card-top">
        <span className="tk-icon"><BrandIcon assetId={item.brand?.assetId} fallback={<Monogram name={item.title} />} /></span>
        <div className="tk-card-text"><b>{item.title}</b><p>{item.blurb}</p></div>
      </div>
      <footer>
        <span className="tk-tag">
          {item.auth === "oauth" ? <KeyRound size={11} /> : item.url ? <Cloud size={11} /> : <Terminal size={11} />}
          {item.auth === "oauth" ? "Sign in" : item.url ? "Hosted" : "Runs on this Mac"}
        </span>
        {item.added ? <span className="tk-added"><Check size={13} /> Added</span>
          : <button type="button" className="cr-btn" disabled={busy} onClick={() => (setBusy(true), void onAdd().finally(() => setBusy(false)))}>
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} {busy && item.auth === "oauth" ? "Signing in…" : "Add"}
          </button>}
      </footer>
    </article>
  );
}

const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60_000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };

function ServerRow({ server, initial, onChange }: { server: Server; initial?: Connection; onChange: () => void }) {
  const [conn, setConn] = useState<Connection | undefined>(initial);
  const [testing, setTesting] = useState(false);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [sparkConfirm, setSparkConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setConn(initial), [initial]);
  const act = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try { await work(); onChange(); } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  };
  const test = async (fresh = true) => {
    setTesting(true);
    setError("");
    try {
      setConn(await api<Connection>(`/api/mcp/${server.id}/tools${fresh ? "?fresh=1" : ""}`));
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setTesting(false);
    }
  };
  // Discovery may launch a local process or contact a server. Only an explicit
  // connection check may do that; merely viewing saved integrations must not.
  const needsSignIn = server.auth === "oauth" && (!server.signedIn || conn?.error === "needs sign-in");
  const state: { text: string; tone: Tone } = testing ? { text: "Connecting…", tone: "live" } : needsSignIn ? { text: "Needs sign-in", tone: "wait" }
    : conn?.ok ? { text: `${conn.tools.length} tool${conn.tools.length === 1 ? "" : "s"}`, tone: "ok" } : conn ? { text: "Can't connect", tone: "bad" } : { text: "Not checked", tone: "idle" };
  const trust = server.brand?.publisher === "official" ? "Official endpoint" : server.brand?.publisher === "community" ? "Community connector" : "Unverified publisher";
  const access = server.auth === "none" ? "no sign-in" : server.signedIn ? "signed in" : "not signed in";
  return (
    <article className={`tk-conn is-${state.tone}${open ? " is-open" : ""}`}>
      <header>
        <span className="tk-icon"><BrandIcon assetId={server.brand?.assetId} fallback={<Monogram name={server.name} />} /></span>
        <div className="tk-card-text"><b>{server.name}{conn?.server && <small> v{conn.server.version}</small>}</b><small>{trust} · {access}{conn ? ` · checked ${ago(conn.at)}` : ""}</small></div>
        <span className={`cr-pill is-${state.tone}`} title={conn && !conn.ok ? conn.error : undefined}>{state.text}</span>
      </header>
      <code className="tk-endpoint" title={server.url ?? [server.command, ...server.args].join(" ")}>{server.url ?? [server.command, ...server.args].join(" ")}</code>
      <footer>
        {needsSignIn ? (
          <button type="button" className="cr-btn is-primary" disabled={busy || testing} onClick={() => void act(async () => { await api(`/api/mcp/${server.id}/signin`, { body: {} }); await test(); })}><KeyRound size={13} /> {busy ? "Working…" : "Sign in"}</button>
        ) : (
          <button type="button" className="cr-btn" disabled={busy || testing} onClick={() => void test()}><RefreshCw size={13} className={testing ? "animate-spin" : ""} /> Check</button>
        )}
        {conn?.ok && conn.tools.length > 0 && <button type="button" className="cr-btn" aria-expanded={open} onClick={() => setOpen((v) => !v)}><Wrench size={13} /> Tools <ChevronDown size={12} className={`transition ${open ? "rotate-180" : ""}`} /></button>}
        <button type="button" className={`tk-voice${server.spark ? " is-on" : ""}`} role="switch" aria-checked={!!server.spark} disabled={busy || testing}
          title={server.spark ? "Shua can use these tools by voice, without asking. Click to stop." : "Let Shua (the notch) use these tools by voice, without asking. Each one adds a little to Shua's first word."}
          onClick={() => server.spark ? void act(() => api(`/api/mcp/${server.id}/spark`, { body: { on: false } })) : setSparkConfirm(true)}>
          <i aria-hidden="true" /> Voice
        </button>
        <span className="tk-spacer" />
        {confirm ? <>
          <button type="button" className="cr-btn tk-danger" disabled={busy || testing} onClick={() => void act(() => api(`/api/mcp/${server.id}`, { method: "DELETE" }))}>Remove</button>
          <button type="button" className="cr-btn" onClick={() => setConfirm(false)}>Keep</button>
        </> : <button type="button" className="tk-icon-btn" title="Remove" aria-label={`Remove ${server.name}`} onClick={() => setConfirm(true)}><Trash2 size={14} /></button>}
      </footer>
      {error && <p role="alert" className="tk-error">{error}</p>}
      {sparkConfirm && <div className="tk-confirm">
        <p>Let Shua use {server.name}’s tools by voice without asking? This is separate from what crew sessions can use.</p>
        <div><button type="button" className="cr-btn is-primary" disabled={busy} onClick={() => void act(async () => { await api(`/api/mcp/${server.id}/spark`, { body: { on: true } }); setSparkConfirm(false); })}>Allow</button><button type="button" className="cr-btn" disabled={busy} onClick={() => setSparkConfirm(false)}>Cancel</button></div>
      </div>}
      <AnimatePresence initial={false}>
        {open && conn?.ok && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <ul className="tk-tools">
              {conn.tools.map((t) => (
                <li key={t.name}>
                  <span><code>{t.name}</code>{t.readOnly && <em title="Server-provided hint, not a permission guarantee">read-only</em>}{t.destructive && <em className="is-bad" title="Server-provided hint; policy still applies">destructive</em>}</span>
                  {t.description && <p>{t.description}</p>}
                </li>
              ))}
            </ul>
            <p className="tk-fine">Agents call these as <code>mcp__{server.name}__…</code>. Server hints are advisory; your policy and approvals decide what runs.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
}

function Registry({ onAdded, installed }: { onAdded: () => void; installed: Set<string> }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cards, setCards] = useState<RegistryCard[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    let current = true;
    setLoading(true);
    setError("");
    const timer = setTimeout(() => void api<RegistryCard[]>(`/api/mcp/catalog?q=${encodeURIComponent(query)}`).then((results) => { if (current) setCards(results); }).catch((failure: Error) => { if (current) { setCards([]); setError(failure.message); } }).finally(() => { if (current) setLoading(false); }), 220);
    return () => { current = false; clearTimeout(timer); };
  }, [query, open]);
  const add = async (card: RegistryCard) => {
    setBusy(card.id);
    setError("");
    try {
      const server = await api<Server>("/api/mcp", { body: { name: card.title.toLowerCase().replace(/[^a-z0-9-]+/g, "-"), ...(card.kind === "command" ? { command: card.command, args: card.args } : { url: card.url, auth: "oauth" }) } });
      onAdded();
      if (card.auth === "oauth") await api(`/api/mcp/${server.id}/signin`, { body: {} });
      onAdded();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="tk-registry">
      <button type="button" className="tk-registry-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Globe size={13} /> Not here? Search the MCP registry
        <ChevronDown size={12} className={`transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="tk-registry-body">
          <label className="tk-search is-wide">
            <Search size={14} />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the registry: github, postgres, slack…" aria-label="Search the MCP registry" />
          </label>
          {error && <p className="tk-error">{error}</p>}
          {loading && <p className="cr-muted">Searching the registry…</p>}
          {!loading && !error && !cards.length && <p className="cr-muted">Nothing matched. Try another word, or add your own server.</p>}
          <p className="tk-fine">Registry results aren't verified connections and some need extra setup. Read the endpoint or command before you add one, then check it.</p>
          <div className="tk-grid is-gallery">
            {!loading && cards.map((c) => {
              const name = c.title.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
              return (
                <article key={c.id} className="tk-card">
                  <div className="tk-card-top">
                    <span className="tk-icon"><Monogram name={c.title} /></span>
                    <div className="tk-card-text"><b>{c.title}</b><p>{c.description}</p></div>
                  </div>
                  <code className="tk-endpoint">{c.url ?? [c.command, ...c.args].join(" ")}</code>
                  <footer>
                    <span className="tk-tag">{c.kind === "remote" ? <><KeyRound size={11} /> Sign in</> : <><Terminal size={11} /> npx</>}</span>
                    {installed.has(name) ? <span className="tk-added"><Check size={13} /> Added</span>
                      : <button type="button" className="cr-btn" disabled={!!busy} onClick={() => void add(c)}>{busy === c.id ? "Adding…" : <><Plus size={12} /> Add</>}</button>}
                  </footer>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function CustomServer({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [kind, setKind] = useState<"command" | "url">("command");
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [argumentsJson, setArgumentsJson] = useState("[]");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<Server | null>(null);
  const [oauth, setOauth] = useState(true);
  const [error, setError] = useState("");
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const server = saved ?? await api<Server>("/api/mcp", { body: kind === "command" ? { name, command: value.trim(), args: commandArguments(argumentsJson) } : { name, url: value.trim(), auth: oauth ? "oauth" : "none" } });
      setSaved(server);
      onAdded();
      if (server.auth === "oauth") await api(`/api/mcp/${server.id}/signin`, { body: {} });
      onAdded();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet onClose={onClose} label="Add a server">
      <div className="mb-4 text-[16px] font-semibold">Add your own server</div>
      <fieldset disabled={busy || !!saved}>
      <div className="seg mb-4">
        <button className={kind === "command" ? "is-on" : ""} onClick={() => setKind("command")}>
          <Terminal size={13} /> Command
        </button>
        <button className={kind === "url" ? "is-on" : ""} onClick={() => setKind("url")}>
          <Cloud size={13} /> URL
        </button>
      </div>
      <label className="field">
        <span>Name (agents see mcp__name__tool)</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="postgres" autoFocus />
      </label>
      <label className="field mt-3">
        <span>{kind === "command" ? "Executable (without arguments)" : "Server URL"}</span>
        <input className="mono" value={value} onChange={(e) => setValue(e.target.value)} placeholder={kind === "command" ? "npx" : "https://mcp.example.com/mcp"} />
      </label>
      {kind === "command" && <label className="field mt-3"><span>Arguments (JSON array of strings)</span><textarea rows={3} className="mono" value={argumentsJson} onChange={(e) => setArgumentsJson(e.target.value)} placeholder={'["-y", "@example/server", "/Users/me/My Project"]'} /><span>Each string is one argument. Paths with spaces stay intact; shell syntax is not expanded.</span></label>}
      {kind === "url" && (
        <label className="mt-3 flex items-center gap-2 text-[12.5px] text-fg-2">
          <input type="checkbox" checked={oauth} onChange={(e) => setOauth(e.target.checked)} className="accent-[var(--amber)]" /> Signs in with OAuth
        </label>
      )}
      </fieldset>
      {saved && <p className="mt-3 text-[12px] text-fg-2">Server saved. Sign-in is unfinished; retry here or close and sign in from Configured servers.</p>}
      {error && <div className="mt-3 text-[12px] text-bad">{error}</div>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" disabled={busy || !name.trim() || !value.trim()} onClick={() => void save()}>
          {busy ? "Working…" : saved ? "Retry sign-in" : "Add server"}
        </Button>
      </div>
    </Sheet>
  );
}

// ── skills ───────────────────────────────────────────────────────────────────────────────

function SkillsTab({ onSummary }: { onSummary: (s: Summary) => void }) {
  const [mine, setMine] = useState<SkillInfo[]>([]);
  const [catalog, setCatalog] = useState<CatalogSkill[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [viewing, setViewing] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [query, setQuery] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const load = () => {
    void api<SkillInfo[]>("/api/skills").then(setMine).catch((e: Error) => setError(e.message));
    void api<CatalogSkill[]>("/api/skills/catalog").then(setCatalog).catch((e: Error) => (setCatalog([]), setError(e.message)));
  };
  useEffect(load, []);
  useEffect(() => {
    if (catalog === null) return onSummary({ text: "Reading your skills…", tone: "idle" });
    const fresh = catalog.filter((c) => !mine.some((m) => m.name === c.name)).length;
    onSummary(mine.length ? { text: `${mine.length} skill${mine.length === 1 ? "" : "s"} installed · ${fresh} more in Anthropic's catalog · agents load one when a task matches it`, tone: "ok" }
      : { text: "No skills yet. Install one below or write your own.", tone: "idle" });
  }, [mine, catalog, onSummary]);
  const install = async (name: string) => {
    setBusy(name);
    setError("");
    try {
      await api("/api/skills/install", { body: { name } });
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const installedNames = useMemo(() => new Set(mine.map((s) => s.name)), [mine]);
  const matches = (skill: { name: string; description: string }) => `${skill.name} ${skill.description}`.toLowerCase().includes(query.trim().toLowerCase());
  const remove = async (name: string) => {
    setBusy(name);
    setError("");
    try { await api(`/api/skills/${encodeURIComponent(name)}`, { method: "DELETE" }); setRemoving(null); load(); }
    catch (failure) { setError((failure as Error).message); }
    finally { setBusy(""); }
  };
  const sourceLabel = (src: SkillInfo["source"]) => (src === "catalog" ? "Anthropic" : src === "learned" ? "Learned" : "Yours");
  return (
    <>
      {error && <p className="cr-error" role="alert">{error}</p>}
      <section className="cr-sheet">
        <header className="cr-sheet-head">
          <h2>Your skills</h2><small>{mine.length ? "Claude loads the whole folder; Codex gets the matching instructions" : ""}</small>
          <div className="cr-sheet-actions">
            <label className="tk-search"><Search size={13} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a skill…" aria-label="Search skills" /></label>
            <button type="button" className="cr-btn" onClick={() => setWriting(true)}><PenLine size={13} /> Write a skill</button>
          </div>
        </header>
        {mine.length ? (
          <div className="tk-grid">
            {mine.filter(matches).map((s) => (
              <article key={s.name} className="tk-card">
                <div className="tk-card-top">
                  <span className="tk-icon"><span className="tk-mono is-skill"><Sparkles size={15} /></span></span>
                  <div className="tk-card-text"><b>{s.name}</b><p>{s.description}</p></div>
                </div>
                <footer>
                  <span className="tk-tag">{sourceLabel(s.source)} · {s.files} file{s.files === 1 ? "" : "s"} · {(s.bytes / 1024).toFixed(s.bytes < 10240 ? 1 : 0)} KB</span>
                  <span className="tk-spacer" />
                  <button type="button" className="tk-icon-btn" title="Read it" aria-label={`View ${s.name}`} onClick={() => setViewing(s.name)}><Eye size={14} /></button>
                  <button type="button" className="tk-icon-btn" disabled={!!busy} title="Remove" aria-label={`Remove ${s.name}`} onClick={() => setRemoving(s.name)}><Trash2 size={14} /></button>
                </footer>
                {removing === s.name && <div className="tk-confirm"><p>Remove this skill and its installed files?</p><div><button type="button" className="cr-btn tk-danger" disabled={!!busy} onClick={() => void remove(s.name)}>{busy === s.name ? "Removing…" : "Remove skill"}</button><button type="button" className="cr-btn" disabled={!!busy} onClick={() => setRemoving(null)}>Cancel</button></div></div>}
              </article>
            ))}
          </div>
        ) : (
          <p className="cr-muted">No skills yet. A skill is instructions (and optional scripts) an agent loads when a task matches its description. Install one of Anthropic's below or write your own.</p>
        )}
      </section>
      <section className="cr-sheet">
        <header className="cr-sheet-head"><h2>From Anthropic</h2><small>real skill folders from anthropics/skills</small></header>
        <p className="tk-fine tk-lead">Downloads from <a href="https://github.com/anthropics/skills" target="_blank" rel="noreferrer">anthropics/skills</a>. A skill may mention tools or credentials; installing it doesn't grant that access.</p>
        {catalog === null ? <p className="cr-muted"><Loader2 size={13} className="inline animate-spin" /> Loading the catalog…</p> : (
          <div className="tk-grid is-gallery">
            {catalog.filter(matches).map((c) => (
              <article key={c.name} className={`tk-card ${installedNames.has(c.name) ? "is-added" : ""}`}>
                <div className="tk-card-top">
                  <span className="tk-icon"><Monogram name={c.name} /></span>
                  <div className="tk-card-text"><b>{c.name}</b><p>{c.description}</p></div>
                </div>
                <footer>
                  <span className="tk-tag">{c.files} file{c.files === 1 ? "" : "s"}</span>
                  {installedNames.has(c.name) ? <span className="tk-added"><Check size={13} /> Installed</span>
                    : <button type="button" className="cr-btn" disabled={!!busy} onClick={() => void install(c.name)}>{busy === c.name ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} {busy === c.name ? "Installing…" : "Install"}</button>}
                </footer>
              </article>
            ))}
          </div>
        )}
      </section>
      {viewing && <SkillViewer name={viewing} onClose={() => setViewing(null)} />}
      {writing && <WriteSkill onClose={() => setWriting(false)} onSaved={() => (setWriting(false), load())} />}
    </>
  );
}

function SkillViewer({ name, onClose }: { name: string; onClose: () => void }) {
  const [skill, setSkill] = useState<{ body: string; files: string[] } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => void api<{ body: string; files: string[] }>(`/api/skills/${encodeURIComponent(name)}`).then(setSkill).catch((failure: Error) => setError(failure.message)), [name]);
  return (
    <Sheet onClose={onClose} label={name} wide>
      <div className="mb-3 flex items-center gap-2">
        <BookOpen size={15} className="text-amber" />
        <span className="mono text-[15px] font-semibold">{name}</span>
      </div>
      {error ? <p role="alert" className="text-[12px] text-bad">{error}</p> : skill ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            {skill.files.map((f) => (
              <span key={f} className="tl-pill mono">
                {f}
              </span>
            ))}
          </div>
          <div className="prose-agent mt-4 max-h-[60vh] overflow-y-auto rounded-[10px] border border-line bg-sunken p-4 text-[13px]">
            <Markdown text={skill.body.replace(/^---[\s\S]*?---\n?/, "")} />
          </div>
        </>
      ) : (
        <Loader2 size={14} className="animate-spin text-fg-3" />
      )}
    </Sheet>
  );
}

function WriteSkill({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await api("/api/skills", { body: { name, description, instructions } });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet onClose={onClose} label="Write a skill" wide>
      <div className="mb-1 text-[16px] font-semibold">Write a skill</div>
      <p className="mb-4 text-[12.5px] text-fg-3">The description decides when an agent reaches for it, so say when to use it. The instructions are what it follows.</p>
      <label className="field">
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cold email" autoFocus />
      </label>
      <label className="field mt-3">
        <span>When to use it</span>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Use when writing a cold email or outreach DM to a potential customer." />
      </label>
      <label className="field mt-3">
        <span>Instructions (Markdown)</span>
        <textarea rows={10} className="mono" value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder={"1. Open with their problem, in their words.\n2. One sentence on what we do.\n3. One small ask. Under 90 words."} />
      </label>
      {error && <div className="mt-3 text-[12px] text-bad">{error}</div>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => void save()} disabled={busy || !name.trim() || !description.trim() || !instructions.trim()}>
          {busy ? "Saving…" : "Save skill"}
        </Button>
      </div>
    </Sheet>
  );
}

function Sheet({ children, onClose, label, wide }: { children: React.ReactNode; onClose: () => void; label: string; wide?: boolean }) {
  useEffect(() => {
    const close = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label={label}>
      <motion.div initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className={`relative ${wide ? "w-[720px]" : "w-[540px]"} max-w-full rounded-[16px] border border-line-strong bg-panel p-5 shadow-[0_30px_90px_rgba(0,0,0,.45)]`}>
        <button className="member-icon absolute right-3 top-3" onClick={onClose} aria-label="Close">
          <X size={14} />
        </button>
        {children}
      </motion.div>
    </div>
  );
}
