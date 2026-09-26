import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AudioLines, Briefcase, CheckCircle2, GraduationCap, Loader2, Megaphone, Play, Radio as RadioIcon, Sunrise } from "lucide-react";
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
  const brief = useMemo(() => morningBrief({ now, goal, finished, waiting: approvals.length, due, ventures: ventures.map((v) => ({ name: v.name, stage: v.stage })), running: running.length }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [finished, approvals.length, due, goal, running.length, ventures.length, venture?.stage]);
  const wx = w.value ? describe(w.value.code, w.value.day) : null, WxIcon = wx ? WEATHER_ICONS[wx.icon] : null;
  const rainSoon = w.value?.hours.find((h) => h.rain >= 50);

  const speak = () => {
    if (speaking) { speech.current?.stop(); return; }
    speech.current ??= new SpeechQueue();
    speech.current.onSpeaking = setSpeaking;
    speech.current.unlock();
    for (const sentence of brief.match(/[^.!?]+[.!?]+/g) ?? [brief]) speech.current.say(sentence.trim());
  };
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

  const plan: Array<{ icon: typeof Play; label: string; value: string; go: () => void; tone: "wait" | "live" | "ok" | "idle" }> = [
    { icon: CheckCircle2, label: "Needs you", value: approvals.length ? `${approvals.length} decision${approvals.length === 1 ? "" : "s"}` : "Nothing waiting", tone: approvals.length ? "wait" : "ok", go: () => void navigate({ to: "/board" }) },
    { icon: Loader2, label: "In progress", value: running.length ? `${running.length} session${running.length === 1 ? "" : "s"} working` : "Crew is idle", tone: running.length ? "live" : "idle", go: () => void navigate({ to: "/board" }) },
    { icon: GraduationCap, label: "Learning", value: due ? `${due} card${due === 1 ? "" : "s"} due` : goal ? "All caught up" : "Set a career goal", tone: due ? "wait" : "ok", go: () => void navigate({ to: "/learn" }) },
    { icon: Briefcase, label: "Venture", value: venture ? `${venture.name} · ${venture.stage}` : ventures.length ? "All earning" : "No ventures yet", tone: venture ? "live" : "idle", go: () => void navigate({ to: "/ventures" }) },
  ];

  return <section className="day-hero" aria-label="Start your day">
    <div className="day-hero-top">
      <div className="day-hero-hello">
        <span className="day-hero-date"><Sunrise size={13} /> {now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</span>
        <h1>{greeting(now.getHours())}.</h1>
        {w.value && WxIcon && wx && <p className="day-hero-wx"><WxIcon size={16} /> {w.value.temp}° and {wx.label.toLowerCase()}{rainSoon ? ` · rain likely around ${rainSoon.time}` : ""}</p>}
      </div>
      <div className="day-hero-actions">
        <button type="button" className="day-hero-start" onClick={() => void startDay()} disabled={starting}>
          <Play size={16} /> {starting ? "Starting…" : "Start my day"}
        </button>
        <button type="button" className={`day-hero-hear ${speaking ? "is-on" : ""}`} onClick={speak} aria-pressed={speaking}>
          <AudioLines size={15} /> {speaking ? "Stop" : `Hear it from ${prefs.nickname || "Spark"}`}
        </button>
      </div>
    </div>
    <p className="day-hero-brief">{brief}</p>
    <div className="day-hero-row">
      <p className="day-hero-note"><RadioIcon size={12} /> Start my day turns on Flow mode, puts your radio on, and opens the first thing that needs you.</p>
      {standupOn !== null && <span className="day-standup">
        <Megaphone size={13} />
        {standup ? <button type="button" onClick={() => void navigate({ to: "/library", hash: standup.id })}>{standup.title}</button> : <span>Crew standup</span>}
        <button type="button" role="switch" aria-checked={standupOn} className={`day-switch ${standupOn ? "is-on" : ""}`} onClick={toggleStandup} title={standupOn ? "Weekdays at 8:30 · click to turn off" : "Turn on a weekday 8:30 standup from your crew"}><i /></button>
      </span>}
    </div>
    <div className="day-plan">{plan.map((p) => <button key={p.label} type="button" className={`day-plan-card is-${p.tone}`} onClick={p.go}>
      <p.icon size={15} /><span><small>{p.label}</small><b>{p.value}</b></span>
    </button>)}</div>
  </section>;
}
