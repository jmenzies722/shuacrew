import { useEffect, useRef, useState } from "react";
import { Bell, BellOff, RefreshCw } from "lucide-react";
import { isMac, notificationSettings, settleNotificationRequest, type NativeNotificationPreferences } from "../lib/native";

type Snapshot = { preferences: NativeNotificationPreferences; permission: string; requestId: string; updating: boolean; error?: string };
type Flag = "enabled" | "approvals" | "completions" | "reviews" | "briefings" | "sounds" | "quietHours";

export function NotificationSettings() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pendingWrite = useRef<string | null>(null);
  useEffect(() => {
    if (!isMac()) return;
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<Snapshot>).detail;
      const next = settleNotificationRequest(pendingWrite.current, detail.requestId, detail.updating);
      pendingWrite.current = next.pending;
      setSnapshot(detail);
      setSaving(next.busy);
      setError(detail.error ?? "");
      clearTimeout(timeout);
    };
    const refresh = () => notificationSettings();
    const timeout = setTimeout(() => setError("The Mac app did not respond. Update or relaunch ShuaCrew, then retry."), 5000);
    window.addEventListener("shuacrew:notifications", receive);
    window.addEventListener("focus", refresh);
    refresh();
    return () => { clearTimeout(timeout); window.removeEventListener("shuacrew:notifications", receive); window.removeEventListener("focus", refresh); };
  }, []);
  const update = (change: Partial<NativeNotificationPreferences>) => {
    if (!snapshot || saving || pendingWrite.current) return;
    setError("");
    setSaving(true);
    pendingWrite.current = notificationSettings({ ...snapshot.preferences, ...change });
    if (!pendingWrite.current) { setSaving(false); setError("Open the installed Mac app to change notifications."); }
  };
  if (!isMac()) return <div className="settings-card p-5 text-[13px] text-fg-2">Native alerts are configured in the installed ShuaCrew Mac app. The in-app activity and approval panels are always available.</div>;
  const prefs = snapshot?.preferences;
  const flag = (field: Flag, name: string, detail: string) => <label className="preference-row" key={field}>
    <span><strong>{name}</strong><small>{detail}</small></span><input type="checkbox" role="switch" aria-label={name} checked={prefs?.[field] ?? false} disabled={!prefs || saving} onChange={(e) => update({ [field]: e.target.checked })} />
  </label>;
  return <div className="settings-card">
    <div className="notification-status" role="status">
      {prefs?.enabled ? <Bell size={18} /> : <BellOff size={18} />}<div><strong>{saving ? "Saving · respond to macOS if prompted" : !prefs ? "Connecting to the Mac app…" : !prefs.enabled ? "Desktop alerts are off" : snapshot.permission === "denied" ? "macOS permission is blocked" : snapshot.permission === "authorized" || snapshot.permission === "provisional" ? "Desktop alerts are enabled" : "macOS permission is needed"}</strong>
      <p>{snapshot?.permission === "denied" ? "Allow ShuaCrew in System Settings → Notifications, then refresh. Your preferences are saved." : "Alerts appear when ShuaCrew is in the background. Quiet hours use this Mac's local time; muted alerts are not replayed later."}</p></div>
      <button aria-label="Refresh notification permission" title="Refresh permission" disabled={saving} onClick={() => notificationSettings()}><RefreshCw size={15} /></button>
    </div>
    {error && <p className="px-5 pb-3 text-[12px] text-bad" role="alert">{error}</p>}
    {flag("enabled", "Desktop alerts", "Turning this on asks macOS for permission. No prompt is shown on launch.")}
    {flag("completions", "Session finishes", "Know when background work finishes or fails.")}
    {flag("approvals", "Approval requests", "Be told when an agent needs a decision. Policy and the approval inbox stay active when muted.")}
    {flag("reviews", "Playbook reviews", "Get an alert when a phase needs review or has failed.")}
    {flag("briefings", "Morning briefing", "A short notification when a new daily briefing is available.")}
    {flag("sounds", "Notification sounds", "Respect macOS sound settings; never bypass Focus or use critical alerts.")}
    {flag("quietHours", "Quiet hours", "Silence all desktop alerts during these hours. They remain visible in the app.")}
    {prefs?.quietHours && <div className="notification-hours">{(["quietStart", "quietEnd"] as const).map((field) => <label key={field}>{field === "quietStart" ? "From" : "Until"}<select aria-label={field === "quietStart" ? "Quiet hours start" : "Quiet hours end"} disabled={saving} value={prefs[field]} onChange={(e) => update({ [field]: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>)}</select></label>)}</div>}
  </div>;
}
