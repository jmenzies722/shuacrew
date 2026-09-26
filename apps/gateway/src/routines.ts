/**
 * Crew routines: recurring jobs you switch on with one toggle. Each is an ordinary schedule (visible and editable in
 * Schedules) whose brief reads real data from the gateway and files its result in the Library. They only report what
 * the data shows — nothing is invented to fill a page.
 */
import type { FastifyInstance } from "fastify";

const SAVE = 'Save it with: curl -s -X POST http://127.0.0.1:7420/api/library/artifacts -H "X-ShuaCrew: 1" -H "Content-Type: application/json" -d \'{"title":"<title>","filename":"<slug>.md","content":"<markdown>"}\' (build the JSON with python3 -c "import json; …" so quotes are escaped).';

export interface Routine { id: string; name: string; when: string; about: string; ask: string }
export const ROUTINES: Routine[] = [
  { id: "weekly-growth", name: "Weekly growth report", when: "fri 5pm", about: "Fridays at 5pm: what you learned, practised and shipped this week, and what to focus on next.",
    ask: ["Write my weekly growth report.",
      "1. Learning: curl -s http://127.0.0.1:7420/api/learning — reviews per day this week, cards due, goal; and the courses/roadmap progress it lists.",
      "2. Shipping: curl -s http://127.0.0.1:7420/api/snapshot — sessions (.runs) done or merged in the last 7 days (title, member).",
      "3. Write: wins this week (specific), what was practised, the one skill gap that showed up most, and three concrete focuses for next week tied to the career goal.",
      `4. Title "Weekly growth — <month day>". ${SAVE}`, "Only what the data shows; if a week was quiet, say so kindly."].join("\n") },
  { id: "competitor-watch", name: "Competitor watch", when: "mon 9am", about: "Mondays at 9am: the crew checks competitors for every venture and flags pricing or feature changes.",
    ask: ["Run competitor watch for my ventures.",
      "1. Ventures: curl -s http://127.0.0.1:7420/api/snapshot — .ventures (name, pitch, stage). Skip stopped ones. If there are none, save nothing and stop.",
      "2. For each venture, find its 3-5 closest competitors on the web; for each: pricing (with the plan names), notable features or launches in the last month, and a link. Compare with last week's report in the library if there is one and highlight what CHANGED.",
      `3. Title "Competitor watch — <month day>". ${SAVE}`, "Cite every claim with a link; write \"unknown\" instead of guessing."].join("\n") },
  { id: "personal-wiki", name: "Personal wiki", when: "sun 8pm", about: "Sundays at 8pm: an up-to-date page per project — what it is, how to run it, decisions made, what's next.",
    ask: ["Update my personal wiki.",
      "1. Projects: list ~/Developer/projects (skip anything under ~/Developer/work or ~/Nectar-Work — never read those).",
      "2. For each project with git activity in the last 30 days: read its README, recent commits (git log --since=30.days --oneline) and top-level layout. Write: what it is, how to run and test it, key decisions (from commit messages), current state, and next steps.",
      `3. One page per project titled "Wiki — <project>". ${SAVE}`, "Don't change any files in the projects; read only."].join("\n") },
];

interface ScheduleStore { list(): Array<{ id: string }>; set(input: { id?: string; name?: string; when: string; ask?: string }): unknown; remove(id: string): unknown }

export function routineRoutes(app: FastifyInstance, scheduler: ScheduleStore) {
  app.get("/api/routines", async () => ROUTINES.map(({ ask: _ask, ...r }) => ({ ...r, on: scheduler.list().some((s) => s.id === r.id) })));
  app.post<{ Params: { id: string }; Body: { on?: boolean } }>("/api/routines/:id", async (req, reply) => {
    const r = ROUTINES.find((x) => x.id === req.params.id);
    if (!r) return reply.code(404).send({ error: "no such routine" });
    const on = req.body?.on === true, exists = scheduler.list().some((s) => s.id === r.id);
    if (on && !exists) scheduler.set({ id: r.id, name: r.name, when: r.when, ask: r.ask });
    if (!on && exists) scheduler.remove(r.id);
    return { id: r.id, on };
  });
}
