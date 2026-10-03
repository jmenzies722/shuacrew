import { Button } from "@shuacrew/ui";
import { BookOpen, Check, ChevronDown, Cloud, Download, Eye, Globe, KeyRound, Loader2, Lock, PenLine, Plug, Plus, RefreshCw, Search, Sparkles, Terminal, Trash2, Wrench, X, Cable } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Markdown } from "../components/Markdown";
import { api } from "../lib/api";
import { isMac, pickFolder } from "../lib/native";
import { BrandIcon } from "../components/ToolActivityCard";
import { PaneHeader } from "../components/Pane";
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

/** Tools (MCP servers) and skills — what your agents can reach, and what they know how to do. */
export function Integrations() {
  const [tab, setTab] = useState<"tools" | "skills">(() => (location.hash === "#skills" ? "skills" : "tools"));
  useEffect(() => history.replaceState(null, "", `#${tab}`), [tab]);
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1440px] px-8 pb-12 pt-8">
        <PaneHeader eyebrow="Brain" icon={Cable} title="Tools & Skills" description="Configure real MCP services and install task instructions. Check each server to discover its tools. New sessions receive your configuration; your active policy still governs execution." actions={
          <div className="seg" role="tablist">
            <button role="tab" aria-selected={tab === "tools"} className={tab === "tools" ? "is-on" : ""} onClick={() => setTab("tools")}>
              <Plug size={13} /> Tools
            </button>
            <button role="tab" aria-selected={tab === "skills"} className={tab === "skills" ? "is-on" : ""} onClick={() => setTab("skills")}>
              <Sparkles size={13} /> Skills
            </button>
          </div>} />
        {tab === "tools" ? <Tools /> : <SkillsTab />}
      </div>
    </div>
  );
}

// ── tools ────────────────────────────────────────────────────────────────────────────────

function Tools() {
  const [servers, setServers] = useState<Server[]>([]);
  const [featured, setFeatured] = useState<Featured[]>([]);
  const [known, setKnown] = useState<Record<string, Connection>>({});
  const [error, setError] = useState("");
  const [custom, setCustom] = useState(false);
  const load = async () => {
    const [s, f, k] = await Promise.all([api<Server[]>("/api/mcp"), api<Featured[]>("/api/mcp/featured"), api<Record<string, Connection>>("/api/mcp/tools")]);
    setServers(s);
    setFeatured(f);
    setKnown(k);
  };
  useEffect(() => void load().catch((e: Error) => setError(e.message)), []);

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

  return (
    <>
      {error && <div className="mb-4 rounded-[10px] bg-[color-mix(in_srgb,var(--bad)_10%,transparent)] px-3 py-2 text-[12.5px] text-bad">{error}</div>}
      <section>
        <div className="mb-2.5 flex items-center gap-2">
          <h2 className="pb-eyebrow !mb-0">Configured servers</h2>
          <span className="text-[11.5px] text-fg-3">{servers.length ? `${servers.length} saved · connection checks run only when requested` : ""}</span>
          <span className="flex-1" />
          <Button size="s" variant="ghost" onClick={() => setCustom(true)}>
            <Plus size={12} /> Add your own
          </Button>
        </div>
        {servers.length ? (
          <div className="flex flex-col gap-2">
            {servers.map((s) => (
              <ServerRow key={s.id} server={s} initial={known[s.id]} onChange={() => void load().catch((e: Error) => setError(e.message))} />
            ))}
          </div>
        ) : (
          <div className="tl-empty">No servers configured. Choose a service below or add your own, then check its connection to discover available tools.</div>
        )}
      </section>

      <Registry onAdded={() => void load().catch((e: Error) => setError(e.message))} installed={new Set(servers.map((s) => s.name))} />

      {CATEGORIES.map((cat) => {
        const items = featured.filter((f) => f.category === cat);
        if (!items.length) return null;
        return (
          <section key={cat} className="mt-7">
            <h2 className="pb-eyebrow">{cat}</h2>
            <div className="stagger grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-2.5">
              {items.map((f) => (
                <FeaturedCard key={f.id} item={f} onAdd={() => add(f)} />
              ))}
            </div>
          </section>
        );
      })}

      {custom && <CustomServer onClose={() => setCustom(false)} onAdded={() => void load().catch((e: Error) => setError(e.message))} />}
    </>
  );
}

function monogram(name: string) {
  return name.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "M";
}

function FeaturedCard({ item, onAdd }: { item: Featured; onAdd: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className={`tl-card ${item.added ? "is-added" : ""}`}>
      <div className="flex items-start gap-3">
        <BrandIcon assetId={item.brand?.assetId} fallback={<span className="tl-mono">{monogram(item.title)}</span>} />
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold text-fg">{item.title}</div>
          <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-fg-3">{item.blurb}</div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="tl-tag">
          {item.auth === "oauth" ? <KeyRound size={10} /> : item.url ? <Cloud size={10} /> : <Terminal size={10} />}
          {item.auth === "oauth" ? "Sign in" : item.url ? "Hosted" : "Runs locally"}
        </span>
        <span className="flex-1" />
        {item.added ? (
          <span className="flex items-center gap-1 text-[12px] text-ok">
            <Check size={13} /> Added
          </span>
        ) : (
          <Button size="s" disabled={busy} onClick={() => (setBusy(true), void onAdd().finally(() => setBusy(false)))}>
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} {busy && item.auth === "oauth" ? "Signing in…" : "Add"}
          </Button>
        )}
      </div>
    </div>
  );
}

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
  return (
    <div className="tl-row">
      <div className="flex items-center gap-3">
        <BrandIcon assetId={server.brand?.assetId} />
        <button className="min-w-0 flex-1 text-left" onClick={() => conn?.ok && setOpen((v) => !v)}>
          <span className="flex items-center gap-2">
            <span className="text-[13.5px] font-semibold text-fg">{server.name}</span>
            {conn?.server && <span className="mono text-[11px] text-fg-3">v{conn.server.version}</span>}
          </span>
          <span className="mono block truncate text-[11px] text-fg-3">{server.url ?? [server.command, ...server.args].join(" ")}</span>
          <span className="block text-[11px] text-fg-3">{server.brand?.publisher === "community" ? "Community connector" : server.brand?.publisher === "official" ? "Recognized publisher endpoint" : "Publisher unverified"} · {server.auth === "none" ? "No sign-in required" : server.signedIn ? "Credential saved · not a live connection check" : "Not signed in"}{conn ? ` · Last checked ${new Date(conn.at).toLocaleString()}` : " · Connection not checked"}</span>
        </button>
        {testing ? (
          <span className="tl-status">
            <Loader2 size={12} className="animate-spin" /> Connecting…
          </span>
        ) : needsSignIn ? (
          <span className="tl-status is-wait">
            <Lock size={11} /> Needs sign-in
          </span>
        ) : conn?.ok ? (
          <button className="tl-status is-ok" onClick={() => setOpen((v) => !v)}>
            <Wrench size={11} /> {conn.tools.length} tool{conn.tools.length === 1 ? "" : "s"} at last check
            <ChevronDown size={11} className={`transition ${open ? "rotate-180" : ""}`} />
          </button>
        ) : conn ? (
          <span className="tl-status is-bad" title={conn.error}>
            <X size={11} /> {conn.error?.slice(0, 48) ?? "Can't connect"}
          </span>
        ) : <span className="tl-status">Not checked</span>}
        <button className={`tl-status ${server.spark ? "is-ok" : ""}`} aria-pressed={!!server.spark}
          title={server.spark ? "Spark can use these tools by voice, without asking. Click to stop." : "Let Spark (the notch) use these tools by voice, without asking. Each server adds a little to Spark's first word."}
          disabled={busy || testing}
          onClick={() => server.spark ? void act(() => api(`/api/mcp/${server.id}/spark`, { body: { on: false } })) : setSparkConfirm(true)}>
          <Sparkles size={11} /> {server.spark ? "In Spark" : "Use in Spark"}
        </button>
        {needsSignIn ? (
          <Button size="s" variant="primary" disabled={busy || testing} onClick={() => void act(async () => { await api(`/api/mcp/${server.id}/signin`, { body: {} }); await test(); })}>
            {busy ? "Working…" : "Sign in"}
          </Button>
        ) : (
          <Button size="s" disabled={busy || testing} onClick={() => void test()}><RefreshCw size={13} /> Check connection</Button>
        )}
        {confirm ? (
          <Button size="s" variant="danger" disabled={busy || testing} onClick={() => void act(() => api(`/api/mcp/${server.id}`, { method: "DELETE" }))}>
            Remove
          </Button>
        ) : (
          <button className="member-icon" title="Remove" aria-label={`Remove ${server.name}`} onClick={() => setConfirm(true)}>
            <Trash2 size={13} />
          </button>
        )}
      </div>
      {error && <p role="alert" className="mt-2 text-[12px] text-bad">{error}</p>}
      {server.spark && <p className="mt-2 text-[11px] text-fg-3">Spark voice access is enabled for this server, without asking before use.</p>}
      {sparkConfirm && <div className="mt-3 rounded-lg border border-line p-3 text-[12px]">
        <p>Allow Spark to use this server’s tools by voice without asking? This is separate from adding tools to crew sessions.</p>
        <div className="mt-2 flex gap-2"><Button size="s" disabled={busy} onClick={() => void act(async () => { await api(`/api/mcp/${server.id}/spark`, { body: { on: true } }); setSparkConfirm(false); })}>Enable Spark access</Button><Button size="s" variant="ghost" disabled={busy} onClick={() => setSparkConfirm(false)}>Cancel</Button></div>
      </div>}
      <AnimatePresence initial={false}>
        {open && conn?.ok && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="tl-tools">
              {conn.tools.map((t) => (
                <div key={t.name} className="tl-tool">
                  <div className="flex items-center gap-2">
                    <span className="mono text-[12px] font-medium text-fg">{t.name}</span>
                    {t.readOnly && <span className="tl-pill" title="Server-provided hint, not a permission guarantee">read-only hint</span>}
                    {t.destructive && <span className="tl-pill is-bad" title="Server-provided hint; policy still applies">destructive hint</span>}
                  </div>
                  {t.description && <div className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-fg-3">{t.description}</div>}
                </div>
              ))}
            </div>
            <div className="mt-2 text-[11px] text-fg-3">
              Agents call these as <span className="mono">mcp__{server.name}__…</span>. Server hints are advisory. Your active policy and exact approval requests govern execution.
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
    <section className="mt-8">
      <button className="flex items-center gap-2 text-[12.5px] text-fg-2 hover:text-fg" onClick={() => setOpen((v) => !v)}>
        <Globe size={13} /> Search the MCP registry
        <ChevronDown size={12} className={`transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-3">
          <label className="lib-search">
            <Search size={15} className="text-fg-3" />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the registry — github, postgres, slack…" aria-label="Search the MCP registry" />
          </label>
          {error && <div className="mt-2 text-[12px] text-bad">{error}</div>}
          {loading && <p className="mt-2 text-[12px] text-fg-3">Searching registry…</p>}
          {!loading && !error && !cards.length && <p className="mt-2 text-[12px] text-fg-3">No matching setup entries returned. Try another search or add your own server.</p>}
          <p className="mt-2 text-[11.5px] text-fg-3">Results are a limited selection from the registry, not verified connections. Some servers need extra configuration. Review the endpoint or command before adding, then check the connection.</p>
          <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2">
            {!loading && cards.map((c) => {
              const name = c.title.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
              return (
                <div key={c.id} className="tl-card">
                  <div className="text-[13px] font-semibold text-fg">{c.title}</div>
                  <div className="mono truncate text-[10.5px] text-fg-3">{c.id}</div>
                  <div className="mt-1 line-clamp-2 text-[12px] leading-snug text-fg-3">{c.description}</div>
                  <div className="mono mt-2 break-all text-[10.5px] text-fg-3">{c.url ?? [c.command, ...c.args].join(" ")}</div>
                  <div className="mt-2.5 flex items-center">
                    <span className="tl-tag">{c.kind === "remote" ? "Sign in" : "npx"}</span>
                    <span className="flex-1" />
                    {installed.has(name) ? (
                      <span className="text-[12px] text-ok">Added</span>
                    ) : (
                      <Button size="s" disabled={!!busy} onClick={() => void add(c)}>
                        {busy === c.id ? "Adding…" : "Add"}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
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

function SkillsTab() {
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
  return (
    <>
      {error && <div className="mb-4 rounded-[10px] bg-[color-mix(in_srgb,var(--bad)_10%,transparent)] px-3 py-2 text-[12.5px] text-bad">{error}</div>}
      <label className="lib-search mb-4"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search installed and catalog skills" aria-label="Search skills" /></label>
      <section>
        <div className="mb-2.5 flex items-center gap-2">
          <h2 className="pb-eyebrow !mb-0">Installed</h2>
          <span className="text-[11.5px] text-fg-3">{mine.length ? "Claude loads skill folders; Codex receives selected instruction excerpts" : ""}</span>
          <span className="flex-1" />
          <Button size="s" variant="ghost" onClick={() => setWriting(true)}>
            <PenLine size={12} /> Write a skill
          </Button>
        </div>
        {mine.length ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-2.5">
            {mine.filter(matches).map((s) => (
              <div key={s.name} className="tl-card">
                <div className="flex items-start gap-3">
                  <span className="tl-mono is-skill">
                    <Sparkles size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="mono text-[13px] font-semibold text-fg">{s.name}</span>
                      <span className="tl-pill">{s.source === "catalog" ? "Anthropic catalog" : s.source === "learned" ? "accepted learning" : "yours"}</span>
                    </div>
                    <div className="mt-1 line-clamp-3 text-[12px] leading-snug text-fg-3">{s.description}</div>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 text-[11px] text-fg-3">
                  {s.files} file{s.files === 1 ? "" : "s"} · {(s.bytes / 1024).toFixed(s.bytes < 10240 ? 1 : 0)} KB
                  <span className="flex-1" />
                  <button className="member-icon" title="View" aria-label={`View ${s.name}`} onClick={() => setViewing(s.name)}>
                    <Eye size={13} />
                  </button>
                  <button className="member-icon" disabled={!!busy} title="Remove" aria-label={`Remove ${s.name}`} onClick={() => setRemoving(s.name)}>
                    <Trash2 size={13} />
                  </button>
                </div>
                {removing === s.name && <div className="mt-3 text-[12px]"><p>Remove this skill and its installed files?</p><div className="mt-2 flex gap-2"><Button size="s" variant="danger" disabled={!!busy} onClick={() => void remove(s.name)}>{busy === s.name ? "Removing…" : "Remove skill"}</Button><Button size="s" variant="ghost" disabled={!!busy} onClick={() => setRemoving(null)}>Cancel</Button></div></div>}
              </div>
            ))}
          </div>
        ) : (
          <div className="tl-empty">No skills yet. Install one of Anthropic's below, or write your own — a skill is instructions (and optional scripts) the agent loads when a task matches its description.</div>
        )}
      </section>
      <section className="mt-7">
        <h2 className="pb-eyebrow">From Anthropic</h2>
        <p className="mb-3 text-[12px] text-fg-3">Downloads real skill folders from <a href="https://github.com/anthropics/skills" target="_blank" rel="noreferrer" className="underline">anthropics/skills</a>. Instructions may refer to separate tools or credentials; installing a skill does not grant that access.</p>
        {catalog === null ? (
          <div className="tl-empty">
            <Loader2 size={13} className="inline animate-spin" /> Loading the skills catalog…
          </div>
        ) : (
          <div className="stagger grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-2.5">
            {catalog.filter(matches).map((c) => (
              <div key={c.name} className={`tl-card ${installedNames.has(c.name) ? "is-added" : ""}`}>
                <div className="mono text-[13px] font-semibold text-fg">{c.name}</div>
                <div className="mt-1 line-clamp-3 min-h-[3.3em] text-[12px] leading-snug text-fg-3">{c.description}</div>
                <div className="mt-3 flex items-center">
                  <span className="text-[11px] text-fg-3">
                    {c.files} file{c.files === 1 ? "" : "s"}
                  </span>
                  <span className="flex-1" />
                  {installedNames.has(c.name) ? (
                    <span className="flex items-center gap-1 text-[12px] text-ok">
                      <Check size={13} /> Installed
                    </span>
                  ) : (
                    <Button size="s" disabled={!!busy} onClick={() => void install(c.name)}>
                      {busy === c.name ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} {busy === c.name ? "Installing…" : "Install"}
                    </Button>
                  )}
                </div>
              </div>
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
