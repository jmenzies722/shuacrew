import { pressInShuaCrew } from "../../lib/ui-bridge";
/**
 * Every action Spark takes: settings it changes on itself, work it starts, and Mac actions (checked again by the app).
 * The panel plugs in the hooks that need it (asking before a command runs, sending results back to Spark).
 */
import { api, cancelRun, decideApproval, launchRun } from "../../lib/api";
import { crewRef, crewStatus, crewTitle } from "../../lib/crew-voice";
import { removeSession } from "../../lib/session-removal";
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
import { classifyMacStep, type MacReceipt, type MacStep, type MacTaskScope } from "../../lib/mac-task-contract";
import { requestMacTask } from "../../lib/mac-task-bridge";

const macReceiptOwners = new Map<string, string>();
export async function performMacStep(scope: MacTaskScope, step: MacStep, signal: AbortSignal): Promise<MacReceipt> {
  if (!native() || signal.aborted || classifyMacStep(scope, step, Date.now()) !== "allow") throw new Error("Native verified step is not authorized.");
  const id = `${scope.taskId}:${step.actionId}`, owner = crypto.randomUUID();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ scope, step })));
  const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  const claim = await api<{ claimed: boolean; conflict: boolean }>("/api/companion/actions/claim", { body: { id, fingerprint, owner }, signal });
  if (!claim.claimed || claim.conflict) throw new Error("This action is already reserved; no mutation was repeated.");
  macReceiptOwners.set(id, owner);
  if (signal.aborted) throw new Error("Stopped before dispatch.");
  const result = await requestMacTask({ operation: "step", scope, step }, post, window, signal);
  return result.receipt as MacReceipt;
}
export async function recordMacReceipt(receipt: MacReceipt) {
  const id = `${receipt.taskId}:${receipt.actionId}`, owner = macReceiptOwners.get(id);
  if (!owner) return;
  const evidence = receipt.evidence;
  const result = await api<{ saved: boolean }>("/api/companion/actions/finish", { signal: AbortSignal.timeout(5000), body: { id, owner, result: {
    ok: receipt.status === "verified", message: JSON.stringify({ status: receipt.status, dispatch: receipt.dispatch, message: receipt.message,
      ...(evidence ? { observationId: evidence.observationId, observedAt: evidence.observedAt, predicateMatched: evidence.predicateMatched } : {}) }),
  } } });
  if (!result.saved) throw new Error("Could not save the verified action receipt.");
  macReceiptOwners.delete(id);
}

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
export function perform(a: Action | (Act & { color?: string }), opts: { confirmed?: boolean; requestId?: string; active?: () => boolean } = {}): Promise<{ ok: boolean; message: string; run?: string }> {
  if (opts.active && !opts.active()) return Promise.resolve({ ok: false, message: "Canceled before execution" });
  if (opts.requestId) return performOnce(a, opts);
  const isAct = ["press", "click", "type", "key", "scroll", "done"].includes(a.type); // mouse & keyboard steps; everything else is an action
  // Deleting can't be undone: it waits for your yes, whatever the control mode — and with nobody to ask, it doesn't.
  if (!isAct && !opts.confirmed && isDestructive(a as Action)) return (async () => {
    const title = "ref" in a ? crewTitle(a.ref) : "";
    const label = describeAction(a as Action) + (title ? ` — “${title}”` : "");
    const yes = sparkHooks.confirmDelete ? await sparkHooks.confirmDelete(label) : false;
    if (!yes) { logAction({ label, ok: false, message: "You said no" }); return { ok: false, message: a.type.startsWith("crew_") ? "Okay, I didn’t do that." : /^Send/.test(label) ? "Okay, I didn't send it." : /^Call/.test(label) ? "Okay, no call." : "Okay, I kept it. Nothing was deleted." }; }
    if (opts.active && !opts.active()) return { ok: false, message: "Canceled before execution" };
    const r = await performNow(a, opts.active); logAction({ label, ok: r.ok, message: r.message }); return r;
  })();
  return performNow(a, opts.active).then((r) => { logAction({ label: isAct ? describeAct(a as Act) : describeAction(a as Action), ok: r.ok, message: r.message }); return r; });
}
type ActionResult = { ok: boolean; message: string; run?: string };
const inFlight = new Map<string, Promise<ActionResult>>();
function performOnce(a: Action | (Act & { color?: string }), opts: { confirmed?: boolean; requestId?: string; active?: () => boolean }): Promise<ActionResult> {
  const id = opts.requestId!;
  const existing = inFlight.get(id); if (existing) return existing;
  const work = (async () => {
    const owner = crypto.randomUUID();
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(a)));
    const fingerprint = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
    if (opts.active && !opts.active()) return { ok: false, message: "Canceled before execution" };
    const receipt = await api<{ claimed: boolean; conflict: boolean; result: ActionResult | null }>("/api/companion/actions/claim", { body: { id, fingerprint, owner } });
    if (receipt.conflict) return { ok: false, message: "This request changed after it was reserved; nothing was repeated." };
    if (!receipt.claimed) return receipt.result ?? { ok: false, message: "This action was already dispatched. Its outcome is not confirmed; check the result before trying again." };
    let result: ActionResult;
    try { result = await perform(a, { confirmed: opts.confirmed, active: opts.active }); }
    catch (error) { result = { ok: false, message: `Action outcome unconfirmed: ${(error as Error).message}` }; }
    await api("/api/companion/actions/finish", { body: { id, owner, result } }).catch(() => {});
    return result;
  })().catch((error: Error) => ({ ok: false, message: `Action not dispatched: ${error.message}` })).finally(() => { inFlight.delete(id); });
  inFlight.set(id, work); return work;
}

/** Mac actions go to the app (which checks them again); the rest happen right here. */
export function performNow(a: Action | (Act & { color?: string }), active: () => boolean = () => true): Promise<{ ok: boolean; message: string; run?: string }> {
  if (!active()) return Promise.resolve({ ok: false, message: "Canceled before execution" });
  if (a.type.startsWith("crew_") && "ref" in a && !crewRef(a.ref, a.type === "crew_decide" ? "A" : "S"))
    return Promise.resolve({ ok: false, message: "That crew request is no longer listed. Ask about the session again." });
  if (a.type === "settings") { applyChanges(a.changes); return Promise.resolve({ ok: true, message: describeAction(a) }); }
  if (a.type === "brief") return (async () => {
    // Read from the gateway's recorded state; the full brief goes back to Shua (chat or voice) to summarize.
    const since = a.since === "hour" ? Date.now() - 3_600_000 : a.since === "morning" ? new Date().setHours(6, 0, 0, 0) : undefined;
    const b = await api<{ headline: string; text: string }>(`/api/brief${since ? `?since=${since}` : ""}`);
    sparkHooks.onMacOutput?.("What's going on in ShuaCrew", b.text);
    return { ok: true, message: b.headline };
  })().catch((e: Error) => ({ ok: false, message: `Couldn't read ShuaCrew: ${e.message}` }));
  if (a.type === "timer") { const { type: _, ...op } = a; return Promise.resolve(timerOp(op)); }
  if (a.type === "venture") return api<{ id: string }>("/api/ventures", { body: { name: a.name, pitch: a.pitch ?? "" } }).then(async (v) => {
    if (a.validate) await api("/api/plays", { body: { playbook: "validate-idea", inputs: { idea: a.pitch || a.name }, venture: v.id } });
    post({ type: "buddyOpen", path: `/ventures/${v.id}` });
    return { ok: true, message: a.validate ? `${a.name}: validating now` : `${a.name} created` };
  }, (e: Error) => ({ ok: false, message: e.message }));
  if (a.type === "playbook") return api<{ id: string }>("/api/plays", { body: { playbook: a.playbook, inputs: a.idea ? { idea: a.idea } : {}, ...(a.venture ? { venture: a.venture } : {}) } })
    .then((p) => { post({ type: "buddyOpen", path: `/plays/${p.id}` }); return { ok: true, message: `${a.playbook.replace(/-/g, " ")} started` }; }, (e: Error) => ({ ok: false, message: e.message }));
  if (a.type === "run") return (async () => {
    // Your ShuaCrew policy decides first: denied never runs. In "Just do it" (auto) Spark only stops for what it must
    // ask you about (a push, a send, a delete: assistantMustAsk) and asks out loud; "Ask each step" asks every time.
    const verdict = await api<{ verdict: "allow" | "deny" | "ask"; reason: string; rule: string; assistantMustAsk?: boolean }>("/api/policy/explain", { body: { tool: "Bash", input: { command: a.command } } }).catch(() => ({ verdict: "ask" as const, reason: "couldn't check the policy", rule: "", assistantMustAsk: true }));
    if (verdict.verdict === "deny") return { ok: false, message: `Blocked by your policy: ${verdict.reason}` };
    let mode = "auto"; try { mode = JSON.parse(localStorage.getItem("shuacrew.companion") ?? "{}").control ?? "auto"; } catch { /* ignore */ }
    if (mode !== "auto" || (verdict.assistantMustAsk ?? verdict.verdict === "ask")) {
      const yes = sparkHooks.confirmRun ? await sparkHooks.confirmRun(a.command, verdict.verdict === "ask" ? verdict.reason : "") : false;
      if (!yes) return { ok: false, message: "Not run" };
    }
    if (!active()) return { ok: false, message: "Canceled before execution" };
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
    return performNow({ ...a, url: paneURL(pane) } as Action, active).then((r) => ({ ...r, message: r.ok ? `Opened ${pane.name}` : r.message }));
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
  if (a.type === "go") { post({ type: "buddyOpen", path: a.path }); return Promise.resolve({ ok: true, message: "Requested navigation" }); }
  if (a.type === "ui") return (async () => {
    const started = performance.now(), r = await pressInShuaCrew(a.press, 2500, a.text);
    // In-app presses count toward Shua's measured accuracy too.
    void api("/api/shua/journal", { body: { kind: a.text !== undefined ? "ui-type" : "ui", how: "name", label: a.press, ok: r.ok, message: r.message, app: "ShuaCrew", ms: performance.now() - started } }).catch(() => {});
    return r;
  })();
  if (a.type === "radio") return radioCommand({ cmd: a.cmd, station: a.station }).then((r) => (r.ok ? { ok: true, message: describeAction(a) } : { ok: false, message: r.error }));
  if (a.type === "remember") return api("/api/memory/lessons", { body: { text: a.text } }).then(() => { window.dispatchEvent(new Event("shuacrew:memory")); return { ok: true, message: "Remembered — every agent will know" }; }, (e: Error) => ({ ok: false, message: e.message }));
  if (a.type === "focus") { setFocus(startFocus(a.minutes)); return Promise.resolve({ ok: true, message: `${a.minutes}-minute focus started` }); }
  if (a.type === "note") { const n = localStorage.getItem("shuacrew.widgets.note") ?? ""; saveNote(n ? `${n}\n${a.text}` : a.text); return Promise.resolve({ ok: true, message: "Added to your note" }); }
  // Running the crew by voice: refs from CREW NOW → the real approval or session.
  if (a.type === "crew_decide") return decideApproval(crewRef(a.ref), a.allow, { comment: "by voice, through Spark" }).then(() => ({ ok: true, message: a.allow ? "Approved" : "Declined" }), (e: Error) => ({ ok: false, message: e.message }));
  if (a.type === "crew_stop") return cancelRun(crewRef(a.ref)).then(() => ({ ok: true, message: "Stopped" }), (e: Error) => ({ ok: false, message: e.message }));
  if (a.type === "crew_open") { post({ type: "buddyOpen", path: `/sessions/${crewRef(a.ref)}` }); return Promise.resolve({ ok: true, message: "Requested opening that session" }); }
  if (a.type === "crew_message") return api(`/api/runs/${crewRef(a.ref)}/followup`, { body: { text: a.text } }).then(() => ({ ok: true, message: "Told them" }), (e: Error) => ({ ok: false, message: e.message }));
  if (a.type === "crew_delete") return removeSession(crewRef(a.ref), crewStatus(crewRef(a.ref))).then(() => ({ ok: true, message: "Deleted everywhere: its messages, files and what was made from it." }), (e: Error) => ({ ok: false, message: e.message }));
  if (a.type === "crew_review" && crewStatus(crewRef(a.ref)) !== "reviewing")
    return Promise.resolve({ ok: false, message: "That session is not waiting for review." });
  if (a.type === "crew_review") return api(`/api/runs/${crewRef(a.ref)}/review`, { body: { approve: a.approve, ...(a.lesson ? { lesson: a.lesson } : {}) } }).then(() => ({ ok: true, message: a.approve ? "Queued for merge" : a.lesson ? "Rejected it, and noted why" : "Rejected it" }), (e: Error) => ({ ok: false, message: e.message }));
  if (a.type === "crew_pr") return api<{ url?: string }>(`/api/runs/${crewRef(a.ref)}/pr`, { body: {} }).then((r) => ({ ok: true, message: r?.url ? `PR opened: ${r.url}` : "The PR request returned without a URL; creation is unverified" }), (e: Error) => ({ ok: false, message: e.message }));
  // A hand-off is a mission: an end-to-end brief, and Spark stays with it until it's finished (see lib/missions).
  if (a.type === "crew") {
    const persist = getCompanion().persist;
    return launchRun({ ask: persist ? missionBrief(a.ask) : a.ask, ...(a.title ? { title: a.title } : {}), ...(persist ? { labels: ["mission"] } : {}) })
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
