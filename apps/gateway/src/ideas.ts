/**
 * The idea inbox: say "idea: …" to Spark from anywhere and it lands as a venture at the idea stage. The first capture
 * also sets up one nightly crew session that scores every new idea (demand, competitors, effort) and files a scorecard
 * in the Library — so by morning each idea has an honest first read.
 */
import type { FastifyInstance } from "fastify";

export const IDEA_SCHEDULE = "idea-inbox";
export const IDEA_SCORING_ASK = [
  "Score the new ideas in my ShuaCrew idea inbox.",
  "1. List ventures: curl -s http://127.0.0.1:7420/api/snapshot — use .ventures (name, pitch, stage); ideas are the ones at stage \"idea\".",
  "2. Skip any idea that already has a Library item titled \"Idea score: <name>\" (search the library first).",
  "3. For each remaining idea, research on the web: who has this problem and how badly (demand), who already solves it and how (competitors, with links and prices), and what it would take to build a first version (effort).",
  "4. Score demand, competition (10 = wide open) and effort (10 = easy) from 1 to 10, give a one-paragraph verdict and the single cheapest way to test demand this week.",
  "5. Save each scorecard to the Library titled \"Idea score: <name>\". Cite sources. Never invent numbers — say \"unknown\" when you can't find them.",
  "Save with: curl -s -X POST http://127.0.0.1:7420/api/library/artifacts -H \"X-ShuaCrew: 1\" -H \"Content-Type: application/json\" -d <json with title, filename, content> (build the JSON with python3 so quotes are escaped).",
].join("\n");

/** "idea: a CRM for dog walkers — scheduling and payments" → a short name and the full pitch. */
export function ideaFrom(text: string): { name: string; pitch: string } | null {
  const pitch = text.replace(/^\s*(new\s+)?idea\s*[:\-–—]\s*/i, "").replace(/\s+/g, " ").trim();
  if (pitch.length < 4) return null;
  const head = pitch.split(/\s[-–—:]\s|[.,;!?]/)[0]!.trim();
  const words = head.split(" ").slice(0, 6).join(" ");
  const name = (words.length > 42 ? `${words.slice(0, 40).trimEnd()}…` : words).replace(/^./, (c) => c.toUpperCase());
  return { name, pitch: pitch.slice(0, 600) };
}

interface VentureStore { set(input: { name: string; pitch?: string; id?: string }): { id: string; name: string } }
interface ScheduleStore { list(): Array<{ id: string }>; set(input: { id?: string; name?: string; when: string; ask?: string }): unknown }

export function ideaRoutes(app: FastifyInstance, ventures: VentureStore, scheduler?: ScheduleStore) {
  app.post<{ Body: { text?: string } }>("/api/ideas", async (req, reply) => {
    const idea = ideaFrom(req.body?.text ?? "");
    if (!idea) return reply.code(400).send({ error: "Say the idea after “idea:” — e.g. “idea: a scheduling app for dog walkers”." });
    const stamp = Date.now().toString(36).slice(-4);
    const venture = ventures.set({ id: `${idea.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)}-${stamp}`, name: idea.name, pitch: idea.pitch });
    let scoring = false;
    if (scheduler) {
      if (!scheduler.list().some((s) => s.id === IDEA_SCHEDULE)) scheduler.set({ id: IDEA_SCHEDULE, name: "Score new ideas", when: "daily 2am", ask: IDEA_SCORING_ASK });
      scoring = true;
    }
    return { venture, scoring };
  });
}
