import { companionName } from "../lib/companion";
import { ArrowUpRight } from "lucide-react";
import { useCompanion } from "../lib/companion";
import { suggestToSpark } from "../lib/spark-panel";
import { SparkCharacter } from "./SparkCharacter";
import { useLive } from "../lib/live";

/** Each page's name, the one thing Shua offers there, and the message that offer prepares. */
export const contexts: Record<string, [string, string, string]> = {
  "/": ["Sessions", "Plan the next step", "Help me choose the next useful step in my current work. Ask for any project context you need."],
  "/activity": ["Today", "Shape my day", "Help me plan today around one meaningful priority, time to focus, and something that supports my life outside work."],
  "/crew": ["Agents", "Build my crew", "Help me design a small effective crew for my current goals, with clear responsibilities for Claude and Codex."],
  "/floor": ["Live", "Find the next handoff", "Help me understand my crew's current work and identify the next useful handoff. Use available recorded status; ask me if anything is missing."],
  "/specs": ["Specs", "Draw the architecture", "Help me design an app architecture. Ask which project, then produce a clear Mermaid diagram, component responsibilities, and implementation steps."],
  "/board": ["Board", "Unblock the work", "Help me identify blocked work and choose the smallest action that moves it forward. Ask for the task details you need."],
  "/schedules": ["Schedules", "Design a routine", "Help me design a useful recurring routine with a clear trigger, output, and review point. Prepare the plan before enabling anything."],
  "/library": ["Library", "Connect the ideas", "Help me connect what I have made and learned into something useful for my current project. Ask which artifacts to use."],
  "/inbox": ["Inbox", "Clear my inbox", "Go through what is waiting on me, most blocking first. For each item say in one line what it is and what you would do, then ask me before acting on anything."],
  "/profile": ["About you", "Help me fill this in", "Help me write my About me notes. Ask me five short questions about my goals, projects and how I like to work, then draft the text for me to paste in."],
  "/memory": ["Memory", "Keep the lesson", "Help me turn a recent experience into a concise reusable lesson. Ask me what happened and what I would change."],
  "/integrations": ["Tools & skills", "Choose the right tools", "Help me choose tools and skills for my workflow. Explain what each needs access to and how I can verify it works."],
  "/policy": ["Policy & audit", "Explain my guardrails", "Help me understand the app's agent permissions and approval workflow. Use actual configured policy when available and distinguish it from suggestions."],
  "/observability": ["Insights", "Read the signals", "Help me interpret recorded activity, failures, and latency. Keep missing data explicit and identify one actionable improvement."],
  "/usage": ["Usage", "Understand usage", "Help me understand recorded model usage and its coverage. Distinguish recorded tokens from remaining subscription quota."],
  "/terminal": ["Terminal", "Explain a command", "Help me understand a terminal command before I run it. Ask me to paste it, then explain its effects and how to verify the result."],
  "/developer": ["Developer", "Trace a problem", "Help me investigate a platform problem using observable evidence, a minimal reproduction, and a verification step."],
  "/settings": ["Settings", "Make it feel like me", "Help me personalize ShuaCrew's appearance, motion, Shua, and model routing. Ask what I want to improve first."],
};

/** A small, consistent companion affordance across every workspace section. */
/** The page you're on, as Shua sees it: name, offer and the full ask. */
export function pageContext(path: string): { name: string; action: string; prompt: string } | null {
  const section = path.startsWith("/sessions") ? "/" : `/${path.split("/")[1] ?? ""}`;
  const c = contexts[section];
  return c ? { name: c[0], action: c[1], prompt: c[2] } : null;
}

export function WorkspaceSpark({ section }: { section: string }) {
  const prefs = useCompanion();
  // Alive when the crew is: a breathing ring around Shua while anything runs, amber while something waits on you.
  const working = useLive((s) => Object.values(s.crew.runs).some((r) => r.status === "running" || r.status === "planning"));
  const waiting = useLive((s) => Object.keys(s.crew.approvals).length > 0);
  const [name, action, prompt] = contexts[section] ?? ["Workspace", "Find my next step", "Help me find the next useful step in ShuaCrew."];
  // Only what's particular to this page: the page title says where you are, and the sidebar already opens Spark.
  return <div className="workspace-companion" aria-label={`${name} companion`}>
    <button type="button" className={`workspace-suggestion${waiting ? " is-wait" : working ? " is-live" : ""}`} onClick={() => suggestToSpark(`I'm in ${name}. ${prompt}`)} title={`Ask ${companionName(prefs)}: prepares the message for you to review before sending`}>
      <SparkCharacter preferences={prefs} mood="idle" size={20} crop="portrait" />{action}<ArrowUpRight size={12} />
    </button>
  </div>;
}
