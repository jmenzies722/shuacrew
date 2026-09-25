import { expect, it } from "vitest";
import { parseBody, type AnyEvent, type Kind } from "./events.js";
import { AssignmentInputSchema, RoomInputSchema, foldRooms } from "./rooms.js";
import { apply, emptyState } from "./projections.js";

const requestId = "11111111-1111-4111-8111-111111111111";
function event(seq: number, kind: Kind, body: unknown): AnyEvent {
  return { seq, kind, body: parseBody(kind, body), at: seq * 1000, run: null, session: null, hash: "", prev: "" } as AnyEvent;
}
const created = () => event(1, "room.created", { id: "room1", title: "Launch", coordinator: "shua", members: ["shua", "eli"] });
it("replays room authorship and assignment lifecycle without duplicated messages", () => {
  const events = [created(),
    event(2, "room.turn", { room: "room1", requestId, runId: "root", memberId: "shua" }),
    event(3, "room.message", { room: "room1", id: "m1", author: "you", text: "Review this", requestId }),
    event(4, "room.message", { room: "room1", id: "m2", author: "shua", text: "Delegating", sourceRun: "root" }),
    event(5, "room.assignment.requested", { room: "room1", id: "a1", rootRequest: requestId, requestId, sourceRun: "root", memberId: "eli", runId: "child", task: "Review", depth: 1 }),
    event(6, "room.assignment.started", { room: "room1", id: "a1" }),
    event(7, "room.assignment.completed", { room: "room1", id: "a1", output: "Checked", artifacts: [] }),
    event(8, "room.message", { room: "room1", id: "m3", author: "eli", text: "Checked", sourceRun: "child", assignmentId: "a1" }),
    event(9, "room.paused", { room: "room1", paused: true }),
    event(10, "room.message", { room: "room1", id: "m1", author: "you", text: "Review this", requestId }),
  ];
  const state = foldRooms(events);
  expect(state.rooms.room1!.messages.map(m => m.author)).toEqual(["you", "shua", "eli"]);
  expect(state.rooms.room1!.assignments.a1!.status).toBe("done");
  expect(state.rooms.room1!.paused).toBe(true);
  expect(foldRooms([...events, ...events])).toEqual(state);
  const live = emptyState(); events.forEach(e => apply(live, e));
  expect(live.rooms).toEqual(state.rooms);
});
it("rejects malformed requests, duplicate members and recursive assignments", () => {
  for (const input of [{ requestId: "bad", memberId: "eli", task: "Review" }, { requestId, memberId: "../eli", task: "Review" }, { requestId, memberId: "eli", task: " " }]) expect(() => AssignmentInputSchema.parse(input)).toThrow();
  expect(() => RoomInputSchema.parse({ title: "Room", coordinator: "shua", members: ["eli", "eli"] })).toThrow();
  expect(() => parseBody("room.assignment.requested", { room: "room1", id: "a1", rootRequest: requestId, requestId, sourceRun: "root", memberId: "eli", runId: "child", task: "Review", depth: 2 })).toThrow();
});
it("does not resurrect a terminal assignment with stale starts or duplicate requests", () => {
  const assignment = { room: "room1", id: "a1", rootRequest: requestId, requestId, sourceRun: "root", memberId: "eli", runId: "child", task: "Review", depth: 1 };
  const state = foldRooms([created(), event(2, "room.assignment.requested", assignment), event(3, "room.assignment.failed", { room: "room1", id: "a1", reason: "Interrupted" }), event(4, "room.assignment.started", { room: "room1", id: "a1" }), event(5, "room.assignment.requested", { ...assignment, id: "a2" })]);
  expect(Object.keys(state.rooms.room1!.assignments)).toEqual(["a1"]);
  expect(state.rooms.room1!.assignments.a1).toMatchObject({ status: "failed", reason: "Interrupted" });
});
