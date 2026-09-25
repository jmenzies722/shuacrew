/** Spark's morning briefing: once a day, a short spoken rundown built from your real workspace. */
export interface MorningInput {
  now: Date; name?: string; goal?: string;
  headline?: string; finished: string[]; waiting: number; due: number;
  ventures: Array<{ name: string; stage: string }>; running: number;
}

/** Offer it once per calendar day, from 5am. */
export function shouldBrief(lastDay: string | null, now: Date): boolean {
  if (now.getHours() < 5) return false;
  return lastDay !== now.toISOString().slice(0, 10);
}

const greeting = (h: number) => (h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");

/** Short enough to hear in under 30 seconds; every clause is something real, and the last is one next step. */
export function morningBrief(i: MorningInput): string {
  const parts: string[] = [`${greeting(i.now.getHours())}${i.name ? `, ${i.name}` : ""}.`];
  if (i.finished.length) parts.push(`${i.finished.length === 1 ? `Your crew finished ${i.finished[0]}` : `Your crew finished ${i.finished.length} things, including ${i.finished[0]}`}.`);
  if (i.running) parts.push(`${i.running} session${i.running === 1 ? " is" : "s are"} working right now.`);
  if (i.waiting) parts.push(`${i.waiting} decision${i.waiting === 1 ? " is" : "s are"} waiting on you.`);
  if (i.due) parts.push(`You have ${i.due} review card${i.due === 1 ? "" : "s"} due${i.goal ? ` on the road to ${i.goal}` : ""}.`);
  const venture = i.ventures.find((v) => v.stage !== "earning" && v.stage !== "stopped");
  if (venture) parts.push(`${venture.name} is ${venture.stage === "idea" ? "still an idea" : `in ${venture.stage}`}.`);
  const next = i.waiting ? "Want to clear the decisions first?" : i.due ? "Want a five-minute review to warm up?" : venture ? `Want me to push ${venture.name} forward?` : "What should we build today?";
  if (parts.length === 1) parts.push("It's a clean slate.");
  parts.push(next);
  return parts.join(" ");
}
