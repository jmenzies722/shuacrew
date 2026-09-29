import { SpeechQueue } from "./buddy-voice";
import { getCompanion } from "./companion";
import { useLive } from "./live";
import { dip, getRadio, onAir, type OnAir } from "./radio";

/** What the DJ says: one or two short spoken lines, only about things that are really happening. */
export function djLine(e: OnAir, crew: { running: number; waiting: number }, withCrew: boolean): string {
  const main = e.kind === "live"
    ? `Tuning in to ${e.station.name}, from ${e.station.channel}.`
    : `${e.previous ? `That was ${e.previous.title}. ` : ""}Up next${e.track.artist ? `, ${e.track.title} by ${e.track.artist}` : `, ${e.track.title}`}.`;
  if (!withCrew) return main;
  const note = crew.waiting ? `${crew.waiting} decision${crew.waiting === 1 ? " is" : "s are"} waiting on you.` : crew.running ? `Meanwhile, ${crew.running} session${crew.running === 1 ? " is" : "s are"} working.` : "";
  return note ? `${main} ${note}` : main;
}

/** Spark as radio host, in the window that owns the player. Music dips under the voice and comes back after. */
let started = false;
export function startDj() {
  if (started) return; started = true;
  const voice = new SpeechQueue();
  let count = 0;
  voice.onSpeaking = (on) => dip(on ? 0.3 : 1);
  onAir((e) => {
    const prefs = getCompanion();
    if (!prefs.dj || !getRadio().playing && e.kind === "track") return;
    const runs = Object.values(useLive.getState().crew.runs);
    const crew = { running: runs.filter((r) => r.status === "running" || r.status === "planning").length, waiting: Object.keys(useLive.getState().crew.approvals).length };
    count += 1;
    voice.say(djLine(e, crew, count % 3 === 1)); // a crew update every third intro, not every time
  });
}
