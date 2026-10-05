import { useEffect, useState } from "react";
import { Calendar, CheckCircle2, Contact, FolderOpen, ListChecks, Mic, Monitor, MousePointerClick, Music } from "lucide-react";
import { PANES, paneURL } from "../lib/settings-panes";
import "./spark-reach.css";

/**
 * What Spark can reach on this Mac, live: each ability, whether macOS has allowed it, and one tap to the exact switch
 * in System Settings. It re-checks whenever you come back to the window, so it updates the moment you flip a switch.
 */
type State = "granted" | "denied" | "not asked";
const ABILITIES: Array<{ key: string; pane: string; icon: typeof Monitor; name: string; does: string; optional?: boolean }> = [
  { key: "screen", pane: "screen-recording", icon: Monitor, name: "See your screen", does: "Reads what's on screen to point, guide and notice when you're stuck." },
  { key: "accessibility", pane: "accessibility-access", icon: MousePointerClick, name: "Click and type for you", does: "Finds every button, icon and menu exactly, and does steps on autopilot." },
  { key: "files", pane: "full-disk-access", icon: FolderOpen, name: "Everywhere, no prompts", does: "Optional (Full Disk Access). Shua already reads your files; this skips the one-time folder prompts and adds iCloud Drive and external drives.", optional: true },
  { key: "calendar", pane: "calendars-access", icon: Calendar, name: "Calendar", does: "Knows what's next and plans around your meetings." },
  { key: "reminders", pane: "reminders-access", icon: ListChecks, name: "Reminders", does: "Tells you what's due and adds reminders when you ask." },
  { key: "contacts", pane: "contacts-access", icon: Contact, name: "Contacts", does: "Knows who you mean: “email Sam”, “what's Mia's number”." },
  { key: "microphone", pane: "microphone", icon: Mic, name: "Microphone", does: "Voice mode: just talk, and it answers out loud." },
  { key: "music", pane: "automation", icon: Music, name: "Music & apps", does: "Plays, pauses, shuffles and opens things in Music, Spotify and Notes." },
];

const native = () => (window as unknown as { webkit?: { messageHandlers?: { shuacrew?: { postMessage: (m: unknown) => void } } } }).webkit?.messageHandlers?.shuacrew;
function ask<T>(action: Record<string, unknown>): Promise<T | null> {
  const bridge = native(); if (!bridge) return Promise.resolve(null);
  return new Promise((resolve) => {
    const id = crypto.randomUUID();
    const t = setTimeout(() => { window.removeEventListener("shuacrew:did", on as EventListener); resolve(null); }, 3000);
    const on = (e: CustomEvent<{ id: string; ok: boolean; output?: string }>) => {
      if (e.detail.id !== id) return; clearTimeout(t); window.removeEventListener("shuacrew:did", on as EventListener);
      try { resolve(JSON.parse(e.detail.output ?? "null") as T); } catch { resolve(null); }
    };
    window.addEventListener("shuacrew:did", on as EventListener);
    bridge.postMessage({ type: "buddyDo", id, action });
  });
}

export function MacReach({ name }: { name: string }) {
  const [states, setStates] = useState<Record<string, State> | null>(null);
  useEffect(() => {
    const load = () => void ask<Record<string, State>>({ type: "mac", op: "permissions" }).then((s) => s && setStates(s));
    load(); window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, []);
  // Not asked yet: bring up macOS's own prompt right now (the app isn't on the Settings list until it has asked once).
  const [asking, setAsking] = useState("");
  const request = (key: string) => {
    setAsking(key);
    const t = setTimeout(() => setAsking(""), 125_000);
    void (async () => {
      const bridge = native(); if (!bridge) return;
      const id = crypto.randomUUID();
      const on = (e: CustomEvent<{ id: string; output?: string }>) => {
        if (e.detail.id !== id) return; window.removeEventListener("shuacrew:did", on as EventListener); clearTimeout(t); setAsking("");
        try { setStates(JSON.parse(e.detail.output ?? "null")); } catch { /* keep */ }
      };
      window.addEventListener("shuacrew:did", on as EventListener);
      bridge.postMessage({ type: "buddyDo", id, action: { type: "mac", op: "request_access", what: key } });
    })();
  };
  const open = (paneKey: string) => {
    const pane = PANES.find((p) => p.key === paneKey); if (!pane) return;
    native()?.postMessage({ type: "buddyDo", id: crypto.randomUUID(), action: { type: "open_settings", pane: pane.key, url: paneURL(pane) } });
  };
  if (!native()) return <p className="reach-note">{name}'s reach on your Mac is set up in the ShuaCrew Mac app.</p>;
  const known = ABILITIES.filter((a) => a.key !== "music" && !a.optional);
  const on = known.filter((a) => states?.[a.key] === "granted").length;
  const pct = states ? on / known.length : 0;
  return <section className="reach" aria-label={`What ${name} can reach`}>
    <header className="reach-head">
      <svg viewBox="0 0 44 44" className="reach-ring" aria-hidden><circle cx="22" cy="22" r="19" /><circle cx="22" cy="22" r="19" className="is-fill" style={{ strokeDashoffset: `${119.4 * (1 - pct)}` }} /></svg>
      <div><strong>{states ? `${on} of ${known.length} on` : "Checking…"}</strong><small>What {name} can reach on this Mac. Everything stays on this Mac; turn on what you want it to help with.</small></div>
    </header>
    <ul className="reach-list">{ABILITIES.map(({ key, pane, icon: Icon, name: label, does, optional }) => {
      const st = key === "music" ? null : states?.[key];
      return <li key={key} className={st === "granted" ? "is-on" : ""}>
        <i className="reach-icon"><Icon size={15} /></i>
        <span className="reach-text"><b>{label}{optional && <span className="reach-optional">optional</span>}</b><small>{does}</small></span>
        {st === "granted" ? <em className="reach-on"><CheckCircle2 size={13} /> On</em>
          : asking === key ? <em className="reach-asking">Answer the prompt…</em>
          : <button type="button" className="reach-go" onClick={() => (st === "not asked" && ["reminders", "contacts", "calendar"].includes(key) ? request(key) : open(pane))}>{key === "music" ? "Review" : st === "not asked" ? "Allow" : "Turn on"}</button>}
      </li>;
    })}</ul>
  </section>;
}
