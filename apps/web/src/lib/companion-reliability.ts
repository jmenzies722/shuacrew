/** Local control phrases deliberately require a whole utterance: never swallow a crew instruction. */
export type CompanionControl = "silence" | "cancel" | "repeat" | "open-chat" | "show-again";
export function companionControl(text: string): CompanionControl | null {
  const t = text.toLowerCase().trim().replace(/[.!?,]+$/g, "").replace(/^please\s+/, "");
  if (/^(stop (talking|speaking)|be quiet|quiet|shh+|shush|hush)$/.test(t)) return "silence";
  if (/^(stop|cancel|never ?mind|stop (this|your) (task|action|request)|cancel (this|my) request)$/.test(t)) return "cancel";
  if (/^(repeat( that)?|say (that|it) again|what did you (just )?say)$/.test(t)) return "repeat";
  if (/^(open|show)( me)?( the| our| your)? chat$/.test(t)) return "open-chat";
  if (/^(show me( that)? again|point (there|to it) again)$/.test(t)) return "show-again";
  return null;
}

export interface ConversationFocus { run?: string; target?: string; task?: string }
export function focusContext(focus: ConversationFocus, runs: Record<string, { title: string; archived?: boolean }>) {
  const run = focus.run && runs[focus.run];
  return ["CONVERSATION CONTINUITY: Resolve it/that/continue from the most recent explicit target below and the chat. If multiple targets fit, ask which before acting. Never treat a pronoun as blanket approval.",
    run && !run.archived ? `Last explicitly selected crew session: ${focus.run} — ${run.title}.` : "No current explicitly selected crew session.",
    focus.target ? `Last screen target: ${focus.target}. Locate it again on the current screen; old coordinates and numbered IDs are invalid after a new capture.` : "",
    focus.task ? `Current user task: ${focus.task.slice(0, 500)}` : ""].filter(Boolean).join("\n");
}
export interface ActionTiming { request: string; route: "direct" | "model"; started: number; dispatched?: number; completed?: number; ok?: boolean }
const KEY = "shuacrew.action-timings";
export function recordActionTiming(row: ActionTiming) {
  try {
    const prior = JSON.parse(localStorage.getItem(KEY) ?? "[]") as ActionTiming[];
    const previous = prior.find(x => x.request === row.request);
    localStorage.setItem(KEY, JSON.stringify([...prior.filter(x => x.request !== row.request).slice(-99), {...previous, ...row}]));
    window.dispatchEvent(new Event("shuacrew:action-timing"));
  } catch { /* Measurements must never block an action. */ }
}
export function actionTimingSummary(rows: ActionTiming[]) {
  const ms = rows.flatMap(r => r.dispatched !== undefined && r.dispatched >= r.started ? [r.dispatched - r.started] : []).sort((a,b) => a-b);
  const percentile = (p: number) => ms.length ? Math.round(ms[Math.max(0, Math.ceil(ms.length * p) - 1)]!) : null;
  return { samples: ms.length, medianDispatchMs: percentile(.5), p95DispatchMs: percentile(.95), completed: rows.filter(r => r.completed !== undefined).length, failed: rows.filter(r => r.ok === false).length };
}

export function readActionTimings(): ActionTiming[] { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; } }
export function loadFocus(): ConversationFocus { try { return JSON.parse(localStorage.getItem("shuacrew.conversation-focus") ?? "{}"); } catch { return {}; } }
export function saveFocus(focus: ConversationFocus) { try { localStorage.setItem("shuacrew.conversation-focus", JSON.stringify(focus)); } catch { /* optional continuity */ } }

/** Concurrent speech recognition may finish out of order; retain spoken order and only adjacent duplicates. */
export function orderedTranscript(parts: Array<{ order: number; text: string }>) {
 return [...parts].sort((a,b)=>a.order-b.order).map(p=>p.text.trim()).filter((t,i,all)=>t && (i===0 || t.toLowerCase()!==all[i-1]!.toLowerCase())).join(" ");
}
/** A model's success claim is not a receipt. Speak confirmed results from the action executor instead. */
export function completionClaim(text: string) {
 return /^(?:done[.!]|(?:i(?:'ve| have)?\s+)?(?:opened|sent|deleted|archived|merged|approved|created|saved|stopped|launched|switched|clicked|pressed)\b)/i.test(text.trim());
}
