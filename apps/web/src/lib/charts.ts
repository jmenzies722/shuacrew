/**
 * Pure geometry for the Tools hub's instruments: smooth curves that never overshoot the data, axis maxima a person
 * can read, and a squarified treemap. No DOM here, so every chart's shape is unit-tested.
 */
export type Point = readonly [number, number];

/**
 * A smooth SVG path through the points (monotone cubic, Fritsch–Carlson): it bends like a spline but never swings
 * above a peak or below a valley, so a chart can't show a value that was never recorded.
 */
export function smoothPath(points: readonly Point[]): string {
  const n = points.length;
  if (!n) return "";
  const f = (v: number) => Math.round(v * 100) / 100;
  if (n === 1) return `M${f(points[0]![0])},${f(points[0]![1])}`;
  const x = points.map((p) => p[0]), y = points.map((p) => p[1]);
  const dx: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = x[i + 1]! - x[i]!; m[i] = dx[i] ? (y[i + 1]! - y[i]!) / dx[i]! : 0; }
  const t: number[] = new Array<number>(n);
  t[0] = m[0]!; t[n - 1] = m[n - 2]!;
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1]! * m[i]! <= 0 ? 0 : (m[i - 1]! + m[i]!) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i]! / m[i]!, b = t[i + 1]! / m[i]!, s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]!; t[i + 1] = k * b * m[i]!; }
  }
  let d = `M${f(x[0]!)},${f(y[0]!)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i]! / 3;
    d += `C${f(x[i]! + h)},${f(y[i]! + t[i]! * h)},${f(x[i + 1]! - h)},${f(y[i + 1]! - t[i + 1]! * h)},${f(x[i + 1]!)},${f(y[i + 1]!)}`;
  }
  return d;
}

/** The closed area between an upper and a lower line (the same x positions), for stacked or baseline fills. */
export function bandPath(upper: readonly Point[], lower: readonly Point[]): string {
  if (!upper.length) return "";
  const back = smoothPath([...lower].reverse());
  return `${smoothPath(upper)}L${back.slice(1)}Z`;
}

/** A readable axis maximum at or above `v`: 1, 2, 2.5 or 5 times a power of ten. */
export function niceMax(v: number): number {
  if (!(v > 0) || !Number.isFinite(v)) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const k of [1, 2, 2.5, 5, 10]) if (k * pow >= v) return k * pow;
  return 10 * pow;
}

/** Running totals across series, index by index: layer k's top is the sum of series 0..k. */
export function stack(series: readonly (readonly number[])[]): number[][] {
  const out: number[][] = [];
  series.forEach((values, k) => out.push(values.map((v, i) => (k ? out[k - 1]![i]! : 0) + (Number.isFinite(v) && v > 0 ? v : 0))));
  return out;
}

export interface Box { x: number; y: number; w: number; h: number }

/**
 * Squarified treemap (Bruls, Huizing & van Wijk): tiles keep areas proportional to value while staying as close to
 * square as possible, so a long title still has room. Items are laid out in the order given; pass them largest first.
 */
export function squarify<T extends { value: number }>(items: readonly T[], box: Box): Array<T & Box> {
  const live = items.filter((i) => Number.isFinite(i.value) && i.value > 0);
  const total = live.reduce((s, i) => s + i.value, 0);
  if (!total || box.w <= 0 || box.h <= 0) return [];
  const scale = (box.w * box.h) / total;
  const out: Array<T & Box> = [];
  let rest = live.map((item) => ({ item, area: item.value * scale }));
  let { x, y, w, h } = box;
  const worst = (row: typeof rest, side: number) => {
    const sum = row.reduce((s, r) => s + r.area, 0), max = Math.max(...row.map((r) => r.area)), min = Math.min(...row.map((r) => r.area));
    return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
  };
  while (rest.length) {
    const side = Math.min(w, h);
    let count = 1;
    while (count < rest.length && worst(rest.slice(0, count + 1), side) <= worst(rest.slice(0, count), side)) count++;
    const row = rest.slice(0, count), sum = row.reduce((s, r) => s + r.area, 0);
    rest = rest.slice(count);
    if (w >= h) {
      const cw = rest.length ? sum / h : w; let cy = y;
      for (const r of row) { const ch = (r.area / sum) * h; out.push({ ...r.item, x, y: cy, w: cw, h: ch }); cy += ch; }
      x += cw; w -= cw;
    } else {
      const rh = rest.length ? sum / w : h; let cx = x;
      for (const r of row) { const rw = (r.area / sum) * w; out.push({ ...r.item, x: cx, y, w: rw, h: rh }); cx += rw; }
      y += rh; h -= rh;
    }
  }
  return out;
}

/** Compact counts for instruments: 950, 12.4k, 3.1M, 1.2B. */
export const compact = (n: number) =>
  !Number.isFinite(n) ? "—" : n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : `${Math.round(n)}`;

/** Durations for instruments: 840 ms, 9.1 s, 42 s, 3 m. */
export const seconds = (ms: number | null | undefined) =>
  ms === null || ms === undefined || !Number.isFinite(ms) ? "—" : ms < 1000 ? `${Math.round(ms)} ms` : ms < 10_000 ? `${(ms / 1000).toFixed(1)} s` : ms < 120_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} m`;

/** The middle value (0 for none): what a "usual" day looks like without one wild day skewing it. */
export function median(values: readonly number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b), mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}
