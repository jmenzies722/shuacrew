import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AudioLines, Bell, CalendarDays, CheckCircle2, Flame, GraduationCap, Hand, Loader2, Moon, Play, Sparkles, Sun, Timer, Zap } from "lucide-react";
import { useLive } from "../lib/live";
import { isTopLevelWork } from "../lib/crew";
import { useDayCalendar } from "../lib/calendar";
import { localDay, morningBrief } from "../lib/morning";
import { streak } from "../lib/achievements";
import { focusMinutes } from "../lib/focus-stats";
import { savePower } from "../lib/power";
import { companionName, useCompanion } from "../lib/companion";
import { describe } from "../lib/weather";
import { skyAt, todayMoments, type Moment } from "../lib/today";
import { useLearningNow, useWeatherNow } from "../components/TopBarWidgets";
import { native, post } from "./spark/bridge";
import "./today-live.css";

type Reminder = { id: string; title: string; due: number; hasTime: boolean };
const hhmm = (t: number) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const ICON: Record<Moment["kind"], typeof Play> = { session: Zap, meeting: CalendarDays, reminder: Bell, learn: GraduationCap };

/** Today: your day as it moves — the sky, one line from Shua, a timeline around "now", and only what you can act on. */
export function Today() {
  const crew = useLive((s) => s.crew);
  const navigate = useNavigate();
  const prefs = useCompanion(), name = companionName(prefs);
  const weather = useWeatherNow().value, learn = useLearningNow().value;
  const cal = useDayCalendar();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const on = (e: Event) => setReminders(((e as CustomEvent<{ reminders?: Reminder[] }>).detail?.reminders ?? []));
    window.addEventListener("shuacrew:agenda", on);
    if (native()) post({ type: "buddyAgenda" });
    return () => window.removeEventListener("shuacrew:agenda", on);
  }, []);

  const runs = useMemo(() => Object.values(crew.runs).filter((r) => isTopLevelWork(r, crew.runs)), [crew.runs]);
  const events = cal.state?.authorized ? cal.state.events : [];
  const due = learn?.due ?? 0;
  const moments = useMemo(() => todayMoments({ now, runs, events, reminders, due }), [now, runs, events, reminders, due]);
  const nowIndex = moments.findIndex((m) => m.at > now);
  const approvals = Object.values(crew.approvals);
  const running = runs.filter((r) => ["running", "planning", "queued"].includes(r.status));
  const finishedToday = runs.filter((r) => (r.status === "done" || r.status === "merged") && localDay(new Date(r.updatedAt)) === localDay(new Date(now)) && !r.labels?.includes("buddy"));
  const nextMeeting = events.filter((e) => !e.allDay && e.start > now).sort((a, b) => a.start - b.start)[0];
  const reviewedToday = learn?.days?.find((d) => d.day === localDay(new Date(now)))?.reviews ?? 0;
  const focusToday = focusMinutes(1, new Date(now))[0]?.minutes ?? 0;
  const learnStreak = streak(new Set((learn?.days ?? []).filter((d) => d.reviews > 0).map((d) => d.day)), new Date(now));
  const sky = skyAt(now), w = weather ? describe(weather.code, weather.day) : null;

  const brief = morningBrief({ now: new Date(now), goal: learn?.profile?.goal, finished: finishedToday.map((r) => r.title), waiting: approvals.length, due,
    ventures: Object.values(crew.ventures ?? {}).map((v) => ({ name: (v as { name: string }).name, stage: (v as { stage: string }).stage })), running: running.length,
    meetings: events.filter((e) => !e.allDay && e.end > now).map((e) => ({ title: e.title, time: hhmm(e.start) })) });
  const headline = approvals.length ? `${approvals.length} decision${approvals.length === 1 ? " needs" : "s need"} you`
    : running.length ? `The crew is on ${running.length} thing${running.length === 1 ? "" : "s"}`
    : nextMeeting && nextMeeting.start - now < 90 * 60_000 ? `${nextMeeting.title} at ${hhmm(nextMeeting.start)}`
    : due ? `${due} card${due === 1 ? "" : "s"} between you and better`
    : sky.phase === "night" ? "Wind down. Tomorrow's set." : "A clear runway. Make something.";

  const startDay = () => {
    savePower({ flow: true });
    try { localStorage.setItem("shuacrew.morning", localDay(new Date(now))); } catch { /* ignore */ }
    if (approvals[0]?.run) void navigate({ to: "/sessions/$id", params: { id: approvals[0].run } });
    else if (running[0]) void navigate({ to: "/sessions/$id", params: { id: running[0].id } });
    else void navigate({ to: "/" }).then(() => window.dispatchEvent(new Event("shuacrew:compose")));
  };
  const open = (m: Moment) => { if (m.go) void navigate({ to: m.go as "/" }); };

  // Only what has something to say: an empty card is clutter.
  const cards = [
    approvals.length && { key: "wait", icon: Hand, tone: "wait", title: `${approvals.length} waiting on you`, sub: approvals[0]?.tool ? `First: ${approvals[0].tool}` : "Decisions from the crew", go: () => approvals[0]?.run ? void navigate({ to: "/sessions/$id", params: { id: approvals[0].run } }) : void navigate({ to: "/board" }) },
    running.length && { key: "live", icon: Loader2, tone: "live", title: `${running.length} working now`, sub: running[0]!.title, go: () => void navigate({ to: "/sessions/$id", params: { id: running[0]!.id } }) },
    due && { key: "learn", icon: GraduationCap, tone: "learn", title: `${due} cards · ~${Math.max(1, Math.round(due * 0.4))} min`, sub: learn?.profile?.goal ? `Toward ${learn.profile.goal}` : "Spaced right before you'd forget", go: () => void navigate({ to: "/learn" }) },
    nextMeeting && { key: "meet", icon: CalendarDays, tone: "meet", title: nextMeeting.title, sub: `${hhmm(nextMeeting.start)} · in ${Math.max(1, Math.round((nextMeeting.start - now) / 60_000))} min`, go: () => undefined },
  ].filter(Boolean) as Array<{ key: string; icon: typeof Play; tone: string; title: string; sub: string; go: () => void }>;

  return <div className="today">
    <section className={`td-sky is-${sky.phase}`} style={{ "--sun": sky.progress } as React.CSSProperties}>
      <div className="td-arc" aria-hidden><i className="td-sun">{sky.phase === "night" ? <Moon size={16} /> : <Sun size={16} />}</i></div>
      <div className="td-sky-top">
        <span>{new Date(now).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</span>
        {weather && w && <span className="td-weather">{Math.round(weather.temp)}° · {w.label}{weather.hi ? ` · H ${Math.round(weather.hi)}° L ${Math.round(weather.lo)}°` : ""}</span>}
      </div>
      <h1>{headline}</h1>
      <p>{brief}</p>
      <div className="td-actions">
        <button type="button" className="td-primary" onClick={startDay}><Play size={15} />Start my day</button>
        <button type="button" onClick={() => post({ type: "shuaAsk", text: "Brief me on my day in three short spoken sentences: what matters most, what's next on my calendar, and one thing that would make today a win." })}><AudioLines size={15} />Hear it from {name}</button>
        <button type="button" onClick={() => post({ type: "shuaAsk", text: "Look at my day (calendar, crew, cards due) and plan the rest of it in time blocks. Keep it realistic." })}><Sparkles size={15} />Plan the rest of my day</button>
      </div>
    </section>

    <div className="td-body">
      <section className="td-line" aria-label="Your day">
        <header><h2>Your day</h2><small>{moments.length ? `${moments.filter((m) => m.at <= now).length} so far · ${moments.filter((m) => m.at > now).length} ahead` : "Nothing on the clock yet"}</small></header>
        {!cal.state?.authorized && cal.available && <button type="button" className="td-connect" onClick={cal.connect}><CalendarDays size={14} />Show my calendar here</button>}
        <ol>
          {moments.map((m, i) => <li key={m.id} className={`td-m is-${m.tone} is-${m.kind}`}>
            {i === nowIndex && <NowLine now={now} />}
            <time>{hhmm(m.at)}</time>
            <i className="td-dot" aria-hidden>{(() => { const I = m.tone === "done" ? CheckCircle2 : ICON[m.kind]; return <I size={13} />; })()}</i>
            <button type="button" disabled={!m.go} onClick={() => open(m)}>
              <strong>{m.title}</strong>
              <span>{[m.detail, m.end && m.kind === "meeting" ? `until ${hhmm(m.end)}` : undefined].filter(Boolean).join(" · ")}</span>
            </button>
          </li>)}
          {(nowIndex === -1) && <li className="td-m is-tail"><NowLine now={now} /></li>}
        </ol>
        {!moments.length && <p className="td-empty">Start something and it shows up here: a session, a review, a meeting. Your day fills in as it happens.</p>}
      </section>

      <aside className="td-side">
        {cards.length ? cards.map((c) => <button key={c.key} type="button" className={`td-card is-${c.tone}`} onClick={c.go}>
          <i><c.icon size={16} /></i><strong>{c.title}</strong><span>{c.sub}</span>
        </button>) : <div className="td-card is-clear"><i><Sparkles size={16} /></i><strong>Nothing needs you</strong><span>Your crew is idle and you're caught up. Good time to build.</span></div>}
        <div className="td-numbers" aria-label="Today in numbers">
          <div><strong>{finishedToday.length}</strong><span>shipped</span></div>
          <div><strong>{reviewedToday}</strong><span>reviewed</span></div>
          <div><strong>{focusToday}<small>m</small></strong><span><Timer size={11} /> focus</span></div>
          <div><strong>{learnStreak}</strong><span><Flame size={11} /> streak</span></div>
        </div>
      </aside>
    </div>
  </div>;
}

function NowLine({ now }: { now: number }) {
  return <div className="td-now" aria-label={`Now, ${hhmm(now)}`}><span>Now · {hhmm(now)}</span></div>;
}
