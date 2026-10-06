import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { RunView } from "@shuacrew/core/projections";
import { LiveStrip, toolLine } from "../screens/Sessions";

const base = { id: "r1", title: "Ship it", runtime: "codex", status: "running", ticker: "Reading the routes", toolCalls: 3, files: ["a.ts", "b.ts"], checks: [], subagents: [],
  pendingApprovals: [], usage: { inputTokens: 0, outputTokens: 0, costUsd: null } } as unknown as RunView;

it("shows who is on the session and what they're doing right now", () => {
  const html = renderToStaticMarkup(<LiveStrip run={{ ...base, currentTool: "Read" } as RunView} />);
  expect(html).toContain("is-live"); expect(html).toContain("Codex"); expect(html).toContain("Reading files…");
  expect(html).toContain("3 steps"); expect(html).toContain("2 files");
});

it("falls back to the agent's latest line when no tool is running", () => {
  expect(renderToStaticMarkup(<LiveStrip run={base} />)).toContain("Reading the routes");
});

it("says when the session is waiting on you, and stays out of the way when idle", () => {
  expect(renderToStaticMarkup(<LiveStrip run={{ ...base, status: "awaiting_approval" } as RunView} />)).toContain("Waiting for your OK");
  expect(renderToStaticMarkup(<LiveStrip run={{ ...base, status: "done" } as RunView} />)).toBe("");
});

it("puts tool calls in words", () => {
  expect(toolLine("Bash")).toBe("Running a command…");
  expect(toolLine("apply_patch")).toBe("Editing files…");
  expect(toolLine("mcp__notion__search")).toBe("Using notion · search…");
});
