/**
 * The notch's waveform while you talk — the same shape as the cursor buddy's (CursorMotion.waveBars in the Mac app),
 * so the two read as one design: tallest in the middle, each bar rippling at its own pace (a voice, not a meter), a
 * calm ripple in silence (still listening, never a flat line). Heights are 0–1 of the bar's full height.
 */
export function waveBars(level: number, t: number, count = 17): number[] {
  const lv = Math.min(1, Math.max(0, level)), mid = (count - 1) / 2;
  return Array.from({ length: count }, (_, i) => {
    const d = mid === 0 ? 0 : Math.abs(i - mid) / mid;               // 0 at the centre, 1 at the edges
    const envelope = 1 - 0.55 * d * d;
    const ripple = 0.7 + 0.3 * Math.sin(t * (7.3 + 0.9 * i) + i * 1.7);
    const idle = 0.1 * (0.5 + 0.5 * Math.sin(t * 2.4 + i * 0.6));
    return Math.max(0.12, Math.min(1, idle + Math.pow(lv, 0.7) * envelope * ripple)); // pow: quiet speech still moves it
  });
}
