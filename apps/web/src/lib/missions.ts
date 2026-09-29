/**
 * Missions: work Spark hands to the crew and then stays with until it's finished (the "clicky agent" idea,
 * made persistent). Spark launches it with an end-to-end brief, watches the run, and when the agent stops
 * early — a question it could have answered itself, or a failure — tells it to keep going, a few rounds at
 * most. Approvals are never answered for you: a mission that needs your OK waits for you.
 */

export const MAX_ROUNDS = 3;
const KEY = "shuacrew.spark.missions";

export interface Mission { run: string; task: string; startedAt: number; rounds: number; status: string; done?: boolean }

/** "agent: …", "spark agent …", "hey spark, agent …" (or your companion's name) → the task; anything else → null. */
export function missionTask(text: string, nickname = "Spark"): string | null {
  const names = [...new Set(["spark", nickname.trim().toLowerCase()].filter(Boolean))].map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const m = text.trim().match(new RegExp(`^(?:hey[\\s,]+)?(?:(?:${names.join("|")})[\\s,]+)?agent\\b[\\s,:—-]*(.+)$`, "is"));
  const task = m?.[1]?.trim();
  return task && task.length >= 3 ? task : null;
}

/** The brief every mission starts with: finish it, don't stop to ask what you can decide. */
export function missionBrief(task: string): string {
  return `${task}

Work on this end to end without stopping to check in. Make sensible choices yourself where I haven't specified, and note them. Verify the result actually works (run it, test it, or check the output). Only stop for something that truly needs me: an approval, a credential, or a decision you can't reasonably make. Finish with a short summary of what you did and how you verified it.`;
}

/** Did the agent end its turn by asking instead of finishing? */
export function asksToContinue(text: string): boolean {
  const tail = text.trim().slice(-400).toLowerCase();
  if (!tail) return false;
  return /\?\s*$/.test(tail) || /\b(would you like|do you want|should i|shall i|let me know if|want me to|if you'd like|let me know whether)\b/.test(tail);
}

export type MissionMove =
  | { kind: "wait" }
  | { kind: "needs-you"; say: string }
  | { kind: "continue"; message: string; say: string }
  | { kind: "report"; ok: boolean; say: string };

/** What Spark does next for a mission, given the run's status and the agent's last words. Pure: the tests pin it. */
export function nextMove(input: { status: string; lastText: string; rounds: number; title: string }): MissionMove {
  const { status, lastText, rounds, title } = input;
  const room = rounds < MAX_ROUNDS;
  if (["queued", "planning", "running", "reviewing", "paused"].includes(status)) return { kind: "wait" };
  if (status === "awaiting_approval") return { kind: "needs-you", say: `“${title}” needs your OK before it can go on.` };
  if (status === "cancelled") return { kind: "report", ok: false, say: `“${title}” was cancelled.` };
  if (status === "failed")
    return room
      ? { kind: "continue", message: "That failed. Find the actual cause, fix it, and keep going until the task is done end to end. Verify it works, then summarise.", say: `“${title}” hit a problem. I've asked the crew to fix it and keep going.` }
      : { kind: "report", ok: false, say: `“${title}” still failed after ${rounds} tries. It needs you.` };
  if (status === "done" || status === "merged") {
    if (room && asksToContinue(lastText))
      return { kind: "continue", message: "Yes, go ahead with the most sensible option and finish it end to end. Don't stop to ask again; verify it works, then give me a short summary.", say: `The crew asked a question on “${title}”. I told it to go ahead and finish.` };
    return { kind: "report", ok: true, say: `Done: ${title}. ${summary(lastText)}`.trim() };
  }
  return { kind: "wait" };
}

/** The first sentence or two of the agent's wrap-up, short enough to say out loud. */
export function summary(text: string): string {
  const plain = text.replace(/```[\s\S]*?```/g, " ").replace(/[#*_`>|-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!plain) return "";
  const sentences = plain.match(/[^.!?]+[.!?]+/g) ?? [plain];
  const out = sentences.slice(0, 2).map((s) => s.trim()).join(" ");
  return out.length > 220 ? `${out.slice(0, 217).trimEnd()}…` : out;
}

export function readMissions(): Mission[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((m) => m && typeof m.run === "string") : [];
  } catch {
    return [];
  }
}
export function writeMissions(list: Mission[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-20)));
  } catch {
    /* storage blocked: missions last this visit */
  }
  window.dispatchEvent(new Event("shuacrew:missions"));
}
export function addMission(run: string, task: string) {
  writeMissions([...readMissions().filter((m) => m.run !== run), { run, task, startedAt: Date.now(), rounds: 0, status: "queued" }]);
}
