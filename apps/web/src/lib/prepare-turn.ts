/**
 * You started typing a follow-up: ask the gateway to get that session's agent ready now (started, conversation
 * reconnected), so the turn begins the moment you send. At most once a minute per session; a miss costs nothing.
 */
import { api } from "./api";

const last = new Map<string, number>();
const EVERY = 60_000;

export function prepareTurn(run: string, now = Date.now()): boolean {
  if (now - (last.get(run) ?? -Infinity) < EVERY) return false;
  last.set(run, now);
  void api(`/api/runs/${run}/prepare`, { body: {} }).catch(() => undefined);
  return true;
}
