/**
 * Every action Spark takes: settings it changes on itself, work it starts, and Mac actions (checked again by the app).
 * The panel plugs in the hooks that need it (asking before a command runs, sending results back to Spark).
 */
import { api, cancelRun, decideApproval, launchRun } from "../../lib/api";
import { crewRef } from "../../lib/crew-voice";
import { logAction } from "../../lib/spark-log";
import { radioCommand } from "../../lib/radio";
import { PANES, paneURL } from "../../lib/settings-panes";
import { addMission, missionBrief } from "../../lib/missions";
import { describeAct, describeAction, isDestructive, type Act, type Action, type SparkChanges } from "../../lib/buddy";
import { saveBuddyVoice } from "../../lib/buddy-voice";
import { setFocus, startFocus } from "../../lib/focus-timer";
import { saveNote } from "../../lib/widgets";
import { timerOp } from "../../lib/timers";
import { getCompanion, parseCompanion, saveCompanion } from "../../lib/companion";
import { native, post } from "./bridge";

/** "Talk faster", "be the fox", "call yourself Nova": Spark changes itself, and Settings shows it at once. */
export function applyChanges(c: SparkChanges) {
  let current; try { current = parseCompanion(JSON.parse(localStorage.getItem("shuacrew.companion") ?? "null")); } catch { current = parseCompanion(null); }
  saveCompanion({ ...current, ...(c.name ? { nickname: c.name } : {}), ...(c.character ? { character: c.character } : {}), ...(c.color ? { color: c.color } : {}), ...(c.size ? { size: c.size } : {}),
    ...(c.tone ? { tone: c.tone } : {}), ...(c.length ? { length: c.length } : {}), ...(c.control ? { control: c.control } : {}), ...(c.guide ? { guide: c.guide } : {}),
    ...(c.hotkey ? { hotkey: c.hotkey } : {}), ...(c.conversation !== undefined ? { conversation: c.conversation } : {}), ...(c.interrupt !== undefined ? { interrupt: c.interrupt } : {}) });
  if (c.talks !== undefined || c.voice || c.speed) saveBuddyVoice({ ...(c.talks !== undefined ? { on: c.talks } : {}), ...(c.voice ? { id: c.voice } : {}), ...(c.speed ? { speed: c.speed } : {}) });
  if (c.hotkey) post({ type: "buddyHotkey", combo: c.hotkey });
}

/**
 * Hooks the panel plugs in. confirmRun: asking you before a command runs (without it, nothing risky runs).
 * confirmDelete: asking before anything is deleted — in the chat, the notch and out loud (without it, nothing is).
 * The on…Output hooks: a command's, mail's or your Mac's results, for Spark to read back to you.
 */
export const sparkHooks: {
  confirmRun: ((command: string, why: string) => Promise<boolean>) | null;
  confirmDelete: ((what: string) => Promise<boolean>) | null;
  onRanOutput: ((command: string, ok: boolean, output: string) => void) | null;
  onMailOutput: ((what: string, output: string) => void) | null;
  onMacOutput: ((what: string, output: string) => void) | null;
} = { confirmRun: null, confirmDelete: null, onRanOutput: null, onMailOutput: null, onMacOutput: null };

/** Every action, logged with whether it worked. */
export function perform(a: Action | (Act & { color?: string }), opts: { confirmed?: boolean } = {}): Promise<{ ok: boolean; message: string; run?: string }> {
  const isAct = ["press", "click", "type", "key", "scroll", "done"].includes(a.type); // mouse & keyboard steps; everything else is an action
  // Deleting can't be undone: it waits for your yes, whatever the control mode — and with nobody to ask, it doesn't.
  if (!isAct && !opts.confirmed && isDestructive(a as Action)) return (async () => {
    const label = describeAction(a as Action);
    const yes = sparkHooks.confirmDelete ? await sparkHooks.confirmDelete(label) : false;
    if (!yes) { logAction({ label, ok: true, message: "You said no" }); return { ok: true, message: /^Send/.test(label) ? "Okay, I didn't send it." : /^Call/.test(label) ? "Okay, no call." : "Okay, I kept it. Nothing was deleted." }; }
    const r = await performNow(a); logAction({ label, ok: r.ok, message: r.message }); return r;
  })();
  return performNow(a).then((r) => { logAction({ label: isAct ? describeAct(a as Act) : describeAction(a as Action), ok: r.ok, message: r.message }); return r; });
}
/** Mac actions go to the app (which checks them again); the rest happen right here. */
export function performNow(a: Action | (Act & { color?: string })): Promise<{ ok: boolean; message: string; run?: string }> {
  if (a.type === "settings") { applyChanges(a.changes); return Promise.resolve({ ok: true, message: describeAction(a) }); }
  if (a.type === "timer") { const { type: _, ...op } = a; return Promise.resolve(timerOp(op)); }
  if (a.type === "learn") return (a.drill ? api("/api/learning/drill", { body: {} }) : api("/api/learning/courses", { body: { topic: a.topic } }))
    .then(() => { post({ type: "buddyOpen", path: "/learn" }); return { ok: true, message: a.drill ? "Quiz ready in Learning" : `Course on ${a.topic} is being planned` }; }, (e: Error) => ({ ok: false, message: e.message }));
  if (a.type === "venture") return api<{ id: string }>("/api/ventures", { body: { name: a.name, pitch: a.pitch ?? "" } }).then(async (v) => {
    if (a.validate) await api("/api/plays", { body: { playbook: "validate-idea", inputs: { idea: a.pitch || a.name }, venture: v.id } });
    post({ type: "buddyOpen", path: `/ventures/${v.id}` });
    return { ok: true, message: a.validate ? `${a.name}: validating now` : `${a.name} created` };
  }, (e: Error) => ({ ok: false, message: e.message }));
  if (a.type === "playbook") return api<{ id: string }>("/api/plays", { body: { playbook: a.playbook, inputs: a.idea ? { idea: a.idea } : {}, ...(a.venture ? { venture: a.venture } : {}) } })
    .then((p) => { post({ type: "buddyOpen", path: `/plays/${p.id}` }); return { ok: true, message: `${a.playbook.replace(/-/g, " ")} started` }; }, (e: Error) => ({ ok: false, message: e.message }));
  if (a.type === "run") return (async () => {
    // Your ShuaCrew policy decides first: denied never runs; "ask" (or Ask-each-step mode) waits for your yes.
    const verdict = await api<{ verdict: "allow" | "deny" | "ask"; reason: string; rule: string }>("/api/policy/explain", { body: { tool: "Bash", input: { command: a.command } } }).catch(() => ({ verdict: "ask" as const, reason: "couldn't check the policy", rule: "" }));
    if (verdict.verdict === "deny") return { ok: false, message: `Blocked by your policy: ${verdict.reason}` };
    let mode = "ask"; try { mode = JSON.parse(localStorage.getItem("shuacrew.companion") ?? "{}").control ?? "ask"; } catch { /* ignore */ }
    if (verdict.verdict === "ask" || mode !== "auto") {
      const yes = sparkHooks.confirmRun ? await sparkHooks.confirmRun(a.command, verdict.verdict === "ask" ? verdict.reason : "") : false;
      if (!yes) return { ok: false, message: "Not run" };
    }
    const r = await new Promise<{ ok: boolean; message: string; output?: string }>((resolve) => {
      if (!native()) { resolve({ ok: false, message: "Only in the Mac app" }); return; }
      const id = crypto.randomUUID();
      const t = setTimeout(() => { window.removeEventListener("shuacrew:did", on as EventListener); resolve({ ok: false, message: "No answer from the Mac" }); }, 70_000);
      const on = (e: CustomEvent<{ id: string; ok: boolean; message: string; output?: string }>) => { if (e.detail.id !== id) return; clearTimeout(t); window.removeEventListener("shuacrew:did", on as EventListener); resolve(e.detail); };
      window.addEventListener("shuacrew:did", on as EventListener);
      post({ type: "buddyDo", id, action: a });
    });
    sparkHooks.onRanOutput?.(a.command, r.ok, r.output ?? "");
    return { ok: r.ok, message: r.message };
  })();
  if (a.type === "open_settings" && !("url" in a)) {
    // The exact page of System Settings, by its direct link (the Mac app opens only System Settings links). With the
    // link added it goes on to the Mac below — without that check this branch called itself forever and Settings
    // never opened ("stilll not launching settings").
    const pane = PANES.find((p) => p.key === a.pane);
    if (!pane) return Promise.resolve({ ok: false, message: "I don't know that Settings page" });
    return performNow({ ...a, url: paneURL(pane) } as Action).then((r) => ({ ...r, message: r.ok ? `Opened ${pane.name}` : r.message }));
  }
  if (a.type === "mac") return new Promise((resolve) => {
    // Your files, calendar, reminders, notes, contacts and Mac status, read on this Mac; the result goes back to Spark.
    if (!native()) { resolve({ ok: false, message: "This works in the ShuaCrew Mac app" }); return; }
    const id = crypto.randomUUID();
    const t = setTimeout(() => { window.removeEventListener("shuacrew:did", on as EventListener); resolve({ ok: false, message: "Your Mac didn't answer in time" }); }, 75_000);
    const on = (e: CustomEvent<{ id: string; ok: boolean; message: string; output?: string }>) => {
      if (e.detail.id !== id) return; clearTimeout(t); window.removeEventListener("shuacrew:did", on as EventListener);
      if (e.detail.ok && e.detail.output) sparkHooks.onMacOutput?.(describeAction(a), e.detail.output);
      resolve({ ok: e.detail.ok, message: e.detail.message });
    };
    window.addEventListener("shuacrew:did", on as EventListener);
    post({ type: "buddyDo", id, action: a });
  });
  if (a.type === "mail") return new Promise((resolve) => {
    // Through the Mail app on this Mac (so Gmail works with no Google setup); read and draft only.
    if (!native()) { resolve({ ok: false, message: "Mail works in the ShuaCrew Mac app" }); return; }
    const id = crypto.randomUUID();
    const t = setTimeout(() => { window.removeEventListener("shuacrew:did", on as EventListener); resolve({ ok: false, message: "Mail didn't answer in time" }); }, 40_000);
    const on = (e: CustomEvent<{ id: string; ok: boolean; message: string; output?: string }>) => {
      if (e.detail.id !== id) return; clearTimeout(t); window.removeEventListener("shuacrew:did", on as EventListener);
      if (e.detail.ok && e.detail.output && a.op !== "draft") sparkHooks.onMailOutput?.(describeAction(a), e.detail.output);
      resolve({ ok: e.detail.ok, message: e.detail.message });
    };
    window.addEventListener("shuacrew:did", on as EventListener);
    post({ type: "buddyDo", id, action: a });
  });
  if (a.type === "card") return api("/api/learning/cards", { body: { front: a.front, back: a.back } }).then(() => ({ ok: true, message: "Added to your Learning quiz" }), (e: Error) => ({ ok: false, message: e.message }));
  if (a.type === "go") { post({ type: "buddyOpen", path: a.path }); return Promise.resolve({ ok: true, message: describeAction(a) }); }
  if (a.type === "radio") return radioCommand({ cmd: a.cmd, station: a.station }).then((r) => (r.ok ? { ok: true, message: describeAction(a) } : { ok: false, message: r.error }));
  if (a.type === "remember") return api("/api/memory/lessons", { body: { text: a.text } }).then(() => { window.dispatchEvent(new Event("shuacrew:memory")); return { ok: true, message: "Remembered — every agent will know" }; }, (e: Error) => ({ ok: false, message: e.message }));
  if (a.type === "focus") { setFocus(startFocus(a.minutes)); return Promise.resolve({ ok: true, message: `${a.minutes}-minute focus started` }); }
  if (a.type === "note") { const n = localStorage.getItem("shuacrew.widgets.note") ?? ""; saveNote(n ? `${n}\n${a.text}` : a.text); return Promise.resolve({ ok: true, message: "Added to your note" }); }
  // Running the crew by voice: refs from CREW NOW → the real approval or session.
  if (a.type === "crew_decide") return decideApproval(crewRef(a.ref), a.allow, { comment: "by voice, through Spark" }).then(() => ({ ok: true, message: a.allow ? "Approved" : "Declined" }), (e: Error) => ({ ok: false, message: e.message }));
  if (a.type === "crew_stop") return cancelRun(crewRef(a.ref)).then(() => ({ ok: true, message: "Stopped" }), (e: Error) => ({ ok: false, message: e.message }));
  if (a.type === "crew_open") { post({ type: "buddyOpen", path: `/sessions/${crewRef(a.ref)}` }); return Promise.resolve({ ok: true, message: "Opened it" }); }
  // A hand-off is a mission: an end-to-end brief, and Spark stays with it until it's finished (see lib/missions).
  if (a.type === "crew") {
    const persist = getCompanion().persist;
    return launchRun({ ask: persist ? missionBrief(a.ask) : a.ask, title: a.ask.split("\n")[0]!.slice(0, 80), ...(persist ? { labels: ["mission"] } : {}) })
      .then((r) => { if (persist) addMission(r.id, a.ask); return { ok: true, message: persist ? "The crew is on it. I'll stay with it" : "The crew is on it", run: r.id }; }, (e: Error) => ({ ok: false, message: e.message }));
  }
  return new Promise((resolve) => {
    if (!native()) { resolve({ ok: false, message: "Only in the Mac app" }); return; }
    const id = crypto.randomUUID();
    // Connecting a Bluetooth device can take a while (power on, connect, confirm); everything else answers in seconds.
    const wait = a.type === "system" && a.what === "bluetooth_device" ? 35_000 : 8000;
    const t = setTimeout(() => { window.removeEventListener("shuacrew:did", on as EventListener); resolve({ ok: false, message: "No answer from the Mac" }); }, wait);
    const on = (e: CustomEvent<{ id: string; ok: boolean; message: string }>) => { if (e.detail.id !== id) return; clearTimeout(t); window.removeEventListener("shuacrew:did", on as EventListener); resolve(e.detail); };
    window.addEventListener("shuacrew:did", on as EventListener);
    post({ type: "buddyDo", id, action: a });
  });
}


export type Done = { label: string; ok: boolean; message: string; run?: string };
/** How far the open notch island widens past the camera housing, each side. */
export const ISLAND_FLARE = 130;

