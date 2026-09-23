/** Policy types without the engine, for code that runs in the browser. */
export type Verdict = "allow" | "ask" | "deny";
export type Risk = "low" | "medium" | "high" | "critical";
export interface Decision {
  verdict: Verdict;
  risk: Risk;
  rule: string;
  layer: string;
  reason: string;
  trail: Array<{ layer: string; rule: string; verdict: Verdict; reason: string }>;
}
