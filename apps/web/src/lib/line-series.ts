export interface LineSample { at: number; value: number | null }
/** Linear interpolation only between adjacent known observations; no invented samples. */
export function lineGeometry(samples: LineSample[], scale?: number, maxGapMs = Infinity) {
  const rows = samples.filter(s => Number.isFinite(s.at)).sort((a, b) => a.at - b.at);
  const valid = (value: number | null): value is number => value !== null && Number.isFinite(value) && value >= 0;
  const max = rows.reduce((n, s) => valid(s.value) ? Math.max(n, s.value) : n, Number.isFinite(scale) ? Math.max(1, scale!) : 1);
  const from = rows[0]?.at ?? 0, to = rows.at(-1)?.at ?? from;
  const points = rows.map(s => ({ ...s, x: to === from ? 300 : 600 * (s.at - from) / (to - from), y: valid(s.value) ? 180 * (1 - s.value / max) : null }));
  let connected = false, previousAt = -Infinity;
  const path = points.map(p => {
    if (p.y === null) { connected = false; return ""; }
    const command = `${connected && p.at - previousAt <= maxGapMs ? "L" : "M"}${p.x.toFixed(2)},${p.y.toFixed(2)}`; connected = true; previousAt = p.at; return command;
  }).filter(Boolean).join(" ");
  return { points, path, max, from, to };
}
