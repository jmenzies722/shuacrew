import { ArrowUpRight } from "lucide-react";
import { useCompanion } from "../lib/companion";
import { suggestToSpark } from "../lib/spark-panel";
import { SparkCharacter } from "./SparkCharacter";

const contexts: Record<string, [string, string, string]> = {
  "/": ["Sessions", "Plan the next step", "Help me choose the next useful step in my current work. Ask for any project context you need."],
  "/activity": ["Today", "Shape my day", "Help me plan today around one meaningful priority, time to focus, and something that supports my life outside work."],
  "/crew": ["Crew", "Build my crew", "Help me design a small effective crew for my current goals, with clear responsibilities for Claude and Codex."],
  "/floor": ["Crew Studio", "Find the next handoff", "Help me understand my crew's current work and identify the next useful handoff. Use available recorded status; ask me if anything is missing."],
  "/studio": ["Studio", "Set the mood", "Help me choose a focus routine and a soundscape for the work I want to do next."],
  "/ventures": ["Ventures", "Pressure-test an idea", "Help me pressure-test a venture idea: the user problem, smallest useful product, and an experiment I can run this week."],
  "/playbooks": ["Playbooks", "Make it repeatable", "Help me turn a recurring workflow into a playbook with clear steps, verification, and a stopping point."],
  "/specs": ["Specs", "Draw the architecture", "Help me design an app architecture. Ask which project, then produce a clear Mermaid diagram, component responsibilities, and implementation steps."],
  "/board": ["Board", "Unblock the work", "Help me identify blocked work and choose the smallest action that moves it forward. Ask for the task details you need."],
  "/schedules": ["Schedules", "Design a routine", "Help me design a useful recurring routine with a clear trigger, output, and review point. Prepare the plan before enabling anything."],
  "/library": ["Library", "Connect the ideas", "Help me connect what I have made and learned into something useful for my current project. Ask which artifacts to use."],
  "/memory": ["Memory", "Keep the lesson", "Help me turn a recent experience into a concise reusable lesson. Ask me what happened and what I would change."],
  "/teach": ["Visual teaching", "Explore an idea", "Help me choose a focused question for the shared visual teaching canvas."],
  "/learn": ["Learning", "Learn by building", "Help me choose a small project that teaches the next skill I need and builds on my previous work."],
  "/integrations": ["Tools & skills", "Choose the right tools", "Help me choose tools and skills for my workflow. Explain what each needs access to and how I can verify it works."],
  "/policy": ["Policy & audit", "Explain my guardrails", "Help me understand the app's agent permissions and approval workflow. Use actual configured policy when available and distinguish it from suggestions."],
  "/observability": ["Insights", "Read the signals", "Help me interpret recorded activity, failures, and latency. Keep missing data explicit and identify one actionable improvement."],
  "/usage": ["Usage", "Understand usage", "Help me understand recorded model usage and its coverage. Distinguish recorded tokens from remaining subscription quota."],
  "/terminal": ["Terminal", "Explain a command", "Help me understand a terminal command before I run it. Ask me to paste it, then explain its effects and how to verify the result."],
  "/developer": ["Developer", "Trace a problem", "Help me investigate a platform problem using observable evidence, a minimal reproduction, and a verification step."],
  "/guide": ["Guide", "Ask about any feature", "Help me understand what ShuaCrew can do. Ask what I am trying to get done, then point me to the right page and how to start."],
  "/settings": ["Settings", "Make it feel like me", "Help me personalize ShuaCrew's appearance, motion, Spark, and model routing. Ask what I want to improve first."],
};

/** A small, consistent companion affordance across every workspace section. */
export function WorkspaceSpark({ section }: { section: string }) {
  const prefs = useCompanion();
  if (section === "/rooms") return null;
  const [name, action, prompt] = contexts[section] ?? ["Workspace", "Find my next step", "Help me find the next useful step in ShuaCrew."];
  // Only what's particular to this page: the page title says where you are, and the sidebar already opens Spark.
  return <div className="workspace-companion" aria-label={`${name} companion`}>
    <button type="button" className="workspace-suggestion" onClick={() => suggestToSpark(`I'm in ${name}. ${prompt}`)} title={`Ask ${prefs.nickname || "Spark"}: prepares the message for you to review before sending`}>
      <SparkCharacter preferences={prefs} mood="idle" size={20} crop="portrait" />{action}<ArrowUpRight size={12} />
    </button>
  </div>;
}
