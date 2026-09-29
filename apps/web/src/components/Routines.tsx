import { useEffect, useState } from "react";
import { BookOpen, Megaphone, Radar, TrendingUp } from "lucide-react";
import { api } from "../lib/api";

interface Routine { id: string; name: string; when: string; about: string; on: boolean }
const ICON: Record<string, typeof Radar> = { "crew-standup": Megaphone, "weekly-growth": TrendingUp, "competitor-watch": Radar, "personal-wiki": BookOpen };

/** One switch per crew routine. Each is a normal schedule underneath and files its result in the Library. */
export function Routines({ onChange }: { onChange?: () => void }) {
  const [list, setList] = useState<Routine[]>([]);
  const load = async () => {
    const [routines, standup] = await Promise.all([api<Routine[]>("/api/routines").catch(() => []), api<{ on: boolean }>("/api/standup").catch(() => null)]);
    setList([...(standup ? [{ id: "crew-standup", name: "Crew standup", when: "weekdays 8:30am", about: "Weekdays at 8:30: two lines per crew member from real session data.", on: standup.on }] : []), ...routines]);
  };
  useEffect(() => { void load(); }, []);
  const flip = async (r: Routine) => {
    setList((l) => l.map((x) => (x.id === r.id ? { ...x, on: !x.on } : x)));
    await (r.id === "crew-standup" ? api("/api/standup", { body: { on: !r.on } }) : api(`/api/routines/${r.id}`, { body: { on: !r.on } })).catch(() => {});
    await load(); onChange?.();
  };
  if (!list.length) return null;
  return <section className="routines" aria-label="Crew routines">
    <header><strong>Crew routines</strong><span>Each runs as a crew session on its schedule and files a note in your Library. Each run uses your model plan.</span></header>
    <div className="routines-grid">{list.map((r) => { const Icon = ICON[r.id] ?? Radar; return <div key={r.id} className={`routine ${r.on ? "is-on" : ""}`}>
      <Icon size={16} />
      <span><b>{r.name}</b><small>{r.about}</small></span>
      <button type="button" role="switch" aria-checked={r.on} aria-label={r.name} className={`day-switch ${r.on ? "is-on" : ""}`} onClick={() => void flip(r)}><i /></button>
    </div>; })}</div>
  </section>;
}
