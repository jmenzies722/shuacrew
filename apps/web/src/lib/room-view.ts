import type { RoomView } from "@shuacrew/core/rooms";
import type { RunView } from "@shuacrew/core/projections";
const NO_ROOMS: Record<string, RoomView> = {};
export function selectRooms(state: { rooms?: Record<string, RoomView> }) { return state.rooms ?? NO_ROOMS; }
export function roomResults(room: RoomView, runs: Record<string, RunView>) {
  // Coordinator-owned result IDs distinguish terminal output from crew_message progress.
  return room.messages.filter(message => message.author !== "you" && message.sourceRun && message.id.startsWith(`result_${message.sourceRun}_`)).map(message => {
    const run = runs[message.sourceRun!], assignment = message.assignmentId ? room.assignments[message.assignmentId] : undefined;
    return {
      id: message.id, author: message.author, text: message.text, at: message.at,
      runId: message.sourceRun!, requestId: assignment?.rootRequest ?? room.turns.find(turn => turn.runId === message.sourceRun)?.requestId,
      task: assignment?.task ?? run?.title,
      status: !run ? "unavailable" : ["failed", "cancelled"].includes(run.status) ? "partial" : ["done", "merged", "reviewing"].includes(run.status) ? "completed" : "in-progress",
      verification: !run ? "unavailable" : run.checks.length ? "recorded" : "not-recorded",
      checks: run?.checks ?? [], artifactIds: assignment?.artifacts ?? [],
    };
  });
}
export function workspaceView(room: RoomView, runs: Record<string, RunView>, connection: string, requestId?: string) {
  const root = room.turns.find(t => t.requestId === requestId) ?? room.turns.at(-1);
  const assignments = Object.values(room.assignments).filter(a => a.rootRequest === root?.requestId);
  const describe = (runId: string, memberId: string, task: string, fallback: string) => {
    const run = runs[runId];
    const status = connection !== "live" ? "disconnected" : run?.status === "awaiting_approval" ? "needs approval" : run?.status === "running" ? "working" : run?.status === "paused" ? "usage limit" : run?.status === "reviewing" ? "needs review" : run?.status ?? fallback;
    return { runId, memberId, task, state: status, runtime: run?.runtime, tool: run?.currentTool, startedAt: run?.createdAt, updatedAt: run?.updatedAt, checks: run?.checks ?? [], files: run?.files ?? [], reason: run?.statusReason };
  };
  const agents = [...(root ? [describe(root.runId, root.memberId, runs[root.runId]?.title ?? room.messages.find(m => m.requestId === root.requestId && m.author === "you")?.text ?? "Request lead", "history unavailable")] : []), ...assignments.map(a => describe(a.runId, a.memberId, a.task, a.status))];
  return {
    agents,
    counts: {
      working: agents.filter(a => ["working", "planning"].includes(a.state)).length,
      waiting: agents.filter(a => ["queued", "needs approval", "usage limit", "needs review"].includes(a.state)).length,
      complete: agents.filter(a => ["done", "merged"].includes(a.state)).length,
    },
    edges: assignments.map(a => ({ from: a.sourceRun, to: a.runId })),
  };
}
