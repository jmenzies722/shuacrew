import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { api } from "../lib/api";
import { PANES, paneURL } from "../lib/settings-panes";
import "./health-check.css";

/**
 * Settings → Health check: everything ShuaCrew needs, checked for real in one go — the engine, Claude and Codex, the
 * voice (a timed sentence), hearing you, Spark for Chrome, disk space, and on the Mac side every permission and music
 * control. Green, amber or red, each with the one thing that fixes it.
 */
type Status = "ok" | "warn" | "fail";
interface Fix { kind: "settings" | "page" | "howto" | "request"; target: string; label: string }
interface Check { id: string; label: string; status: Status; detail: string; fix?: Fix }

type Native = { postMessage: (m: unknown) => void };
const native = (): Native | undefined => (window as unknown as { webkit?: { messageHandlers?: { shuacrew?: Native } } }).webkit?.messageHandlers?.shuacrew;
function macAsk(action: Record<string, unknown>, ms = 4000): Promise<{ ok: boolean; message: string; output?: string } | null> {
  const bridge = native(); if (!bridge) return Promise.resolve(null);
  return new Promise((resolve) => {
    const id = crypto.randomUUID();
    const t = setTimeout(() => { window.removeEventListener("shuacrew:did", on as EventListener); resolve(null); }, ms);
    const on = (e: CustomEvent<{ id: string; ok: boolean; message: string; output?: string }>) => {
      if (e.detail.id !== id) return; clearTimeout(t); window.removeEventListener("shuacrew:did", on as EventListener); resolve(e.detail);
    };
    window.addEventListener("shuacrew:did", on as EventListener);
    bridge.postMessage({ type: "buddyDo", id, action });
  });
}

/** The Mac side: permissions and music control, turned into checks. */
async function macChecks(): Promise<Check[]> {
  if (!native()) return [{ id: "mac", label: "The Mac app", status: "warn", detail: "Open ShuaCrew as the Mac app to check permissions, music control and the notch." }];
  const [perm, music] = await Promise.all([macAsk({ type: "mac", op: "permissions" }), macAsk({ type: "mac", op: "music_now" }, 6000)]);
  let p: Record<string, string> = {};
  try { p = JSON.parse(perm?.output ?? "{}"); } catch { /* keep empty */ }
  const need = (key: string, label: string, pane: string, why: string, required: boolean): Check =>
    p[key] === "granted" ? { id: `perm-${key}`, label, status: "ok", detail: "Allowed." }
      // Never asked: the app isn't in Settings' list yet, so bring up macOS's own prompt instead.
      : { id: `perm-${key}`, label, status: required ? "fail" : "warn", detail: `${p[key] === "not asked" ? "Not allowed yet" : "Turned off"}: ${why}`,
          fix: p[key] === "not asked" && ["calendar", "reminders", "contacts"].includes(key) ? { kind: "request", target: key, label: "Allow" } : { kind: "settings", target: pane, label: "Turn on" } };
  return [
    need("screen", "See your screen", "screen-recording", "Spark can't look at your screen to guide you.", true),
    need("accessibility", "Click and type", "accessibility-access", "Spark can't find controls exactly or do steps for you.", true),
    need("microphone", "Microphone", "microphone", "voice mode can't hear you.", true),
    need("calendar", "Calendar", "calendars-access", "Spark can't see what's next.", false),
    need("reminders", "Reminders", "reminders-access", "Spark can't tell you what's due.", false),
    need("contacts", "Contacts", "contacts-access", "Spark won't know who you mean by name.", false),
    !music ? { id: "music", label: "Music control", status: "warn", detail: "Music didn't answer. If macOS asks, allow ShuaCrew to control Music.", fix: { kind: "settings", target: "automation", label: "Review" } }
      : music.ok ? { id: "music", label: "Music control", status: "ok", detail: music.output?.startsWith("Now in") ? `Working: ${music.output.replace(/^Now in /, "").split(" · ")[0]}` : "Working." }
      : { id: "music", label: "Music control", status: "warn", detail: music.message, fix: { kind: "settings", target: "automation", label: "Review" } },
  ];
}

export function HealthCheck() {
  const [checks, setChecks] = useState<Check[] | null>(null), [running, setRunning] = useState(false), [at, setAt] = useState<number | null>(null), [howto, setHowto] = useState("");
  const run = async () => {
    setRunning(true);
    const [gateway, mac] = await Promise.all([
      api<{ checks: Check[] }>("/api/health/check").then((r) => r.checks, (e: Error) => [{ id: "gateway", label: "ShuaCrew engine", status: "fail" as const, detail: `Not answering (${e.message}). Restart ShuaCrew.` }]),
      macChecks(),
    ]);
    setChecks([...gateway, ...mac]); setAt(Date.now()); setRunning(false);
  };
  useEffect(() => { void run(); }, []);
  const fix = (f: Fix) => {
    if (f.kind === "howto") { setHowto(f.target); return; }
    if (f.kind === "request") { void macAsk({ type: "mac", op: "request_access", what: f.target }, 125_000).then(() => run()); return; }
    if (f.kind === "page") { window.location.hash = f.target.split("#")[1] ?? ""; return; }
    const pane = PANES.find((p) => p.key === f.target);
    if (pane) native()?.postMessage({ type: "buddyDo", id: crypto.randomUUID(), action: { type: "open_settings", pane: pane.key, url: paneURL(pane) } });
  };
  const fails = checks?.filter((c) => c.status === "fail").length ?? 0, warns = checks?.filter((c) => c.status === "warn").length ?? 0;
  const headline = !checks ? "Checking everything…" : fails ? `${fails} thing${fails === 1 ? "" : "s"} need${fails === 1 ? "s" : ""} fixing` : warns ? `Working — ${warns} thing${warns === 1 ? "" : "s"} could be better` : "Everything's working";
  return <section className={`health ${fails ? "is-fail" : warns ? "is-warn" : checks ? "is-ok" : ""}`} aria-label="Health check">
    <header className="health-head">
      <i className="health-badge" aria-hidden>{!checks ? <RefreshCw size={18} className="is-spin" /> : fails ? <XCircle size={20} /> : warns ? <AlertTriangle size={19} /> : <CheckCircle2 size={20} />}</i>
      <div><strong>{headline}</strong><small>{at ? `Checked ${new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} — the engine, Claude and Codex, a real spoken sentence, hearing you, Chrome, disk, permissions and music.` : "Running every check for real, including a spoken test sentence."}</small></div>
      <button type="button" className="health-run" disabled={running} onClick={() => void run()}><RefreshCw size={13} className={running ? "is-spin" : ""} />{running ? "Checking…" : "Check again"}</button>
    </header>
    {howto && <p className="health-howto">In Terminal, run <code>{howto}</code>, then check again.</p>}
    {checks && <ul className="health-list">{[...checks].sort((a, b) => ["fail", "warn", "ok"].indexOf(a.status) - ["fail", "warn", "ok"].indexOf(b.status)).map((c) =>
      <li key={c.id} className={`is-${c.status}`}>
        <i className="health-dot" aria-label={c.status === "ok" ? "OK" : c.status === "warn" ? "Could be better" : "Needs fixing"}>{c.status === "ok" ? <CheckCircle2 size={15} /> : c.status === "warn" ? <AlertTriangle size={15} /> : <XCircle size={15} />}</i>
        <span><b>{c.label}</b><small>{c.detail}</small></span>
        {c.fix && c.status !== "ok" && <button type="button" onClick={() => fix(c.fix!)}>{c.fix.label}</button>}
      </li>)}</ul>}
  </section>;
}
