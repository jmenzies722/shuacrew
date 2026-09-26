/** Spark's morning briefing: once a day, a short spoken rundown built from your real workspace. */
export interface MorningInput {
  now: Date; name?: string; goal?: string;
  headline?: string; finished: string[]; waiting: number; due: number;
  ventures: Array<{ name: string; stage: string }>; running: number;
}

/** Your calendar day (local, not UTC — 9pm in New York is still today). */
export const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Offer it once per calendar day, from 5am. */
export function shouldBrief(lastDay: string | null, now: Date): boolean {
  if (now.getHours() < 5) return false;
  return lastDay !== localDay(now);
}

/** The evening recap: offered once a day from 6pm. */
export function shouldRecap(lastDay: string | null, now: Date): boolean {
  return now.getHours() >= 18 && lastDay !== localDay(now);
}

export interface EveningInput { finished: string[]; failed: number; reviewed: number; tomorrow: string[]; waiting: number }
/** What happened today and what's lined up — only real things, under 30 seconds, ending on something kind. */
export function eveningRecap(i: EveningInput): string {
  const parts = ["Here's your day."];
  if (i.finished.length) parts.push(i.finished.length === 1 ? `The crew shipped ${i.finished[0]}.` : `The crew shipped ${i.finished.length} things, including ${i.finished[0]} and ${i.finished[1]}.`);
  if (i.failed) parts.push(`${i.failed} session${i.failed === 1 ? "" : "s"} hit a problem worth a look.`);
  if (i.reviewed) parts.push(`You reviewed ${i.reviewed} learning card${i.reviewed === 1 ? "" : "s"}.`);
  if (i.waiting) parts.push(`${i.waiting} decision${i.waiting === 1 ? " is" : "s are"} still waiting on you.`);
  if (i.tomorrow.length) parts.push(`Lined up for tomorrow: ${i.tomorrow.slice(0, 2).join(" and ")}.`);
  if (parts.length === 1) parts.push("A quiet one — sometimes that's exactly right.");
  parts.push(i.finished.length || i.reviewed ? "Good work today." : "Rest up.");
  return parts.join(" ");
}

const greeting = (h: number) => (h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");

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
