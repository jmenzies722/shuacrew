/**
 * The notch's ear for your iPhone: asks you send from the phone arrive here (gateway → server-sent events) and go to
 * Shua exactly as if you'd asked in the notch — same actions, same checks — marked as coming from your iPhone so
 * Shua knows you may be away from the Mac. The gateway then finds the conversation carrying the reply in the record,
 * so the phone can follow it.
 */
type Buddy = { notchAsk?: (text: string) => void };

/** What Shua reads: your words, and that they came from the phone. */
export const fromPhone = (text: string) => `From my iPhone: ${text}`;

/** Hand it to Shua. The gateway finds which conversation carries it from the record ("From my iPhone: …"). */
function handle(ask: { id: string; text: string }) {
  (window as unknown as { buddy?: Buddy }).buddy?.notchAsk?.(fromPhone(ask.text));
}

/** Only the notch listens (one Shua answers, once). Reconnects on its own when the gateway restarts. */
export function startShuaRemote() {
  if (typeof EventSource === "undefined" || !location.pathname.startsWith("/buddy")) return;
  const events = new EventSource("/api/shua/remote/events");
  events.onmessage = (e) => { try { const ask = JSON.parse(e.data) as { id: string; text: string }; if (ask.id && ask.text) handle(ask); } catch { /* not an ask */ } };
}
