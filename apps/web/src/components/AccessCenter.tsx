/**
 * Access: everything Shua can reach on this Mac, as what it lets Shua *do* — not as a list of privacy panes.
 * Each tile asks the Mac app (PermissionCenter.swift) for the real system prompt, or the exact Settings pane when
 * macOS won't prompt again, or a relaunch when macOS only hands a permission to a fresh process.
 */
import { useEffect, useRef, useState } from "react";
import { Accessibility, AppWindow, Bell, Calendar, Camera, Contact, FolderOpen, HardDrive, Image, Keyboard, ListChecks, MapPin, Mic, MonitorSmartphone, RotateCw, ScanEye, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import { isMac, permissions } from "../lib/native";
import "./access-center.css";

type Status = "granted" | "denied" | "ask" | "relaunch" | "unknown" | "closed";
interface Snapshot { permissions: Array<{ id: string; status: Status }>; automation: Array<{ id: string; name: string; status: Status }> }

const CAPS: Array<{ id: string; name: string; does: string; icon: typeof Mic; essential?: boolean }> = [
  { id: "accessibility", name: "Control your Mac", does: "Click, type and move through apps for you, so you never touch the mouse.", icon: Accessibility, essential: true },
  { id: "screen", name: "See your screen", does: "Look at what you're doing to point, explain and act on it.", icon: ScanEye, essential: true },
  { id: "microphone", name: "Hear you", does: "Talk to Shua from the notch, hands-free.", icon: Mic, essential: true },
  { id: "inputMonitoring", name: "Hold-to-talk key", does: "Start talking the instant you hold fn, in any app.", icon: Keyboard, essential: true },
  { id: "speech", name: "On-device speech", does: "Understand you on this Mac, fast and private.", icon: Sparkles },
  { id: "files", name: "Your folders", does: "Open, organise and build with Desktop, Documents and Downloads.", icon: FolderOpen },
  { id: "fullDisk", name: "Everything on disk", does: "Reach any file the crew needs, including other apps' data.", icon: HardDrive },
  { id: "calendars", name: "Calendar", does: "Plan your day around meetings and book time.", icon: Calendar },
  { id: "reminders", name: "Reminders", does: "Read your lists and add what you ask.", icon: ListChecks },
  { id: "contacts", name: "Contacts", does: "Know who you mean: “email Sam” just works.", icon: Contact },
  { id: "photos", name: "Photos", does: "Find, sort and share your photos.", icon: Image },
  { id: "camera", name: "Camera", does: "Look through the camera when you ask.", icon: Camera },
  { id: "notifications", name: "Notifications", does: "Tap you when the crew needs a decision or finishes.", icon: Bell },
  { id: "location", name: "Location", does: "Local weather and “near me” answers, rounded to a kilometre.", icon: MapPin },
];

const LABEL: Record<Status, string> = { granted: "On", denied: "Off", ask: "Not asked", relaunch: "Relaunch to finish", unknown: "Checking", closed: "Not running" };

export function AccessCenter() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const queue = useRef<string[]>([]);
  const mac = isMac();
  useEffect(() => {
    const on = (e: Event) => {
      const next = (e as CustomEvent<Snapshot>).detail;
      setSnap(next);
      setBusy(null);
      // "Turn on everything": one system prompt at a time, the next only after you've answered the last.
      const id = queue.current.shift();
      if (id) { setBusy(id); permissions("request", id); }
    };
    window.addEventListener("shuacrew:permissions", on);
    permissions("list");
    return () => window.removeEventListener("shuacrew:permissions", on);
  }, []);
  if (!mac) return <div className="access-empty"><ShieldCheck size={22} /><p>Access lives in ShuaCrew for Mac: it asks macOS for each permission with the real system prompt.</p></div>;
  const status = (id: string): Status => snap?.permissions.find(p => p.id === id)?.status ?? "unknown";
  const on = CAPS.filter(c => status(c.id) === "granted").length;
  const relaunch = CAPS.some(c => status(c.id) === "relaunch");
  const pending = CAPS.filter(c => status(c.id) === "ask").map(c => c.id);
  const act = (id: string) => { setBusy(id); permissions(status(id) === "denied" ? "open" : "request", id); };
  const everything = () => { queue.current = pending.slice(1); if (pending[0]) { setBusy(pending[0]); permissions("request", pending[0]); } };
  return <div className="access">
    <header className="access-hero">
      <div className="access-ring" style={{ "--p": `${(on / CAPS.length) * 100}` } as React.CSSProperties} aria-label={`${on} of ${CAPS.length} on`}><b>{on}</b><small>of {CAPS.length}</small></div>
      <div className="access-hero-text">
        <h2>{on === CAPS.length ? "Shua can reach everything" : on >= 4 ? "Shua can do most things" : "Give Shua its hands"}</h2>
        <p>Every switch is yours. Shua asks with macOS's own prompt, and only uses what you turn on.</p>
      </div>
      {relaunch ? <button type="button" className="access-cta" onClick={() => permissions("relaunch")}><RotateCw size={14} />Relaunch to finish</button>
        : pending.length > 0 && <button type="button" className="access-cta" onClick={everything}>Turn on everything<span>{pending.length}</span></button>}
    </header>
    <div className="access-grid">
      {CAPS.map(({ id, name, does, icon: Icon, essential }) => {
        const s = status(id);
        return <article key={id} className={`access-tile is-${s}${essential ? " is-essential" : ""}`}>
          <i className="access-icon"><Icon size={17} /></i>
          <div><strong>{name}</strong><p>{does}</p></div>
          <footer>
            <span className="access-state"><i />{LABEL[s]}</span>
            {s === "relaunch" ? <button type="button" onClick={() => permissions("relaunch")}>Relaunch</button>
              : s !== "granted" && <button type="button" disabled={busy === id} onClick={() => act(id)}>{busy === id ? "Asking…" : s === "denied" ? "Open Settings" : "Allow"}</button>}
          </footer>
        </article>;
      })}
    </div>
    {snap && snap.automation.length > 0 && <section className="access-apps">
      <header><Workflow size={15} /><h3>Apps Shua can drive</h3><button type="button" className="access-link" onClick={() => permissions("open", "automation")}>Automation settings</button></header>
      <p>Each app is its own switch: allowing System Events doesn't cover Music.</p>
      <div className="access-chips">{snap.automation.map(app => <button key={app.id} type="button" className={`access-chip is-${app.status}`} disabled={app.status === "granted" || busy === app.id}
        onClick={() => { setBusy(app.id); permissions(app.status === "denied" ? "open" : "automation", app.status === "denied" ? "automation" : app.id); }} title={LABEL[app.status]}>
        <AppWindow size={13} /><span>{app.name}</span><i /></button>)}</div>
    </section>}
    <p className="access-foot"><MonitorSmartphone size={13} /> Screen, microphone and full-disk access reach Shua after a relaunch. That's how macOS works.</p>
  </div>;
}
