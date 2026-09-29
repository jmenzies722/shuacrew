import { fold, redact } from "@shuacrew/core";
import { MobileV2SnapshotSchema, type MobileV2Snapshot } from "@shuacrew/core/mobile-v2";
import type { EventStore } from "../store.js";
import { projectMobile } from "./projection.js";

function clipped(value: string, max: number) {
  // Display summaries are not file access. Mask absolute path tokens without
  // treating the slashes inside an HTTPS URL as local files.
  const safe = redact(value).replace(/file:\/\/[^\s"'<>]+|(?<![:/\w])\/(?!\/)[^\s"'<>]+|\b[A-Za-z]:\\[^\s"'<>]+/g, "[local path]");
  let result = "", size = 0;
  for (const point of safe) { const count = Buffer.byteLength(point); if (size + count > max) break; result += point; size += count; }
  return result;
}

/** Independent v2 allowlist. The legacy projection remains unchanged for Watch/v1. */
export function projectMobileV2(store: EventStore, options: Parameters<typeof projectMobile>[1]): MobileV2Snapshot {
  const legacy = projectMobile(store, options), state = fold(store.read(0));
  const snapshot: MobileV2Snapshot = {
    version: 2, installationId: options.installationId, deviceId: options.deviceId, sequence: legacy.sequence, observedAt: options.now,
    rooms: legacy.rooms.map(room => ({ id: room.id, title: clipped(room.title, 256), coordinatorId: state.rooms[room.id]!.coordinator, paused: room.paused, members: [], messages: [], queue: [], truncated: room.truncated })),
    work: [], results: [], offers: legacy.offers, usage: legacy.usage, truncated: legacy.truncated,
  };
  const append = <T>(items: T[], item: T, room?: MobileV2Snapshot["rooms"][number]) => {
    items.push(item);
    if (Buffer.byteLength(JSON.stringify(snapshot)) > 523000) { items.pop(); snapshot.truncated = true; if (room) room.truncated = true; return false; }
    return true;
  };
  // Decisions are retained first, followed by current work, identity, queue and history.
  const active = new Set(["queued", "planning", "running", "awaiting_approval", "paused"]);
  const runs = [...legacy.runs].sort((a, b) => Number(active.has(b.status)) - Number(active.has(a.status)));
  const allowed = new Set(runs.map(run => run.id));
  for (const run of runs) {
    const room = state.rooms[run.roomId], source = state.runs[run.id]; if (!room || !source) continue;
    const turn = room.turns.find(turn => turn.runId === run.id), assignment = Object.values(room.assignments).find(item => item.runId === run.id);
    const requestId = turn?.requestId ?? assignment?.rootRequest, memberId = turn?.memberId ?? assignment?.memberId;
    if (!requestId || !memberId) { snapshot.truncated = true; continue; }
    append(snapshot.work, { id: run.id, roomId: room.id, requestId, memberId, sourceRunId: assignment?.sourceRun ?? null, dependencyIds: assignment ? [assignment.sourceRun] : [], title: clipped(run.title, 256) || "Untitled", status: run.status, updatedAt: source.updatedAt });
  }
  for (const projected of snapshot.rooms) {
    const room = state.rooms[projected.id]!;
    for (const id of room.members.slice(0, 16)) {
      const member = state.members[id];
      append(projected.members, { id, name: clipped(member?.name ?? id, 128) || id, role: clipped(member?.role ?? "Crew member", 256) || "Crew member", color: /^#[a-fA-F0-9]{6}$/.test(member?.color ?? "") ? member!.color : "#808080", glyph: /^[A-Za-z0-9_-]{1,64}$/.test(member?.emoji ?? "") ? member!.emoji : "person" }, projected);
    }
    const entries = Object.values(room.queue ?? {}).filter(entry => !entry.runId || allowed.has(entry.runId));
    const queue = [...entries.filter(entry => entry.state === "pending"), ...entries.filter(entry => entry.state !== "pending").reverse()].slice(0, 20);
    if (entries.length > queue.length) projected.truncated = true;
    for (const entry of queue) append(projected.queue, { requestId: entry.requestId, text: clipped(entry.text, 8000) || "[Unavailable text]", recipient: entry.recipient ?? null, replyTo: entry.replyTo ?? null, issuedAt: entry.issuedAt, expiresAt: entry.expiresAt, state: entry.state, runId: entry.runId ?? null }, projected);
  }
  // Explicit coordinator-owned result IDs exclude informal progress chatter.
  for (const projected of snapshot.rooms) {
    const room = state.rooms[projected.id]!;
    for (const message of [...room.messages].reverse()) {
      if (!message.sourceRun || !allowed.has(message.sourceRun) || !message.id.startsWith(`result_${message.sourceRun}_`)) continue;
      const work = snapshot.work.find(work => work.id === message.sourceRun), run = state.runs[message.sourceRun];
      if (!work || !run) { projected.truncated = true; continue; }
      if (snapshot.results.length >= 100) { projected.truncated = true; break; }
      const assignment = message.assignmentId ? room.assignments[message.assignmentId] : undefined;
      const artifacts = (assignment?.artifacts ?? []).slice(0, 20).map(id => {
        const item = state.artifacts[id];
        return { id, title: clipped(item?.title ?? "Unavailable artifact", 256) || "Untitled", available: !!item && item.run === run.id };
      });
      const summary = clipped(message.text, 2048) || "[Unavailable text]";
      if (summary !== clipped(message.text, 16000)) projected.truncated = true;
      append(snapshot.results, { id: message.id, roomId: room.id, runId: run.id, requestId: work.requestId, memberId: message.author, summary, state: ["failed", "cancelled"].includes(run.status) ? "partial" : ["done", "merged", "reviewing"].includes(run.status) ? "completed" : "partial", verification: run.checks.length ? "recorded" : "not-recorded", artifacts }, projected);
    }
  }
  for (const projected of snapshot.rooms) {
    const room = state.rooms[projected.id]!, messages = legacy.rooms.find(item => item.id === room.id)!.messages;
    for (const message of [...messages].reverse()) {
      const source = room.messages.find(item => item.id === message.id)!;
      append(projected.messages, { id: message.id, author: source.author, text: clipped(message.text, 8000) || "[Unavailable text]", at: message.at, recipient: source.recipient ?? null, replyTo: source.replyTo ?? null, runId: source.sourceRun ?? (source.requestId ? room.turns.find(turn => turn.requestId === source.requestId)?.runId : undefined) ?? null }, projected);
    }
    projected.messages.reverse(); snapshot.truncated ||= projected.truncated;
  }
  return MobileV2SnapshotSchema.parse(snapshot);
}
