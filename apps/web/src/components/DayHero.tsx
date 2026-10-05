import { companionName } from "../lib/companion";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AudioLines, Award, CalendarDays, Briefcase, CheckCircle2, Flame, GraduationCap, Loader2, Lock, Megaphone, Play, Sunrise } from "lucide-react";
import { achievements, streak } from "../lib/achievements";
import { hhmm, upcoming, useDayCalendar } from "../lib/calendar";
import { useLive } from "../lib/live";
import { isTopLevelWork } from "../lib/crew";
import { api } from "../lib/api";
import { localDay, morningBrief } from "../lib/morning";
import { describe } from "../lib/weather";
import { SpeechQueue } from "../lib/buddy-voice";
import { savePower } from "../lib/power";
import { getRadio, loadRadio, playStation } from "../lib/radio";
import { useCompanion } from "../lib/companion";
import { WEATHER_ICONS, useLearningNow, useWeatherNow } from "./TopBarWidgets";

const greeting = (h: number) => (h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");

/**
 * The top of Today: a greeting, the day in one paragraph (built only from what's really in the workspace), and one
 * button that starts the day — Flow mode on, the radio on, and straight to the first thing that needs you.
 */
export function DayHero() {
  const crew = useLive((s) => s.crew);
  const navigate = useNavigate();
  const prefs = useCompanion();
  const w = useWeatherNow(), learn = useLearningNow();
  const cal = useDayCalendar(), meetings = cal.state?.authorized ? upcoming(cal.state.events) : [];
  const [finished, setFinished] = useState<string[]>([]);
  const [speaking, setSpeaking] = useState(false), [starting, setStarting] = useState(false);
  const speech = useRef<SpeechQueue | null>(null);
  // The daily crew standup: a weekday 8:30 schedule that files a note in the Library.
  const [standupOn, setStandupOn] = useState<boolean | null>(null);
  useEffect(() => { void api<{ on: boolean }>("/api/standup").then((r) => setStandupOn(r.on)).catch(() => setStandupOn(null)); }, []);
  const toggleStandup = () => { const on = !standupOn; setStandupOn(on); void api("/api/standup", { body: { on } }).catch(() => setStandupOn(!on)); };
  const standup = Object.values(crew.artifacts ?? {}).filter((a) => a.title?.startsWith("Crew standup")).sort((a, b) => b.createdAt - a.createdAt)[0];
  useEffect(() => {
    void api<{ sections?: Array<{ title: string; items: Array<{ text: string }> }> }>("/api/briefing")
      .then((b) => setFinished((b.sections ?? []).find((x) => /finish/i.test(x.title))?.items.map((x) => x.text) ?? []))
      .catch(() => setFinished([]));
    return () => speech.current?.stop();
  }, []);

  const now = new Date();
  const runs = Object.values(crew.runs).filter((r) => isTopLevelWork(r, crew.runs));
  const running = runs.filter((r) => ["running", "planning"].includes(r.status));
  const approvals = Object.values(crew.approvals).sort((a, b) => a.seq - b.seq);
  const ventures = Object.values(crew.ventures ?? {});
  const venture = ventures.find((v) => v.stage !== "earning" && v.stage !== "stopped");
  const due = learn.value?.due ?? 0, goal = learn.value?.profile?.goal?.trim();
  const brief = useMemo(() => morningBrief({ now, goal, finished, waiting: approvals.length, due, ventures: ventures.map((v) => ({ name: v.name, stage: v.stage })), running: running.length, meetings: meetings.map((m) => ({ title: m.title, time: hhmm(m.start) })) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [finished, approvals.length, due, goal, running.length, ventures.length, venture?.stage, meetings.length, meetings[0]?.start]);
  const wx = w.value ? describe(w.value.code, w.value.day) : null, WxIcon = wx ? WEATHER_ICONS[wx.icon] : null;
  const rainSoon = w.value?.hours.find((h) => h.rain >= 50);

  const speak = () => {
    if (speaking) { speech.current?.stop(); return; }
    speech.current ??= new SpeechQueue();
    speech.current.onSpeaking = setSpeaking;
    speech.current.unlock();
    for (const sentence of brief.match(/[^.!?]+[.!?]+/g) ?? [brief]) speech.current.say(sentence.trim());
  };
  // shuacrew://start-day (Shortcuts, Siri) lands here and presses the button.
  const startRef = useRef<() => void>(() => {});
  useEffect(() => { const on = () => startRef.current(); window.addEventListener("shuacrew:start-day", on); return () => window.removeEventListener("shuacrew:start-day", on); }, []);
  const startDay = async () => {
    setStarting(true);
    try {
      savePower({ flow: true });
      const r = getRadio(); if (!r.loaded) await loadRadio();
      const radio = getRadio();
      if (!radio.playing) {
        const pick = radio.stations.find((s) => s.id === radio.station && s.tracks.length)?.id ?? radio.youtube.find((s) => s.id === radio.station)?.id
          ?? radio.stations.find((s) => s.tracks.length)?.id ?? radio.youtube[0]?.id;
        if (pick) await playStation(pick);
      }
      try { localStorage.setItem("shuacrew.morning", localDay(now)); } catch { /* ignore */ }
      if (approvals[0]?.run) void navigate({ to: "/sessions/$id", params: { id: approvals[0].run } });
      else if (running[0]) void navigate({ to: "/sessions/$id", params: { id: running[0].id } });
      else void navigate({ to: "/" }).then(() => window.dispatchEvent(new Event("shuacrew:compose")));
    } finally { setStarting(false); }
  };

  // Streaks and achievements from real activity.
  const doneRuns = runs.filter((r) => (r.status === "done" || r.status === "merged") && !r.labels?.includes("buddy"));
  const shippedDays = new Set(doneRuns.map((r) => localDay(new Date(r.updatedAt))));
  const learnDays = new Set((learn.value?.days ?? []).filter((d) => d.reviews > 0).map((d) => d.day));
  const reviewed = (learn.value?.days ?? []).reduce((n, d) => n + d.reviews, 0);
  const badges = achievements({ shippedDays, shipped: doneRuns.length, learnDays, reviewed, ventures: ventures.length, earning: ventures.filter((v) => v.stage === "earning").length, members: Object.keys(crew.members).length }, now);
  const earned = badges.filter((b) => b.earned), nextUp = badges.filter((b) => !b.earned).slice(0, 2);
  const learnStreak = streak(learnDays, now), shipStreak = streak(shippedDays, now);

  startRef.current = () => void startDay();
  const plan: Array<{ icon: typeof Play; label: string; value: string; go: () => void; tone: "wait" | "live" | "ok" | "idle" }> = [
    { icon: CheckCircle2, label: "Needs you", value: approvals.length ? `${approvals.length} decision${approvals.length === 1 ? "" : "s"}` : "Nothing waiting", tone: approvals.length ? "wait" : "ok", go: () => void navigate({ to: "/board" }) },
    { icon: Loader2, label: "In progress", value: running.length ? `${running.length} session${running.length === 1 ? "" : "s"} working` : "Crew is idle", tone: running.length ? "live" : "idle", go: () => void navigate({ to: "/board" }) },
    { icon: GraduationCap, label: "Learning", value: due ? `${due} card${due === 1 ? "" : "s"} due` : goal ? "All caught up" : "Set a career goal", tone: due ? "wait" : "ok", go: () => void navigate({ to: "/learn" }) },
    { icon: Briefcase, label: "Venture", value: venture ? `${venture.name} · ${venture.stage}` : ventures.length ? "All earning" : "No ventures yet", tone: venture ? "live" : "idle", go: () => void navigate({ to: "/ventures" }) },
  ];

  // Order: who/when, then the brief, then what you can act on; streaks, badges and the standup sit quietly underneath.
  return <section className="day-hero" aria-label="Start your day">
    <div className="day-hero-top">
      <div className="day-hero-hello">
        <span className="day-hero-date"><Sunrise size={13} /> {now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</span>
        <h1>{greeting(now.getHours())}.</h1>
        <div className="day-hero-facts">
          {cal.available && (cal.state?.authorized
            ? <span className="day-fact"><CalendarDays size={13} /> {meetings.length ? `Next: ${meetings[0]!.title} at ${hhmm(meetings[0]!.start)}${meetings.length > 1 ? ` · ${meetings.length} meetings left` : ""}` : "No more meetings today"}</span>
            : <button type="button" className="day-fact day-cal-connect" onClick={cal.connect}><CalendarDays size={13} /> Connect calendar</button>)}
          {w.value && WxIcon && wx && <span className="day-fact"><WxIcon size={13} /> {w.value.temp}° {wx.label.toLowerCase()}{rainSoon ? ` · rain around ${rainSoon.time}` : ""}</span>}
        </div>
      </div>
      <div className="day-hero-actions">
        <button type="button" className="day-hero-start" onClick={() => void startDay()} disabled={starting} title="Turns on Flow mode, puts your radio on, and opens the first thing that needs you">
          <Play size={16} /> {starting ? "Starting…" : "Start my day"}
        </button>
        <button type="button" className={`day-hero-hear ${speaking ? "is-on" : ""}`} onClick={speak} aria-pressed={speaking}>
          <AudioLines size={15} /> {speaking ? "Stop" : `Hear it from ${companionName(prefs)}`}
        </button>
      </div>
    </div>
    <p className="day-hero-brief">{brief}</p>
    <div className="day-plan">{plan.map((p) => <button key={p.label} type="button" className={`day-plan-card is-${p.tone}`} onClick={p.go}>
      <p.icon size={15} /><span><small>{p.label}</small><b>{p.value}</b></span>
    </button>)}</div>
    <div className="day-hero-foot">
      <div className="day-streaks" aria-label="Streaks and achievements">
        {learnStreak > 0 && <span className="day-streak is-on"><Flame size={13} /> {learnStreak}-day learning streak</span>}
        {shipStreak > 0 && <span className="day-streak is-on"><Flame size={13} /> {shipStreak}-day shipping streak</span>}
        {earned.length > 0 && <span className="day-badge is-earned" title={earned.map((b) => `${b.name}: ${b.how}`).join("\n")}><Award size={12} /><span className="day-badge-names">{earned.map((b) => b.name).join(" · ")}</span></span>}
        {nextUp[0] && <span className="day-badge" title={nextUp[0].how}><Lock size={11} /> Next: {nextUp[0].name}{nextUp[0].progress ? ` · ${nextUp[0].progress}` : ""}</span>}
      </div>
      {standupOn !== null && <span className="day-standup">
        <Megaphone size={13} />
        {standup ? <button type="button" onClick={() => void navigate({ to: "/library", hash: standup.id })}>{standup.title}</button> : <span>Crew standup</span>}
        <button type="button" role="switch" aria-checked={standupOn} className={`day-switch ${standupOn ? "is-on" : ""}`} onClick={toggleStandup} title={standupOn ? "Weekdays at 8:30 · click to turn off" : "Turn on a weekday 8:30 standup from your crew"}><i /></button>
      </span>}
    </div>
  </section>;
}
