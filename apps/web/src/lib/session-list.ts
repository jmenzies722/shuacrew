interface SessionEntry {
  id: string;
  title: string;
  ask: string;
  ticker: string;
  repo?: string;
  parent?: string;
  labels?: string[];
  archived?: boolean;
  updatedAt: number;
}

export function groupSessions<Session extends SessionEntry>(runs: Session[], query: string, now = Date.now()): Array<{ title: string; runs: Session[] }> {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const week = new Date(today);
  week.setDate(week.getDate() - 7);
  const groups: Array<{ title: string; runs: Session[] }> = [
    { title: "Today", runs: [] }, { title: "Yesterday", runs: [] },
    { title: "Previous 7 days", runs: [] }, { title: "Older", runs: [] },
  ];
  const search = query.trim().toLowerCase();
  const visible = runs.filter(run => !run.archived && !run.parent && !run.labels?.some(label => label === "buddy" || label === "learning"))
    .filter(run => !search || `${run.title} ${run.ask} ${run.ticker} ${run.repo ?? ""}`.toLowerCase().includes(search))
    .sort((first, second) => second.updatedAt - first.updatedAt);
  for (const run of visible) {
    const index = run.updatedAt >= today.getTime() ? 0 : run.updatedAt >= yesterday.getTime() ? 1 : run.updatedAt >= week.getTime() ? 2 : 3;
    groups[index]!.runs.push(run);
  }
  return groups.filter(group => group.runs.length > 0);
}

export function sessionStatus(run: { status: string; pendingApprovals: unknown[]; ticker?: string; currentTool?: string; statusReason?: string }, pause?: string | null): { label: string; tone: string } {
  if (run.pendingApprovals.length || run.status === "awaiting_approval") return { label: "Needs approval", tone: "attention" };
  if (run.status === "paused") return { label: pause || "Paused", tone: "attention" };
  if (run.status === "failed") return { label: run.statusReason || "Failed", tone: "error" };
  if (run.status === "running") return { label: run.currentTool ? `Using ${run.currentTool}` : "Working", tone: "active" };
  const labels: Record<string, string> = { queued: "Queued", planning: "Planning", reviewing: "Ready for review", done: "Completed", cancelled: "Stopped" };
  return { label: labels[run.status] || run.status, tone: run.status === "planning" ? "active" : "quiet" };
}
