import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Brain, CalendarClock, Gauge } from "lucide-react";
import { api } from "../lib/api";
import { useLive } from "../lib/live";
import { useCompanion } from "../lib/companion";
import { brainPreference } from "./CompanionModelPicker";
import { selectIntelligence, type IntelligenceChoice } from "../lib/intelligence";
import { autopilotWeek } from "../lib/autopilot-week";
import { SPEED_WINDOWS, firstMeasured, lastDay, msLabel, nextAutopilot, whenLabel, type JournalStats, type PulseSchedule, type VoiceStats } from "../lib/home-pulse";
import "./home-pulse.css";

const FRIENDLY: Record<string, string> = { claude: "Claude", codex: "Codex", local: "This Mac", mock: "Demo" };
type Schedule = PulseSchedule & { ask?: string; script?: string };
const quiet = <T,>(p: Promise<T>) => p.catch(() => null);

/**
 * Home's pulse: three cards under the box — Intelligence, Autopilot, Speed — each one real number from the gateway and
 * a door to where it lives. A card with nothing measured says so instead of showing a zero.
 */
export function HomePulse() {
  const prefs = useCompanion();
  const knowledge = useLive((s) => Object.keys(s.crew.knowledge ?? {}).length);
  const limited = useLive((s) => s.crew.limited);
  const head = useLive((s) => s.crew.head);
  // undefined while asking; null when the gateway couldn't be asked (the card says so instead of spinning forever).
  const [brain, setBrain] = useState<IntelligenceChoice | null | undefined>(undefined);
  const [lessons, setLessons] = useState<number | null>(null);
  const [schedules, setSchedules] = useState<Schedule[] | null>(null);
  const [voice, setVoice] = useState<[number, VoiceStats] | null | undefined>(undefined);
  const [steps, setSteps] = useState<[number, JournalStats] | null | undefined>(undefined);

  // The brain follows your Shua settings, exactly as the notch asks for one.
  const brainKey = `${prefs.brain}|${prefs.voiceEngine}|${prefs.modelChoice}|${prefs.localModel}`;
  useEffect(() => {
    let live = true;
    void quiet(selectIntelligence({ ask: "Shua availability", mode: prefs.brain, ...brainPreference(prefs), localModel: prefs.localModel, purpose: "conversation", images: false, tier: "fast" }))
      .then((c) => { if (live) setBrain(c); });
    return () => { live = false; };
  }, [brainKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Everything else in one parallel round trip; refreshed as the log moves (a schedule fired, a lesson learned).
  useEffect(() => {
    let live = true;
    const windows = (path: string) => Promise.all(SPEED_WINDOWS.map((d) => quiet(api<VoiceStats & JournalStats>(`${path}?days=${d}`)).then((s) => [d, s] as [number, typeof s])));
    void Promise.all([quiet(api<Schedule[]>("/api/schedules")), quiet(api<{ lessons: unknown[] }>("/api/memory")), windows("/api/shua/voice"), windows("/api/shua/journal")])
      .then(([sch, mem, v, j]) => {
        if (!live) return;
        setSchedules(sch ?? []); setLessons(mem ? mem.lessons.length : null);
        setVoice(firstMeasured(v)); setSteps(firstMeasured(j));
      });
    return () => { live = false; };
  }, [Math.floor(head / 25)]); // eslint-disable-line react-hooks/exhaustive-deps

  const now = Date.now();
  const resting = Object.entries(limited ?? {}).filter(([, w]) => w.until > now).map(([id]) => FRIENDLY[id] ?? id);
  const next = schedules ? nextAutopilot(schedules, now) : null;
  const week = schedules ? autopilotWeek(schedules.map((s) => ({ ...s, paused: !!s.paused })), now).reduce((n, d) => n + d.runs.length, 0) : 0;
  const day = schedules ? lastDay(schedules, now) : { ok: 0, failed: 0 };

  const known = [lessons !== null ? `${lessons} lesson${lessons === 1 ? "" : "s"}` : null, knowledge ? `${knowledge} note${knowledge === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ");
  const cards = [
    { id: "intelligence", to: "/memory", icon: Brain, label: "Intelligence",
      value: brain === undefined ? "…" : brain === null ? "Couldn't check" : brain.runtime ? FRIENDLY[brain.runtime] ?? brain.runtime : "No brain free",
      detail: brain?.runtime ? brain.model : brain?.reason,
      sub: [resting.length ? `${resting.join(", ")} resting on a limit` : null, known || "Nothing learned yet"].filter(Boolean).join(" · ") },
    { id: "autopilot", to: "/schedules", icon: CalendarClock, label: "Autopilot",
      value: schedules === null ? "…" : next ? whenLabel(next.at, now) : "Nothing scheduled",
      detail: next?.name,
      sub: schedules === null ? "" : [`${week} run${week === 1 ? "" : "s"} this week`, day.ok || day.failed ? `last 24 h: ${day.ok} ok${day.failed ? `, ${day.failed} failed` : ""}` : null].filter(Boolean).join(" · "),
      tone: day.failed ? "bad" : undefined },
    { id: "speed", to: "/observability", icon: Gauge, label: "Speed",
      value: voice === undefined ? "…" : voice?.[1].p50 != null ? msLabel(voice[1].p50) : "Not measured",
      detail: voice ? `to Shua's first word · ${voice[0]} days` : "Talk to Shua and it's timed",
      sub: steps === undefined ? "" : steps?.[1].rate != null ? `On-screen steps ${Math.round(steps[1].rate * 100)}% right (${steps[1].total})` : "On-screen steps not measured yet" },
  ];

  return <div className="home-pulse" aria-label="Intelligence, autopilot and speed">
    {cards.map(({ id, to, icon: Icon, label, value, detail, sub, ...rest }) =>
      <Link key={id} to={to} className={`hp-card is-${id}${"tone" in rest && rest.tone ? ` is-${rest.tone}` : ""}`}>
        <span className="hp-label"><Icon size={13} strokeWidth={2} aria-hidden />{label}<ArrowUpRight size={13} className="hp-go" aria-hidden /></span>
        <strong className="hp-value">{value}</strong>
        {detail && <span className="hp-detail" title={detail}>{detail}</span>}
        {sub && <small className="hp-sub">{sub}</small>}
      </Link>)}
  </div>;
}
