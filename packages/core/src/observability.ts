export interface UsageTotals { inputTokens: number; outputTokens: number; cacheTokens: number; reportedCostUsd: number | null }
export interface UsageBucket extends UsageTotals { id: string; records: number }
export interface OperationBucket { id: string; started: number; completed: number; failed: number; approvals: number; firstResponseMs: number | null; responseSamples: number }
export interface ObservedRun extends UsageTotals {
  id: string; title: string; runtime: string; venture?: string; room?: string; status: string; updatedAt: number; usageRecords: number;
}
export interface ObservabilityReport {
  source: { head: number; lastEventAt: number | null; from: number; to: number; computedAt: number; timezone: "UTC" };
  totals: UsageTotals;
  coverage: { usageRecords: number; legacyRecords: number; deltaRecords: number; fallbackRecords: number; costRecords: number; runsWithoutUsage: number; contextOnlyRecords: number; syntheticEventsExcluded: number };
  statuses: Record<string, number>;
  latency: { firstResponse: { meanMs: number | null; samples: number }; turnDuration: { meanMs: number | null; samples: number } };
  daily: UsageBucket[]; providers: UsageBucket[]; ventures: UsageBucket[];
  operations: OperationBucket[];
  availableProviders: string[]; availableVentures: string[];
  runs: ObservedRun[]; totalRuns: number; offset: number;
  timeline: Array<{ seq: number; at: number; run: string; kind: string; label: string }>;
}
