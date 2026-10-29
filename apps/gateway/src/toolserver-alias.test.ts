import { expect, it } from "vitest";
import { ToolServer } from "./toolserver.js";

// A spare Shua session is opened under its own id; the conversation that adopts it takes over its token, so its
// ShuaCrew tool calls (and approvals) count as that conversation's — never the one the spare was opened after.
it("hands a spare's token to the conversation that adopted it, and leaves every other run's alone", () => {
  const tools = new ToolServer(undefined as never, () => ({}) as never);
  const a = tools.tokenFor("r_a"), spare = tools.tokenFor("r_spare-1");
  tools.alias("r_spare-1", "r_b");
  expect(tools.runFor(`Bearer ${spare}`)).toBe("r_b");
  expect(tools.runFor(`Bearer ${a}`)).toBe("r_a");
  expect(tools.tokenFor("r_spare-1")).not.toBe(spare); // the spare's id has no token any more
  tools.alias("r_nobody", "r_c");                       // nothing to hand over: nothing changes
  expect(tools.runFor(`Bearer ${a}`)).toBe("r_a");
});
