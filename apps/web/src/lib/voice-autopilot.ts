import type { CrewRun } from "./crew-voice";

/** Only direct requests change permissions; questions and quoted crew instructions do not. */
export function autopilotRequest(text: string): { mode: "auto" | "ask"; target?: string } | null {
  const t = text.trim().replace(/[.!?]+$/, "").replace(/^please\s+/i, "");
  const on = t.match(/^(?:go(?: into)?|enable|start|turn on|switch to) autopilot(?: mode)?(?: for (.+))?$/i);
  const off = t.match(/^(?:(?:disable|stop|turn off) autopilot(?: mode)?|(?:go|switch)(?: back)? to supervised(?: mode)?)(?: for (.+))?$/i);
  const match = on ?? off;
  return match ? { mode: on ? "auto" : "ask", ...(match[1] ? { target: match[1].trim() } : {}) } : null;
}

export function autopilotTarget(runs: Record<string, CrewRun>, context: { target?: string; focused?: string }): string | null {
  const eligible = Object.values(runs).filter(r => !r.archived && !r.labels?.some(l => l === "buddy" || l === "crew-room") && ["queued", "planning", "running", "awaiting_approval", "paused"].includes(r.status));
  if (context.target) {
    const matches = eligible.filter(r => r.title.toLowerCase() === context.target!.toLowerCase() || r.id === context.target);
    return matches.length === 1 ? matches[0]!.id : null;
  }
  if (context.focused && eligible.some(r => r.id === context.focused)) return context.focused;
  return eligible.length === 1 ? eligible[0]!.id : null;
}

export function autopilotResult(title: string, status: string): string | null {
  const name = `“${title.slice(0, 80)}”`;
  if (status === "reviewing") return `${name} is ready for your review.`;
  if (status === "done" || status === "merged") return `${name} has finished.`;
  if (status === "failed") return `${name} hit a problem and needs your attention.`;
  if (status === "cancelled") return `${name} was canceled.`;
  return null;
}

const KEY = "shuacrew.voice-autopilot";
export function readAutopilotWatch(): Record<string, string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).filter(([,v]) => typeof v === "string")) : {};
  } catch { return {}; }
}
export function writeAutopilotWatch(value: Record<string, string>) {
  try { localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* Current window still tracks completion. */ }
}
