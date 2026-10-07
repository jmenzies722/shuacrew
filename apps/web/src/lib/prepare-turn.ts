/**
 * You started typing a follow-up: ask the gateway to get that session's agent ready now (started, conversation
 * reconnected), so the turn begins the moment you send. At most once a minute per session; a miss costs nothing.
 */
import { api, prepareRun } from "./api";

const last = new Map<string, number>();
const EVERY = 60_000;

export function prepareTurn(run: string, now = Date.now()): boolean {
  if (now - (last.get(run) ?? -Infinity) < EVERY) return false;
  last.set(run, now);
  void api(`/api/runs/${run}/prepare`, { body: {} }).catch(() => undefined);
  return true;
}

/**
 * A new session's reservation: made once the draft says enough to route on, remade only when what it was made
 * for changes (agent, model, effort, member). Sending uses it only if it still matches.
 */
export function newSessionReservation() {
  let made: { key: string; id: Promise<string | null>; at: number } | null = null;
  const keyOf = (s: { runtime?: string; model?: string; effort?: string; member?: string }) => JSON.stringify([s.runtime ?? "", s.model ?? "", s.effort ?? "", s.member ?? ""]);
  return {
    typed(draft: { ask: string; runtime?: string; model?: string; effort?: string; member?: string }, now = Date.now()): boolean {
      if (draft.ask.trim().length < 12) return false;
      const key = keyOf(draft);
      if (made && made.key === key && now - made.at < EVERY) return false;
      made = { key, id: prepareRun(draft), at: now };
      return true;
    },
    async take(sent: { runtime?: string; model?: string; effort?: string; member?: string }): Promise<string | undefined> {
      const mine = made;
      made = null;
      if (!mine || mine.key !== keyOf(sent)) return undefined;
      return (await mine.id) ?? undefined;
    },
  };
}
