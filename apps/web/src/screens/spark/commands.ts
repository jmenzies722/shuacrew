/**
 * Instant commands: unambiguous asks that never need a model, so they happen at once, every time, mid-conversation or
 * not — music on whatever is actually playing (radio, Music, Spotify), playlists and controls, "what's this song",
 * folders, System Settings pages, soundscapes and focus blocks.
 */
import { getRadio, radioCommand, radioNow, type RadioNow } from "../../lib/radio";
import { setFocus, startFocus } from "../../lib/focus-timer";
import { playScape, stopScape } from "../../lib/soundscape";
import type { ProducerMove } from "../../lib/studio";
import { nowPlayingOnce } from "./bridge";
import { perform } from "./actions";
import { timerOp } from "../../lib/timers";

const INSTANT = new Set(["player", "play", "browse", "settings", "folder", "music", "whatsong", "radio", "stop-radio", "scape", "focus", "timer", "sys"]);
export const isInstant = (move: ProducerMove | null): boolean => !!move && INSTANT.has(move.kind);

/**
 * Send a radio command and wait until the player really is in that state (it reports every change to the gateway).
 * One retry if it isn't; only then say it happened. "Delivered" is not "done": the reply is what actually changed.
 */
async function radioTo(cmd: "stop" | "pause" | "resume" | "play", playing: boolean, extra: { station?: string } = {}): Promise<{ ok: boolean; error?: string }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const sent = await radioCommand({ cmd, ...extra });
    if (!sent.ok) return { ok: false, error: sent.error };
    for (let i = 0; i < 12; i++) { // up to ~3 s: a live YouTube stream can take a moment to start
      await new Promise((r) => setTimeout(r, 250));
      if ((await radioNow().catch(() => null))?.playing === playing) return { ok: true };
    }
  }
  return { ok: false, error: playing ? "I asked the radio to start, but it isn't playing yet." : "I asked the radio to stop, but it's still playing — tap pause in the notch." };
}

/** Do it and say the result. */
export async function runInstant(move: ProducerMove, done: (said: string) => void, deps: { setRadio: (r: RadioNow) => void; soundsVolume: number }): Promise<void> {
  const { setRadio } = deps;
    const player = async () => {
      const [r, m] = await Promise.all([radioNow().catch(() => ({ playing: false } as Awaited<ReturnType<typeof radioNow>>)), nowPlayingOnce()]);
      return { radioOn: r.playing, media: m };
    };
    if (move.kind === "player") {
      const { radioOn, media: m } = await player();
      if (move.cmd === "pause") {
        if (radioOn) { const r = await radioTo("pause", false); void radioNow().then(setRadio); done(r.ok ? "Paused." : r.error!); return; }
        if (m?.playing) { const r = await perform({ type: "media", command: "pause", app: m.app }); done(r.ok ? "Paused." : r.message); return; }
        done("Nothing's playing."); return;
      }
      if (move.cmd === "resume") {
        if (m && !m.playing && m.title) { const r = await perform({ type: "media", command: "play", app: m.app }); done(r.ok ? `Back to ${m.title}.` : r.message); return; }
        if (m?.playing || radioOn) { done("It's already playing."); return; }
        const r = await radioTo(getRadio().station ? "resume" : "play", true); void radioNow().then(setRadio); done(r.ok ? "Radio's on." : r.error!); return;
      }
      // next / previous: whichever is playing
      if (radioOn) { await radioCommand({ cmd: move.cmd }); done(move.cmd === "next" ? "Next one." : "Going back."); return; }
      if (m?.title) { const r = await perform({ type: "media", command: move.cmd, app: m.app }); done(r.ok ? (move.cmd === "next" ? "Next one." : "Going back.") : r.message); return; }
      done("Nothing's playing."); return;
    }
    if (move.kind === "music") {
      const { media: m } = await player();
      const r = await perform({ type: "media", command: move.command, ...(move.query ? { query: move.query } : {}), ...(move.on !== undefined ? { on: move.on } : {}), ...(move.mode ? { mode: move.mode } : {}), ...(move.by ? { by: move.by } : {}), ...(move.mood ? { mood: move.mood } : {}), ...(m?.app ? { app: m.app } : {}) });
      done(r.message); return;
    }
    if (move.kind === "whatsong") {
      const { radioOn, media: m } = await player();
      const r = radioOn ? await radioNow().catch(() => null) : null;
      done(m?.title ? `That's ${m.title}${m.artist ? ` by ${m.artist}` : ""}${m.playing ? "" : " (paused)"}.` : r?.playing ? `That's ${r.title ?? r.station ?? "ShuaCrew Radio"} on the radio.` : "Nothing's playing right now."); return;
    }
    if (move.kind === "folder") { const r = await perform({ type: "mac", op: "new_folder", name: move.name, ...(move.in ? { in: move.in } : {}) }); done(r.message); return; }
    if (move.kind === "settings") { const r = await perform({ type: "open_settings", pane: move.pane }); done(r.ok ? r.message : r.message); return; }
    if (move.kind === "browse") {
      const { media: m } = await player();
      const r = await perform({ type: "media", command: "open_query", query: move.query, ...(move.app ? { app: move.app } : m?.app ? { app: m.app } : {}) });
      done(r.message); return;
    }
    if (move.kind === "play") {
      const { media: m } = await player();
      const r = await perform({ type: "media", command: "play_query", query: move.query, ...(move.app ? { app: move.app } : m?.app ? { app: m.app } : {}) });
      done(r.ok ? r.message : r.message); return;
    }

  if (move.kind === "sys") { const { kind: _, ...rest } = move; const r = await perform({ type: "system", ...rest }); done(r.message.replace(/\.?$/, ".")); return; }
  if (move.kind === "timer") { const { kind: _, ...op } = move; done(timerOp(op).message + "."); return; }
  if (move.kind === "scape") { playScape(move.scape, deps.soundsVolume); done(`Putting on ${move.scape}.`); return; }
  if (move.kind === "stop-radio") {
    stopScape();
    if (!(await radioNow().catch(() => null))?.playing) { done("The radio's already off."); return; }
    const r = await radioTo("stop", false); void radioNow().then(setRadio); done(r.ok ? "Radio off." : r.error!); return;
  }
  if (move.kind === "radio" && move.cmd !== "next" && move.cmd !== "previous") {
    const r = await radioTo(move.cmd, move.cmd !== "pause", move.station ? { station: move.station } : {}); void radioNow().then(setRadio);
    done(r.ok ? (move.cmd === "play" ? (move.station ? `Putting on lofi ${move.station}.` : "Radio's on.") : move.cmd === "pause" ? "Paused." : "Back on.") : r.error!);
    return;
  }
  if (move.kind === "radio") {
    const r = await radioCommand({ cmd: move.cmd, station: move.station });
    done(r.ok ? (move.cmd === "play" ? (move.station ? `Putting on lofi ${move.station}.` : "Putting the radio on.") : move.cmd === "next" ? "Next one." : move.cmd === "previous" ? "Going back." : move.cmd === "pause" ? "Paused." : "Back on.") : r.error);
    return;
  }
  if (move.kind === "focus") { setFocus(startFocus(move.minutes)); done(`${move.minutes}-minute focus. I'll chime when it's done.`); return; }
}
