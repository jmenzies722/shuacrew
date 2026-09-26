import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { companionPose, celebrateCompletion, useCompanion, type CompanionPose, type CompanionPreferences } from "../lib/companion";
import { useLive } from "../lib/live";
import { loadFocus, pauseFocus, remainingFocusMs, resumeFocus, saveFocus, startFocus, formatFocusRemaining, type FocusTimer } from "../lib/focus-timer";
import "./companion.css";

/** Sprite slot for the original Spark atlas: 7 accessories × 3 faces. Same math for full-body and portrait — portrait is a CSS zoom on the head, not a different slot. */
export function sparkAtlasStyle(face: CompanionPreferences["face"], accessory: CompanionPreferences["accessory"]): CSSProperties {
  const col = ["none", "cap", "headphones", "scarf", "glasses", "antenna", "badge"].indexOf(accessory);
  const row = ["calm", "curious", "bright"].indexOf(face);
  return { backgroundPosition: `${col / 6 * 100}% ${row / 2 * 100}%` };
}
export function SparkArt({ preferences, crop = "full" }: { preferences: CompanionPreferences; crop?: "full" | "portrait" }) {
  return <span className={`spark-art ${crop === "portrait" ? "is-portrait" : ""}`} aria-hidden="true" style={sparkAtlasStyle(preferences.face, preferences.accessory)} />;
}
const LABEL: Record<CompanionPose, string> = { offline: "Offline · activity unknown", review: "A decision needs you", failed: "Work needs attention", working: "Working on your tasks", idle: "Ready when you are" };
export function Companion({ preferences, pose, decisions, members = [], openDecisions, openCrew, startFocus, celebrating = false }: {
  preferences: CompanionPreferences; pose: CompanionPose; decisions: number; members?: Array<{ id: string; name: string; open(): void }>;
  openDecisions(): void; openCrew(): void; startFocus(): void; celebrating?: boolean;
}) {
  const [open, setOpen] = useState(false), [waving, setWaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!preferences.enabled) return null;
  return <div className={`companion-widget presence-${preferences.presence} pose-${pose} ${waving ? "is-waving" : ""} ${celebrating && pose === "idle" && preferences.celebration !== "off" ? `is-celebrating celebration-${preferences.celebration}` : ""}`}>
    <button className="companion-trigger" aria-expanded={open} aria-label={`${preferences.nickname}: ${LABEL[pose]}. Open companion controls`} onClick={() => setOpen(value => !value)}><SparkArt preferences={preferences} /><span><strong>{preferences.nickname}</strong><small>{LABEL[pose]}</small></span></button>
    {preferences.kind === "crew" && <div className="companion-members" aria-label="Your crew">{members.slice(0, 4).map(member => <button key={member.id} aria-label={`Open ${member.name}'s work`} onClick={member.open}>{member.name.slice(0, 1)}</button>)}{members.length > 4 && <button onClick={openCrew} aria-label={`Open ${members.length - 4} more crew members`}>+{members.length - 4}</button>}</div>}
    {open && <div className="companion-controls"><button onClick={openDecisions}>{decisions ? `${decisions} pending decision${decisions === 1 ? "" : "s"}` : "Open decisions"}</button><button onClick={openCrew}>Open crew</button><button onClick={startFocus}>Start focus</button><button onClick={() => { setWaving(true); clearTimeout(timer.current); timer.current = setTimeout(() => setWaving(false), 700); }}>Wave</button></div>}
  </div>;
}

export function FocusTimerControl() {
  const [timer, setTimer] = useState<FocusTimer | null>(loadFocus), [now, setNow] = useState(Date.now), [notice, setNotice] = useState("");
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") setNow(Date.now()); };
    const interval = setInterval(tick, 1000); document.addEventListener("visibilitychange", tick);
    const changed = () => { setTimer(loadFocus()); setNow(Date.now()); };
    window.addEventListener("shuacrew:focus", changed);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", tick); window.removeEventListener("shuacrew:focus", changed); };
  }, []);
  const update = (next: FocusTimer | null) => { setTimer(next); setNow(Date.now()); const saved = saveFocus(next); setNotice(saved ? "" : "Storage unavailable; timer cannot survive relaunch."); if (saved) window.dispatchEvent(new Event("shuacrew:focus")); };
  const remaining = timer ? remainingFocusMs(timer, now) : 0;
  return <div className="focus-control"><div><strong>{timer ? formatFocusRemaining(remaining) : "A little room to focus"}</strong><small>Local timer · no agent work or notifications started</small></div><div className="companion-controls">{!timer ? ([15, 25, 50] as const).map(minutes => <button key={minutes} onClick={() => update(startFocus(minutes))}>{minutes} min</button>) : <>{remaining > 0 && <button onClick={() => update(timer.pausedRemainingMs === null ? pauseFocus(timer) : resumeFocus(timer))}>{timer.pausedRemainingMs === null ? "Pause" : "Resume"}</button>}<button onClick={() => update(null)}>Reset timer</button></>}</div>{notice && <p role="status">{notice}</p>}</div>;
}

export function CompanionHost() {
  const preferences = useCompanion(), navigate = useNavigate(), location = useLocation();
  const crew = useLive(s => s.crew), connection = useLive(s => s.connection), activity = useLive(s => s.activity);
  const [focusOpen, setFocusOpen] = useState(false), [visible, setVisible] = useState(true), [celebrating, setCelebrating] = useState(false);
  const history = useRef({ seen: [] as string[], watermark: -1, lastCelebratedAt: 0 });
  const approvals = Object.values(crew.approvals), runs = Object.values(crew.runs).filter(run => run.runtime !== "mock");
  const pose = companionPose({ connected: connection === "live", needsApproval: approvals.length > 0, failed: runs.some(run => run.status === "failed" && Date.now() - run.updatedAt < 3600000), active: runs.some(run => ["running", "planning", "queued"].includes(run.status)) });
  useEffect(() => { const change = () => setVisible(document.visibilityState === "visible"); change(); document.addEventListener("visibilitychange", change); return () => document.removeEventListener("visibilitychange", change); }, []);
  useEffect(() => {
    if (connection !== "live") { history.current.watermark = -1; return; }
    const head = activity.at(-1)?.seq ?? 0;
    if (!preferences.enabled || history.current.watermark < 0) { history.current.watermark = head; return; }
    let celebrate = false;
    for (const event of activity) if (event.kind === "run.status" && event.body.status === "done") {
      const result = celebrateCompletion(history.current, { id: String(event.seq), seq: event.seq }, Date.now(), pose);
      history.current = result.state; celebrate ||= result.celebrate;
    }
    history.current.watermark = Math.max(history.current.watermark, head);
    if (celebrate && visible) { setCelebrating(true); const timer = setTimeout(() => setCelebrating(false), 1000); return () => clearTimeout(timer); }
  }, [activity, connection, preferences.enabled, pose, visible]);
  if (!preferences.enabled || preferences.placement === "room-header" && !location.pathname.startsWith("/rooms")) return null;
  return <aside className={`companion-dock ${!visible ? "is-background" : ""}`} aria-label="Workspace companion"><Companion preferences={preferences} pose={pose} decisions={approvals.length} celebrating={celebrating} members={Object.values(crew.members).map(member => ({ id: member.id, name: member.name, open: () => { const run = runs.find(r => r.member === member.id); void (run ? navigate({ to: "/sessions/$id", params: { id: run.id } }) : navigate({ to: "/crew" })); } }))} openDecisions={() => void navigate({ to: "/activity" })} openCrew={() => void navigate({ to: "/crew" })} startFocus={() => setFocusOpen(value => !value)} />{focusOpen && <FocusTimerControl />}</aside>;
}
