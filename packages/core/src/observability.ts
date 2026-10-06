export interface UsageTotals { inputTokens: number; outputTokens: number; cacheTokens: number; reportedCostUsd: number | null }
export interface UsageBucket extends UsageTotals { id: string; records: number }
/** One clock hour (UTC start, ms) of recorded usage, split by provider so charts can show which subscription carried it. */
export interface HourBucket { at: number; inputTokens: number; outputTokens: number; cacheTokens: number; byProvider: Record<string, number> }
export interface LatencyStat { meanMs: number | null; samples: number; p50Ms?: number | null; p90Ms?: number | null }
export interface OperationBucket { id: string; started: number; completed: number; failed: number; approvals: number; firstResponseMs: number | null; responseSamples: number }
export interface ObservedRun extends UsageTotals {
  id: string; title: string; runtime: string; venture?: string; room?: string; status: string; updatedAt: number; usageRecords: number;
}
export interface ObservabilityReport {
  source: { head: number; lastEventAt: number | null; from: number; to: number; computedAt: number; timezone: "UTC" };
  totals: UsageTotals;
  coverage: { usageRecords: number; legacyRecords: number; deltaRecords: number; fallbackRecords: number; costRecords: number; runsWithoutUsage: number; contextOnlyRecords: number; syntheticEventsExcluded: number };
  statuses: Record<string, number>;
  latency: { firstResponse: LatencyStat; turnDuration: LatencyStat };
  daily: UsageBucket[]; providers: UsageBucket[]; ventures: UsageBucket[];
  operations: OperationBucket[];
  /** Hourly usage for the window (capped to the last 30 days), so clients can draw a day by the hour and a weekly rhythm in their own time zone. */
  hourly?: HourBucket[];
  availableProviders: string[]; availableVentures: string[];
  runs: ObservedRun[]; totalRuns: number; offset: number;
  timeline: Array<{ seq: number; at: number; run: string; kind: string; label: string }>;
}
