/** Explicit manual smoke test. Uses the signed-in subscriptions on public fixture text only. */
import { randomUUID } from "node:crypto";
import type { RoomView } from "@shuacrew/core/rooms";
const base = "http://127.0.0.1:7420";
async function api<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(base + url, { method: body === undefined ? "GET" : "POST", headers: { "X-ShuaCrew": "1", "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json(); if (!response.ok) throw new Error(JSON.stringify(data)); return data as T;
}
const suffix = randomUUID().slice(0, 8), coordinator = `verify-coordinator-${suffix}`, reviewer = `verify-reviewer-${suffix}`;
for (const [id, name, runtime, model] of [[coordinator, "Verification coordinator", "claude", "claude-sonnet-5"], [reviewer, "Verification reviewer", "codex", "gpt-5.6-terra"]]) await api("/api/crew", { id, name, role: "Public-text smoke test", persona: "Follow only the public test prompt. Do not browse, read or modify files, execute commands, use external services, or publish anything. Use only ShuaCrew room tools when requested.", runtime, model, delegatable: true, color: "#56d4dd", emoji: "", triggers: [] });
const room = await api<RoomView>("/api/rooms", { title: `Verification · Claude → Codex · ${suffix}`, coordinator, members: [coordinator, reviewer], concurrency: 1 });
let successful = false;
try {
  const requestId = randomUUID();
  const body = { requestId, text: `Use the crew_delegate tool exactly once to assign member ${reviewer} this task: "Review this public sentence for clarity: A calm app that helps people plan a side project. Reply with one short improvement. Do not use any tools." Use requestId ${randomUUID()}. After the tool returns, briefly tell me it was delegated and finish your turn. Do not use any other tools. When results arrive later, name the reviewing member and summarize the result in one sentence.` };
  const root = await api<{ runId: string }>(`/api/rooms/${room.id}/messages`, body);
  const duplicate = await api<{ runId: string }>(`/api/rooms/${room.id}/messages`, body);
  if (root.runId !== duplicate.runId) throw new Error("Duplicate request launched a second run");
  console.log(JSON.stringify({ roomId: room.id, rootRun: root.runId, idempotent: true }));
  for (let i = 0; i < 360; i++) {
    const current = (await api<RoomView[]>("/api/rooms")).find(r => r.id === room.id)!;
    const state = await api<{ runs: Record<string, { status: string; turns: number; pendingApprovals: string[] }> }>("/api/snapshot");
    const assignments = Object.values(current.assignments), run = state.runs[root.runId]!;
    if (i % 20 === 0) console.log(JSON.stringify({ root: run.status, turns: run.turns, assignments: assignments.map(a => ({ id: a.id, run: a.runId, status: a.status })) }));
    if (["failed", "cancelled"].includes(run.status)) throw new Error(`Root ${run.status}`);
    if ([root.runId, ...assignments.map(a => a.runId)].some(id => state.runs[id]?.pendingApprovals.length)) throw new Error("Unexpected approval; smoke test will not grant it");
    if (assignments.length === 1 && assignments[0]!.status === "done" && run.status === "done" && run.turns === 2) {
      console.log(JSON.stringify({ verified: true, roomId: room.id, childRun: assignments[0]!.runId, authors: current.messages.map(m => m.author), output: assignments[0]!.output, summary: current.messages.at(-1)?.text }));
      successful = true; break;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!successful) throw new Error("Room smoke test timed out");
} finally { if (!successful) await api(`/api/rooms/${room.id}/stop`, {}); }
