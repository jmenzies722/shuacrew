export interface HealthSample { at: number; value: number | null; uptimeS: number }
export function appendHealthSample(history: HealthSample[], sample: { at: number; rssMb: number; uptimeS: number }): HealthSample[] {
  if (!Number.isFinite(sample.rssMb) || sample.rssMb < 0 || !Number.isFinite(sample.at)) return history;
  const previous = history.at(-1);
  if (previous && sample.at <= previous.at) return history;
  const gap = previous && (sample.at - previous.at > 65000 || sample.uptimeS < previous.uptimeS) ? [{ at: sample.at - 1, value: null, uptimeS: sample.uptimeS }] : [];
  return [...history, ...gap, { at: sample.at, value: sample.rssMb, uptimeS: sample.uptimeS }].slice(-120);
}
