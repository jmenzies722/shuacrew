/** Streaks and achievements, computed only from what really happened — nothing to grind, nothing faked. */
import { localDay } from "./morning";

/** Consecutive days ending today (or yesterday, so a streak survives until tonight) on which `hit` is true. */
export function streak(days: Set<string>, now = new Date()): number {
  const d = new Date(now); let n = 0;
  if (!days.has(localDay(d))) d.setDate(d.getDate() - 1); // today isn't over yet
  while (days.has(localDay(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export interface Facts { shippedDays: Set<string>; shipped: number; learnDays: Set<string>; reviewed: number; ventures: number; earning: number; members: number }
export interface Achievement { id: string; name: string; how: string; earned: boolean; progress?: string }

export function achievements(f: Facts, now = new Date()): Achievement[] {
  const learn = streak(f.learnDays, now), ship = streak(f.shippedDays, now);
  const at = (have: number, need: number) => ({ earned: have >= need, progress: have >= need ? undefined : `${have}/${need}` });
  return [
    { id: "first-ship", name: "First ship", how: "The crew finished its first session", ...at(f.shipped, 1) },
    { id: "ten-ships", name: "Ten shipped", how: "Ten sessions finished", ...at(f.shipped, 10) },
    { id: "hundred-ships", name: "Centurion", how: "A hundred sessions finished", ...at(f.shipped, 100) },
    { id: "first-venture", name: "Founder", how: "Started your first venture", ...at(f.ventures, 1) },
    { id: "earning", name: "First dollar", how: "A venture reached earning", ...at(f.earning, 1) },
    { id: "learn-7", name: "Week of learning", how: "Reviewed cards 7 days in a row", ...at(learn, 7) },
    { id: "cards-100", name: "Hundred cards", how: "Reviewed 100 learning cards", ...at(f.reviewed, 100) },
    { id: "full-crew", name: "Full crew", how: "Five or more crew members", ...at(f.members, 5) },
    { id: "ship-5", name: "On a roll", how: "The crew shipped 5 days in a row", ...at(ship, 5) },
  ];
}
