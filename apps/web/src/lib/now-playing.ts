import type { ApprovalView, CrewMember, RunView } from "@shuacrew/core/projections";
import { isTopLevelWork } from "./crew";

const LIVE = ["awaiting_approval", "running", "planning", "queued", "paused"] as const;
const RANK: Record<string, number> = { awaiting_approval: 0, running: 1, planning: 2, queued: 3, paused: 4 };

export type TrackMood = "quiet" | "working" | "review" | "failed";
export interface Track {
  mood: TrackMood;
  id: string | null;
  title: string;
  who: string;
  memberId: string;
  status: string;
  label: string;
  waiting: number;
  startedAt: number;
  costUsd: number | null;
  tokens: number;
  tool: string;
}

const LABELS: Record<string, string> = {
  awaiting_approval: "needs you",
  running: "playing",
  planning: "cueing",
  queued: "up next",
  paused: "paused",
  idle: "all quiet",
};

export function trackMood(status: string, waiting: number): TrackMood {
  if (status === "failed") return "failed";
  if (status === "awaiting_approval" || waiting > 0) return "review";
  if (status === "running" || status === "planning" || status === "queued") return "working";
  return "quiet";
}

export function nowPlaying(
  runs: Record<string, RunView>,
  approvals: Record<string, ApprovalView>,
  members: Record<string, CrewMember>,
): Track {
  const waiting = Object.keys(approvals).length;
  const live = Object.values(runs)
    .filter((r) => isTopLevelWork(r, runs) && (LIVE as readonly string[]).includes(r.status))
    .sort((a, b) => (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9) || b.updatedAt - a.updatedAt);
  const pinned = Object.values(approvals).sort((a, b) => a.at - b.at).find((a) => a.run && runs[a.run]);
  const run = (pinned?.run ? runs[pinned.run] : undefined) ?? live[0];
  const empty = { memberId: "", costUsd: null as number | null, tokens: 0, tool: "" };
  if (!run) return { mood: waiting ? "review" : "quiet", id: null, title: waiting ? "Something needs you" : "All quiet", who: "", status: "idle", label: waiting ? `${waiting} waiting` : "all quiet", waiting, startedAt: 0, ...empty };
  const who = run.member ? members[run.member]?.name ?? "" : run.runtime;
  return {
    mood: trackMood(run.status, waiting),
    id: run.id,
    title: run.title || "Untitled",
    who,
    memberId: run.member ?? "",
    status: run.status,
    label: LABELS[run.status] ?? run.status,
    waiting,
    startedAt: run.createdAt,
    costUsd: run.usage.costUsd,
    tokens: run.usage.inputTokens + run.usage.outputTokens,
    tool: run.currentTool ?? "",
  };
}

/** How long this track has been on, in words. */
export function trackAge(startedAt: number, now: number): string {
  if (!startedAt) return "";
  const s = Math.max(0, Math.floor((now - startedAt) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

export function nextTrack(
  runs: Record<string, RunView>,
  approvals: Record<string, ApprovalView>,
  current: string | null,
): { kind: "approval" | "run"; id: string } | null {
  const wait = Object.values(approvals).sort((a, b) => a.at - b.at).filter((a) => (a.run ?? a.id) !== current);
  if (wait[0]) return { kind: "approval", id: wait[0].run ?? wait[0].id };
  const live = Object.values(runs)
    .filter((r) => isTopLevelWork(r, runs) && (LIVE as readonly string[]).includes(r.status) && r.id !== current)
    .sort((a, b) => (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9) || b.updatedAt - a.updatedAt);
  return live[0] ? { kind: "run", id: live[0].id } : null;
}
