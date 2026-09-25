import type { AnyEvent } from "@shuacrew/core/events";
import type { CrewMember, RunView } from "@shuacrew/core/projections";
import type { RoomView } from "@shuacrew/core/rooms";

export type NodeState = "working" | "waiting" | "recent" | "idle";
export interface StageNode { id: string; kind: "you" | "member" | "agent"; label: string; sub: string; color: string; emoji?: string; state: NodeState; runId?: string; tool?: { name: string; detail: string; at: number }; subagents: number; sessions: number }
export interface StageEdge { id: string; from: string; to: string; kind: "session" | "delegation"; live: boolean; label?: string }

const WORKING = new Set(["running", "planning", "queued", "awaiting_approval"]);
/** Work that is actually moving. Waiting on you is shown as a halo, not a pulse. */
const FLOWING = new Set(["running", "planning", "queued"]);
const AGENT_COLOR: Record<string, string> = { claude: "#e8845c", codex: "#4ade80" };

/** The Crew Floor stage, from recorded state only: who is working, for whom, and who handed what to whom. */
export function buildStage(input: {
  members: Record<string, CrewMember>; runs: Record<string, RunView>; rooms: Record<string, RoomView>;
  approvals: Record<string, { run?: string | null }>; activity: AnyEvent[]; now: number; linger?: number;
}): { nodes: StageNode[]; edges: StageEdge[] } {
  const { members, runs, rooms, approvals, activity, now } = input, linger = input.linger ?? 90_000;
  const recent = (r: RunView) => WORKING.has(r.status) || now - r.updatedAt < linger;
  const ownerOf = (r: RunView) => (r.member && members[r.member] ? r.member : `agent:${r.runtime}`);
  const waitingRuns = new Set(Object.values(approvals).map((a) => a.run).filter(Boolean) as string[]);
  const byOwner = new Map<string, RunView[]>();
  for (const r of Object.values(runs)) if (!r.parent && recent(r)) (byOwner.get(ownerOf(r)) ?? byOwner.set(ownerOf(r), []).get(ownerOf(r))!).push(r);
  // Delegations inside rooms: coordinator → member, for work that's live or just finished.
  const edges: StageEdge[] = [];
  for (const room of Object.values(rooms)) for (const a of Object.values(room.assignments)) {
    const live = a.status === "queued" || a.status === "running";
    if (!live && now - a.updatedAt > linger) continue;
    if (!members[a.memberId] || !members[room.coordinator]) continue;
    edges.push({ id: `d:${a.id}`, from: room.coordinator, to: a.memberId, kind: "delegation", live, label: a.task.slice(0, 60) });
    const child = runs[a.runId];
    if (child) (byOwner.get(a.memberId) ?? byOwner.set(a.memberId, []).get(a.memberId)!).push(child);
  }
  const lastTool = new Map<string, { name: string; detail: string; at: number }>();
  for (const e of activity) if (e.kind === "tool.called" && e.run && now - e.at < 6000) {
    const input = e.body.input as Record<string, unknown> | undefined;
    const detail = String(input?.file_path ?? input?.path ?? input?.command ?? input?.url ?? input?.query ?? "").split("/").pop()!.slice(0, 40);
    lastTool.set(e.run, { name: e.body.tool, detail, at: e.at });
  }
  const stateOf = (list: RunView[]): NodeState => list.some((r) => waitingRuns.has(r.id) || r.status === "awaiting_approval") ? "waiting" : list.some((r) => WORKING.has(r.status)) ? "working" : list.length ? "recent" : "idle";
  const node = (id: string, base: Omit<StageNode, "state" | "runId" | "tool" | "subagents" | "sessions">): StageNode => {
    const list = (byOwner.get(id) ?? []).sort((a, b) => b.updatedAt - a.updatedAt);
    const tool = list.map((r) => lastTool.get(r.id)).filter(Boolean).sort((a, b) => b!.at - a!.at)[0];
    return { ...base, state: stateOf(list), runId: list[0]?.id, tool, subagents: list.filter((r) => WORKING.has(r.status)).reduce((n, r) => n + (r.subagents ?? []).filter((s) => !s.done).length, 0), sessions: list.length };
  };
  const nodes: StageNode[] = [{ id: "you", kind: "you", label: "You", sub: "", color: "var(--text)", state: "idle", subagents: 0, sessions: 0 }];
  for (const m of Object.values(members)) nodes.push(node(m.id, { id: m.id, kind: "member", label: m.name, sub: m.role, color: m.color, emoji: m.emoji }));
  for (const owner of byOwner.keys()) if (owner.startsWith("agent:")) { const rt = owner.slice(6); nodes.push(node(owner, { id: owner, kind: "agent", label: rt[0]!.toUpperCase() + rt.slice(1), sub: "No crew member", color: AGENT_COLOR[rt] ?? "#6cb6ff" })); }
  // You → whoever is doing your sessions (not delegated children: those arrive via their coordinator).
  for (const [owner, list] of byOwner) {
    const mine = list.filter((r) => !r.parent && !r.labels?.includes("crew-room"));
    const roomTurns = list.filter((r) => !r.parent && r.labels?.includes("crew-room"));
    if (mine.length || roomTurns.length) edges.push({ id: `s:${owner}`, from: "you", to: owner, kind: "session", live: [...mine, ...roomTurns].some((r) => FLOWING.has(r.status)) });
  }
  return { nodes, edges };
}
