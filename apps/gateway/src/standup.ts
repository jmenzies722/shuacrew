/**
 * The daily crew standup: one weekday-morning session that reads what each crew member actually did since the last
 * standup (from the event log, via the API) and writes a two-line update per member to the Library. Turn it on or off
 * from Today; it is an ordinary schedule you can see and edit in Schedules.
 */
import type { FastifyInstance } from "fastify";

export const STANDUP_SCHEDULE = "crew-standup";
export const STANDUP_ASK = [
  "Write today's crew standup for ShuaCrew.",
  "1. Crew members: curl -s http://127.0.0.1:7420/api/crew (id, name, role).",
  "2. Sessions: curl -s http://127.0.0.1:7420/api/snapshot — use .runs (title, member, status, updatedAt in ms). Keep those updated in the last 24 hours (72 on a Monday); group by member (no member = \"the crew\"). Ignore your own standup sessions.",
  "3. For each member with activity: two short lines — what they finished or moved forward yesterday, and what's next or blocked (name the session). Skip members with no activity; say \"quiet day\" if nobody did anything.",
  "4. Finish with one line: the single most important thing for the user today.",
  "5. Save it to the Library titled \"Crew standup — <weekday, month day>\". Only report what the data shows; never invent work.",
].join("\n");

interface ScheduleStore { list(): Array<{ id: string }>; set(input: { id?: string; name?: string; when: string; ask?: string }): unknown; remove(id: string): unknown }

export function standupRoutes(app: FastifyInstance, scheduler: ScheduleStore) {
  app.get("/api/standup", async () => ({ on: scheduler.list().some((s) => s.id === STANDUP_SCHEDULE), when: "weekdays 8:30am" }));
  app.post<{ Body: { on?: boolean } }>("/api/standup", async (req) => {
    const on = req.body?.on === true, exists = scheduler.list().some((s) => s.id === STANDUP_SCHEDULE);
    if (on && !exists) scheduler.set({ id: STANDUP_SCHEDULE, name: "Crew standup", when: "weekdays 8:30am", ask: STANDUP_ASK });
    if (!on && exists) scheduler.remove(STANDUP_SCHEDULE);
    return { on };
  });
}
