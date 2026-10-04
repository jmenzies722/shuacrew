export type ScreenEvidence = { observedAt: number; app?: string; display?: number };
export function screenEvidence(enabled: boolean, evidence?: ScreenEvidence, now = Date.now()) {
  if (!enabled) return { status: "off" as const, label: "Screen off", detail: "Screen requests are disabled" };
  if (!evidence || !Number.isFinite(evidence.observedAt)) return { status: "unobserved" as const, label: "Ready to look", detail: "No verified observation yet" };
  const age = now - evidence.observedAt;
  const label = [evidence.app || "Screen", evidence.display ? `display ${evidence.display}` : ""].filter(Boolean).join(" · ");
  return { status: age >= 0 && age <= 2000 ? "fresh" as const : "stale" as const, label, detail: age >= 0 ? `Observed ${Math.floor(age / 1000)}s ago · re-check before acting` : "Observation clock changed · look again" };
}
export function matchesCapture(requestId: string, reply: { requestId?: string; width?: number; height?: number }): boolean {
  return reply.requestId === requestId && Number.isFinite(reply.width) && Number.isFinite(reply.height) && reply.width! > 0 && reply.height! > 0;
}
