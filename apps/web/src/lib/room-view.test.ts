import { expect, it } from "vitest";
import { foldRooms } from "@shuacrew/core/rooms";
import { emptyState, apply } from "@shuacrew/core/projections";
import { parseBody, type AnyEvent, type Kind } from "@shuacrew/core/events";
import { workspaceView, selectRooms, roomResults } from "./room-view";
it("keeps result provenance and never equates completed output with verification", () => {
  const state = emptyState();
  const event = (seq: number, kind: Kind, body: unknown, run: string | null = null) => ({ seq, kind, body: parseBody(kind, body), run, at: 1000, prev: "", hash: "", session: null }) as AnyEvent;
  const events = [event(1, "room.created", { id: "room", title: "Test", coordinator: "shua", members: ["shua"] }), event(2, "room.message", { room: "room", id: "result", author: "shua", text: "Partial answer", sourceRun: "root" }), event(3, "run.created", { title: "Plan", ask: "Plan", runtime: "claude", member: "shua" }, "root"), event(4, "run.status", { status: "failed" }, "root")];
  events.forEach(e => apply(state, e)); const room = state.rooms.room!;
  room.messages[0]!.id = "result_root_1";
  room.messages.push({ ...room.messages[0]!, id: "msg_progress", text: "Still working" });
  expect(roomResults(room, state.runs)).toHaveLength(1);
  expect(roomResults(room, state.runs)[0]).toMatchObject({ status: "partial", verification: "not-recorded", runId: "root" });
  apply(state, event(5, "check.ran", { command: "check", exitCode: 1 }, "root"));
  expect(roomResults(room, state.runs)[0]).toMatchObject({ status: "partial", verification: "recorded" });
  delete state.runs.root;
  expect(roomResults(room, state.runs)[0]).toMatchObject({ status: "unavailable", verification: "unavailable" });
});
it("keeps a stable empty selection for snapshots from before rooms existed", () => {
  expect(selectRooms({})).toBe(selectRooms({}));
  expect(selectRooms({})).toEqual({});
});
it("shows actual parent-child states, approvals and disconnected status without fake progress", () => {
  const event = (seq: number, kind: Kind, body: unknown, run: string | null = null) => ({ seq, kind, body: parseBody(kind, body), run, at: 1000, prev: "", hash: "", session: null }) as AnyEvent;
  const requestId = "11111111-1111-4111-8111-111111111111";
  const events = [event(1, "room.created", { id: "room", title: "Test", coordinator: "shua", members: ["shua", "eli"] }), event(2, "room.turn", { room: "room", requestId, runId: "root", memberId: "shua" }), event(3, "run.created", { title: "Plan", ask: "Plan", runtime: "claude", member: "shua" }, "root"), event(4, "room.assignment.requested", { room: "room", id: "a1", rootRequest: requestId, requestId, sourceRun: "root", memberId: "eli", runId: "child", task: "Review", depth: 1 }), event(5, "run.created", { title: "Review", ask: "Review", runtime: "codex", member: "eli", parent: "root" }, "child"), event(6, "run.status", { status: "awaiting_approval" }, "child")];
  const room = foldRooms(events).rooms.room!, state = emptyState(); events.forEach(e => apply(state, e));
  expect(workspaceView(room, state.runs, "live").edges).toEqual([{ from: "root", to: "child" }]);
  expect(workspaceView(room, state.runs, "live").agents.map(a => a.state)).toEqual(["queued", "needs approval"]);
  expect(workspaceView(room, state.runs, "offline").agents.map(a => a.state)).toEqual(["disconnected", "disconnected"]);
  expect(workspaceView(room, state.runs, "live").agents[1]).not.toHaveProperty("percent");
  expect(workspaceView(room, state.runs, "live").counts).toEqual({ working: 0, waiting: 2, complete: 0 });
  expect(workspaceView(room, state.runs, "offline").counts).toEqual({ working: 0, waiting: 0, complete: 0 });
  delete state.runs.root;
  expect(workspaceView(room, state.runs, "live").agents[0]?.state).toBe("history unavailable");
  room.turns.push({ room: room.id, requestId: "22222222-2222-4222-8222-222222222222", runId: "next", memberId: "shua" });
  expect(workspaceView(room, state.runs, "live", requestId).edges).toEqual([{ from: "root", to: "child" }]);
  expect(workspaceView(room, state.runs, "live", "unknown").agents[0]?.runId).toBe("next");
});

it("hides archived rooms and keeps a stable reference", () => {
  const rooms = { a: { id: "a", archived: true }, b: { id: "b" } } as never;
  const first = selectRooms({ rooms }), second = selectRooms({ rooms });
  expect(Object.keys(first)).toEqual(["b"]);
  expect(second).toBe(first);
});
