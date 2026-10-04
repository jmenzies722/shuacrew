import { approvalSummary } from "./approval-summary";
import type { CrewRun } from "./crew-voice";

export function commandAnnouncement(tool: string, input: unknown, run: CrewRun, names: Record<string, string>): string | null {
  if (run.archived || run.labels?.includes("buddy") || !/^(?:bash|shell|commandExecution|exec_command|run_command)$/i.test(tool)) return null;
  const who = run.member && names[run.member] ? names[run.member] : "Shua";
  return `${who} requested to ${approvalSummary(tool, input)} for “${run.title.slice(0, 70)}”.`;
}
