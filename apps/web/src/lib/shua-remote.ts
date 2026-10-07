/**
 * The notch's ear for your iPhone: asks you send from the phone arrive here (gateway → server-sent events) and go to
 * Shua exactly as if you'd asked in the notch — same actions, same checks — marked as coming from your iPhone so
 * Shua knows you may be away from the Mac. Then it tells the gateway which conversation carries the reply, so the
 * phone can follow it.
 */
import { api } from "./api";

const CONVO_KEY = "shuacrew.buddy";
type Buddy = { notchAsk?: (text: string) => void };

/** What Shua reads: your words, and that they came from the phone. */
export const fromPhone = (text: string) => `From my iPhone: ${text}`;

const convoRun = (): string | undefined => { try { return (JSON.parse(localStorage.getItem(CONVO_KEY) ?? "null") as { run?: string } | null)?.run; } catch { return undefined; } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function handle(ask: { id: string; text: string }) {
  const buddy = (window as unknown as { buddy?: Buddy }).buddy;
  if (!buddy?.notchAsk) return;
  const before = convoRun();
  buddy.notchAsk(fromPhone(ask.text));
  // A new conversation gets its id once its first turn is created; an ongoing one keeps it. Wait for whichever.
  let run: string | undefined;
  for (let i = 0; i < 60; i++) {
    await sleep(i === 0 ? 1200 : 300);
    run = convoRun();
    if (run && (run !== before || i >= 4)) break;
  }
  if (run) await api(`/api/shua/remote/${ask.id}/take`, { body: { run } }).catch(() => {});
}

/** Only the notch listens (one Shua answers, once). Reconnects on its own when the gateway restarts. */
export function startShuaRemote() {
  if (typeof EventSource === "undefined" || !location.pathname.startsWith("/buddy")) return;
  const events = new EventSource("/api/shua/remote/events");
  events.onmessage = (e) => { try { const ask = JSON.parse(e.data) as { id: string; text: string }; if (ask.id && ask.text) void handle(ask); } catch { /* not an ask */ } };
}
