import { redact } from "@shuacrew/core/redact";
export type ToolCardStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled" | "unknown";
export function toolText(value: unknown): string {
  const seen = new WeakSet<object>(); let nodes = 0;
  const safe = (input: unknown, depth: number): unknown => {
    if (++nodes > 1000 || depth > 8) return "[truncated]";
    if (typeof input === "string") return redact(input.slice(0, 16000));
    if (input && typeof input === "object") {
      if (seen.has(input)) return "[circular]"; seen.add(input);
      if (Array.isArray(input)) return input.slice(0, 100).map(item => safe(item, depth + 1));
      return Object.fromEntries(Object.entries(input).slice(0, 100).map(([key, item]) => [key.slice(0, 200), /password|passwd|token|secret|authorization|cookie|api[_-]?key/i.test(key) ? "[redacted]" : safe(item, depth + 1)]));
    }
    return typeof input === "bigint" ? String(input) : input;
  };
  let text: string;
  try { const valueSafe = safe(value, 0); text = typeof valueSafe === "string" ? valueSafe : JSON.stringify(valueSafe, null, 2) ?? "No output recorded."; }
  catch { text = "Output could not be displayed."; }
  return text.length > 12000 ? text.slice(0, 12000) + "\n… Output truncated. Inspect the source run." : text;
}
export function toolCard(input: { name: string; status: string; output?: unknown; startedAt?: number; endedAt?: number }): { title: string; status: ToolCardStatus; durationMs: number | null; text: string } {
  const statuses: ToolCardStatus[] = ["pending", "running", "succeeded", "failed", "cancelled"];
  const start = input.startedAt, end = input.endedAt;
  return { title: redact(input.name).slice(0, 160), status: statuses.includes(input.status as ToolCardStatus) ? input.status as ToolCardStatus : "unknown",
    durationMs: typeof start === "number" && typeof end === "number" && Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : null,
    text: toolText(input.output) };
}
