export function voiceEnvelope(current: number, target: number, elapsedMs: number) {
  const bounded = Math.min(1, Math.max(0, Number.isFinite(target) ? target : 0));
  const timeConstant = bounded > current ? 45 : 150;
  const next = current + (bounded - current) * (1 - Math.exp(-Math.max(0, elapsedMs) / timeConstant));
  return bounded === 0 && next < 0.002 ? 0 : next;
}
