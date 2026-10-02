import { useSyncExternalStore } from "react";
import { AudioLines, Check, PhoneOff, ShieldAlert, X } from "lucide-react";
import { LiveCall, type LiveEvent, type LiveState } from "../lib/live-voice";
import { yesOrNo } from "../lib/handsfree";
import { copyForPaste, pasteTarget } from "../lib/paste-hint";
import { describeAction, doVocabulary, parseActions } from "../lib/buddy";
import { perform, sparkHooks } from "../screens/spark/actions";
import "./live-mode.css";

/**
 * Live, in the notch: one shared call that the island and the card both show. Spark's own mic, fn push-to-talk and
 * the wake word stand aside while a call is on (Buddy reads `live.active`).
 */
type Line = { role: "user" | "assistant"; text: string; final: boolean };
export type LiveView = {
  active: boolean; state: LiveState | "off"; detail?: string; lines: Line[]; steps: string[]; result?: string; corrected?: string; usage?: number;
  approval?: { id: string; kind: "command" | "files" | "action"; text: string; why?: string }; mic: number; voice: number;
};
const OFF: LiveView = { active: false, state: "off", lines: [], steps: [], mic: 0, voice: 0 };
let view: LiveView = OFF, call: LiveCall | null = null;
const subs = new Set<() => void>();
const emit = (next: Partial<LiveView>) => { view = { ...view, ...next }; subs.forEach((f) => f()); };
export const useLive = () => useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => view);
export const liveActive = () => view.active;

export const LIVE_VOICES = ["cove", "juniper", "maple", "spruce", "ember", "vale", "breeze", "arbor", "sol"];
const VOICE_KEY = "shuacrew.live.voice";
export const liveVoice = () => { try { return localStorage.getItem(VOICE_KEY) || "cove"; } catch { return "cove"; } };
export const setLiveVoice = (v: string) => { try { localStorage.setItem(VOICE_KEY, v); } catch { /* private mode */ } };

function onEvent(e: LiveEvent) {
  if (e.type === "levels") { if (Math.abs(e.mic - view.mic) > 0.004 || Math.abs(e.voice - view.voice) > 0.004) emit({ mic: e.mic, voice: e.voice }); return; }
  if (e.type === "state") {
    if (e.state === "ended" || e.state === "error") { call = null; emit({ ...OFF, state: e.state, detail: e.detail, lines: view.lines }); window.dispatchEvent(new CustomEvent("shuacrew:live", { detail: { on: false } })); return; }
    return emit({ state: e.state });
  }
  if (e.type === "caption") {
    // One growing line per speaker turn: partials replace the open line, a final closes it.
    const lines = [...view.lines], last = [...lines].reverse().find((l) => l.role === e.role && !l.final);
    if (last) Object.assign(last, { text: e.text, final: e.final }); else lines.push({ role: e.role, text: e.text, final: e.final });
    // "Yes" / "no" to a pending approval, said out loud.
    if (e.final && e.role === "user" && view.approval) { const said = yesOrNo(e.text); if (said !== null) answer(said); }
    return emit({ lines: lines.slice(-8), ...(e.role === "user" && e.final ? { steps: [], result: undefined, corrected: undefined } : {}) });
  }
  if (e.type === "step") return emit({ steps: [...view.steps, e.text].slice(-4) });
  if (e.type === "result") {
    if (!e.final) return;
    const paste = pasteTarget(e.text); if (paste) copyForPaste(paste, native() ? (m) => native()!.postMessage(m) : undefined);
    return emit({ result: e.text });
  }
  if (e.type === "approval") return emit({ approval: { id: e.id, kind: e.kind, text: e.text, why: e.why } });
  if (e.type === "usage") return emit({ usage: e.percent });
  if (e.type === "correction") return emit({ result: e.result, corrected: e.said });
  if (e.type === "do") { const c = call; void runSparkActions(e.actions).then((text) => c?.done(e.id, text)); }
}

/** A question only this page can answer (a delete Spark's hands want to make): same card, same "yes"/"no". */
const local = new Map<string, (allow: boolean) => void>();
const askHere = (text: string) => new Promise<boolean>((resolve) => {
  const id = `local:${Math.random().toString(36).slice(2, 8)}`;
  local.set(id, resolve);
  emit({ approval: { id, kind: "action", text, why: "Shua wants to do this on your Mac" } });
  setTimeout(() => { if (local.delete(id)) { resolve(false); if (view.approval?.id === id) emit({ approval: undefined }); } }, 60_000);
});

/**
 * The hands asked for Spark's native actions: run them exactly as Spark would (its executor, its checks, deletes
 * confirmed here), and hand back what happened plus anything read (calendar, mail, files).
 */
async function runSparkActions(raw: unknown[]): Promise<string> {
  const actions = parseActions("```do " + JSON.stringify(raw) + "```").filter((a) => a.type !== "run");
  if (!actions.length) return "Nothing ran: no valid actions. Use the exact shapes from the list.";
  const results: string[] = [], outputs: string[] = [];
  const saved = { ...sparkHooks };
  sparkHooks.onMacOutput = (what, out) => outputs.push(`${what}:\n${out}`);
  sparkHooks.onMailOutput = (what, out) => outputs.push(`${what}:\n${out}`);
  sparkHooks.confirmDelete = (what) => askHere(what);
  try {
    for (const a of actions) {
      emit({ steps: [...view.steps, describeAction(a)].slice(-4) });
      const r = await perform(a);
      results.push(`${describeAction(a)}: ${r.ok ? "done" : "failed"} — ${r.message}`);
    }
  } finally { Object.assign(sparkHooks, saved); }
  return [...results, ...outputs].join("\n\n").slice(0, 12_000);
}
const native = () => (window as unknown as { webkit?: { messageHandlers?: { shuacrew?: { postMessage(m: unknown): void } } } }).webkit?.messageHandlers?.shuacrew;

export function startLive() {
  if (call) return;
  emit({ ...OFF, active: true, state: "connecting" });
  window.dispatchEvent(new CustomEvent("shuacrew:live", { detail: { on: true } }));
  call = new LiveCall({ voice: liveVoice(), onEvent, vocab: doVocabulary() });
  void call.start();
}
export function endLive() { call?.end(); }
function answer(allow: boolean) {
  const a = view.approval; if (!a) return;
  const mine = local.get(a.id);
  if (mine) { local.delete(a.id); mine(allow); } else call?.approve(a.id, allow);
  emit({ approval: undefined });
}

const LABEL: Record<LiveView["state"], string> = { off: "Live", connecting: "Connecting…", listening: "Listening", speaking: "Speaking", working: "Working on it", ended: "Call ended", error: "Couldn't connect" };

export function LiveButton({ compact = false }: { compact?: boolean }) {
  const live = useLive();
  return (
    <button type="button" className={`live-btn${live.active ? " is-on" : ""}${compact ? " is-compact" : ""}`} aria-pressed={live.active}
      title={live.active ? "End the live call" : "Talk live: interrupt any time, like a call"} aria-label={live.active ? "End live call" : "Start live call"}
      onClick={() => (live.active ? endLive() : startLive())}>
      {live.active ? <PhoneOff size={compact ? 13 : 14} /> : <AudioLines size={compact ? 13 : 14} />}
      {!compact && <span>{live.active ? "End" : "Live"}</span>}
    </button>
  );
}

/** The orb: listening follows your voice, speaking follows Shua's, working sweeps. */
function Orb({ live, size }: { live: LiveView; size: number }) {
  const level = live.state === "speaking" ? live.voice : live.state === "listening" ? live.mic : 0;
  const scale = 1 + Math.min(0.35, level * 4);
  return <i className={`live-orb is-${live.state}`} style={{ width: size, height: size, ["--live-scale" as string]: scale.toFixed(3) }} aria-hidden />;
}

function Approval({ live, compact }: { live: LiveView; compact?: boolean }) {
  const a = live.approval; if (!a) return null;
  return (
    <div className={`live-approval${compact ? " is-compact" : ""}`} role="alertdialog" aria-label="Shua needs your OK">
      <ShieldAlert size={14} />
      <span><b>{a.kind === "command" ? "Run this?" : a.kind === "action" ? "OK to do this?" : "Change files?"}</b> <code title={a.text}>{a.text}</code>{!compact && a.why && <small>{a.why}</small>}<small>Say yes or no</small></span>
      <button type="button" className="is-yes" onClick={() => answer(true)}><Check size={13} />Allow</button>
      <button type="button" onClick={() => answer(false)}><X size={13} />Deny</button>
    </div>
  );
}

/** The island row while a call is on: orb, what's happening, and the line being said. */
export function LiveIsland() {
  const live = useLive();
  if (!live.active) return null;
  const line = [...live.lines].reverse()[0];
  return (
    <div className="live-island">
      {live.approval ? <Approval live={live} compact /> : <>
        <Orb live={live} size={18} />
        <span className="live-island-text">{live.state === "working" && live.steps.length ? live.steps[live.steps.length - 1] : line?.text || LABEL[live.state]}</span>
        <LiveButton compact />
      </>}
    </div>
  );
}

/** The card while a call is on: the conversation, what the hands are doing, the result, and approvals. */
export function LivePanel() {
  const live = useLive();
  if (!live.active && live.state !== "error") return null;
  return (
    <section className={`live-panel is-${live.state}`} aria-label="Live call">
      <header>
        <Orb live={live} size={34} />
        <div><strong>{LABEL[live.state]}</strong><small>{live.state === "error" ? `${live.detail ?? ""} You can still hold fn and talk to Spark.` : live.usage !== undefined && live.usage >= 80 ? `Codex plan ${Math.round(live.usage)}% used this week. Live runs on it.` : "Talk any time; interrupt like a call"}</small></div>
        {live.active ? <LiveButton /> : <button type="button" className="live-btn" onClick={startLive}>Try again</button>}
      </header>
      <ol className="live-lines" aria-live="polite">
        {live.lines.slice(-5).map((l, i) => <li key={i} className={`is-${l.role}${l.final ? "" : " is-partial"}`}>{l.text}</li>)}
      </ol>
      {live.steps.length > 0 && <ul className="live-steps">{live.steps.map((s, i) => <li key={i}><code>{s}</code></li>)}</ul>}
      {live.result && <p className="live-result">{live.corrected && <small className="live-corrected">Corrected what Shua said (“{live.corrected}”). The real result:</small>}{live.result}</p>}
      <Approval live={live} />
      {live.active && (
        <label className="live-voice">Voice
          <select value={liveVoice()} onChange={(e) => setLiveVoice(e.target.value)} title="Used from the next call">
            {LIVE_VOICES.map((v) => <option key={v} value={v}>{v[0]!.toUpperCase() + v.slice(1)}</option>)}
          </select>
        </label>
      )}
    </section>
  );
}
