/** Bounded, in-memory timing only. Use timestamps from one monotonic clock. */
export class LatencyRecorder {
  private records = new Map<string, Map<string, number>>();
  mark(id: string, stage: string, at: number): void {
    if (!Number.isFinite(at)) return;
    let record = this.records.get(id);
    if (!record) {
      if (this.records.size >= 256) this.records.delete(this.records.keys().next().value!);
      record = new Map(); this.records.set(id, record);
    }
    if (record.size < 32 || record.has(stage)) record.set(stage, at);
  }
  duration(id: string, from: string, to: string): number | undefined {
    const record = this.records.get(id), a = record?.get(from), b = record?.get(to);
    return a !== undefined && b !== undefined && b >= a ? b - a : undefined;
  }
  clear(id: string): void { this.records.delete(id); }
}
export const interactionLatency = new LatencyRecorder();
