/** Events per second over the last `seconds`, oldest first; `rate` is the mean over the last 10 s. */
export function hudSeries(times: number[], now: number, seconds = 30) {
  const perSecond = new Array<number>(seconds).fill(0);
  let lastAt = 0, recent = 0;
  for (const at of times) {
    if (at > lastAt) lastAt = at;
    const age = Math.floor((now - at) / 1000);
    if (age < 0 || age >= seconds) continue;
    perSecond[seconds - 1 - age]! += 1;
    if (age < 10) recent += 1;
  }
  return { perSecond, rate: recent / 10, lastAt };
}
