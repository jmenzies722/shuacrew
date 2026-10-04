/** Diagnostics for push-to-talk: the last 50 steps a turn took, kept on this Mac. No audio, no words — just what happened. */
const KEY = "shuacrew.voice.trace";

export function voiceTrace(step: string, detail: Record<string, unknown> = {}) {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown[];
    list.push({ at: Date.now(), page: location.pathname, step, ...detail });
    localStorage.setItem(KEY, JSON.stringify(list.slice(-50)));
  } catch { /* private mode */ }
}
