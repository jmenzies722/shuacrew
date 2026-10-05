import type { LiveView } from "./live-session";
export type ConversationLine = { role: "user" | "assistant"; text: string; partial?: boolean; corrected?: boolean };
/** A backend result and its spoken paraphrase are one reply, not two chat messages. */
export function liveTranscript(feed: LiveView["feed"]): ConversationLine[] {
  const lines: ConversationLine[] = [];
  let reply = -1, hasResult = false;
  for (const item of feed) {
    if (item.kind === "step" || !item.text.trim()) continue;
    if (item.kind === "line" && item.role === "user") {
      lines.push({ role: "user", text: item.text, partial: !item.final });
      reply = -1; hasResult = false; continue;
    }
    if (hasResult && item.kind === "line") continue;
    const line: ConversationLine = { role: "assistant", text: item.text, partial: item.kind === "line" && !item.final, corrected: item.kind === "result" && !!item.corrected };
    if (reply < 0) { reply = lines.length; lines.push(line); }
    else if (item.kind === "result") lines.splice(reply, lines.length - reply, line);
    else lines.push(line);
    if (item.kind === "result") hasResult = true;
  }
  return lines;
}

/** The notch's reading area contains conversation, never tool-progress messages. */
export function liveNotchText(feed: LiveView["feed"], spokenText = ""): string {
  const last = feed.findLast(item => item.kind !== "step" && item.text.trim());
  if (!last) return "";
  return last.text || spokenText;
}
