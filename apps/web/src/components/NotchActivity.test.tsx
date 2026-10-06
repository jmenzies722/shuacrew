import { describe, expect, it } from "vitest";
import { doingNow, elapsed } from "./NotchActivity";

describe("notch live activity", () => {
  it("counts like a stopwatch", () => {
    expect(elapsed(0)).toBe("0:00");
    expect(elapsed(134_000)).toBe("2:14");
    expect(elapsed(3_725_000)).toBe("1:02:05");
  });
  it("says what the session is doing in words", () => {
    expect(doingNow({ status: "running", currentTool: "WebSearch", ticker: "" })).toBe("Searching the web");
    expect(doingNow({ status: "running", currentTool: "mcp__github__create_pull_request", ticker: "" })).toBe("create pull request");
    expect(doingNow({ status: "running", ticker: "Comparing three pricing tiers" })).toBe("Comparing three pricing tiers");
    expect(doingNow({ status: "awaiting_approval", currentTool: "Bash", ticker: "" })).toBe("Waiting for your OK");
    expect(doingNow({ status: "planning", ticker: "" })).toBe("Planning");
  });
});
