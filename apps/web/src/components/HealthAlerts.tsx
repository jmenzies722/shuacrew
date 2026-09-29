import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, OctagonAlert } from "lucide-react";
import { api } from "../lib/api";

interface Alert { id: string; level: "warn" | "critical"; text: string }
/** Health at a glance: real problems from the gateway's own measurements, or a plain "all clear". */
export function HealthAlerts() {
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  useEffect(() => {
    const load = () => void api<{ alerts?: Alert[] }>("/api/status").then((s) => setAlerts(s.alerts ?? [])).catch(() => setAlerts(null));
    load(); const t = setInterval(load, 30_000); return () => clearInterval(t);
  }, []);
  if (alerts === null) return null;
  if (!alerts.length) return <p className="health-ok"><CheckCircle2 size={14} /> All clear — gateway memory, disk, voice engine and runtimes are healthy. You'll get a notification if that changes.</p>;
  return <ul className="health-alerts">{alerts.map((a) => <li key={a.id} className={`is-${a.level}`}>{a.level === "critical" ? <OctagonAlert size={15} /> : <AlertTriangle size={15} />}<span>{a.text}</span></li>)}</ul>;
}
