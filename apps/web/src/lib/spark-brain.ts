/**
 * Which brain Spark uses for a question: Claude, or the model on this Mac. Local when you chose it, or when the Claude
 * model Spark needs is out of usage (a limit for the whole runtime or that model) — so Spark is never stuck.
 */
export function sparkBrain(brain: "auto" | "local", limited: Record<string, { until: number }>, model: string, now = Date.now()): "claude" | "local" {
  if (brain === "local") return "local";
  const out = (key: string) => (limited[key]?.until ?? 0) > now;
  return out("claude") || out(`claude · ${model}`) ? "local" : "claude";
}
