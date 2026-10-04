export function notchContentHeight(rows: number[], padding: number, gap: number, limit: number) {
  return Math.min(limit, Math.ceil(rows.reduce((sum, height) => sum + height, 0) + padding + Math.max(0, rows.length - 1) * gap));
}

export function companionVoiceState(input: { held: boolean; released: boolean; phase: string; speaking: boolean; pending: boolean }) {
  if (input.held) return "listening";
  if (input.speaking) return "speaking";
  if (input.released || input.phase === "transcribing" || input.pending) return "thinking";
  return input.phase === "hearing" ? "listening" : "idle";
}
