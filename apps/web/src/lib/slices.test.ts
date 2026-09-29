import { expect, it } from "vitest";
import { slicesFor } from "./slices";

it("streaming touches no shared slice; real changes touch only their own", () => {
  expect([...slicesFor(["agent.delta", "agent.delta", "tool.called", "turn.started"])]).toEqual([]);
  expect([...slicesFor(["run.created"])].sort()).toEqual(["members", "today"]);
  expect([...slicesFor(["room.message", "approval.requested", "usage.recorded"])].sort()).toEqual(["approvals", "rooms", "today"]);
});
