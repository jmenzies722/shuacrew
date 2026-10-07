/**
 * The notch's ear for your iPhone: asks you send from the phone arrive here (gateway → server-sent events) and go to
 * Shua exactly as if you'd asked in the notch — same actions, same checks — marked as coming from your iPhone so
 * Shua knows you may be away from the Mac. The gateway then finds the conversation carrying the reply in the record,
 * so the phone can follow it.
 */
type Buddy = { notchAsk?: (text: string, phoneAsk?: string) => void };

/** What Shua reads: your words, and that they came from the phone. */
export const fromPhone = (text: string) => `From my iPhone: ${text}`;
/** Told to Shua with an ask from the phone (per turn, only then): do it on the Mac, and bring up on the phone what they want to see. */
export const PHONE_ASK = 'ASKED FROM THEIR IPHONE (they may be away from the Mac; they read and hear you on the phone). Do Mac things on the Mac as always, with real blocks. When they want to SEE or OPEN something — a page, a video, a place, directions, a score, a song link — also bring it up on their phone: ```phone {"open":"https://…"}``` (one URL: maps.apple.com/?q=… for places and directions, music.apple.com for songs). Keep the reply short enough to read on a phone.';

/** What you see: your words as you said them (a small phone mark says where), never the note meant for Shua. */
export const yourWords = (text: string) => text.startsWith("From my iPhone: ") ? { text: text.slice(16), phone: true } : { text, phone: false };

/** Hand it to Shua. The gateway finds which conversation carries it from the record ("From my iPhone: …"). */
function handle(ask: { id: string; text: string }) {
  (window as unknown as { buddy?: Buddy }).buddy?.notchAsk?.(fromPhone(ask.text), ask.id);
}

/** Done on the Mac without a model turn: tell the phone what Shua said (it stops waiting for a conversation). */
export function answerPhone(id: string, text: string, ok = true) {
  void fetch(`/api/shua/remote/${encodeURIComponent(id)}/answer`, { method: "POST", headers: { "Content-Type": "application/json", "X-ShuaCrew": "1" }, body: JSON.stringify({ text, ok }) }).catch(() => {});
}

/** Only the notch listens (one Shua answers, once). Reconnects on its own when the gateway restarts. */
export function startShuaRemote() {
  if (typeof EventSource === "undefined" || !location.pathname.startsWith("/buddy")) return;
  const events = new EventSource("/api/shua/remote/events");
  events.onmessage = (e) => { try { const ask = JSON.parse(e.data) as { id: string; text: string }; if (ask.id && ask.text) handle(ask); } catch { /* not an ask */ } };
}
