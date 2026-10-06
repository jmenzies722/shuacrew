import { expect, it } from "vitest";
import { codexPlan, todoPlan } from "./plan.js";

it("reads Codex's plan notification", () => {
  expect(codexPlan({ threadId: "t", turnId: "u", explanation: "Fix, then prove it", plan: [{ step: "Find the bug", status: "completed" }, { step: "Fix it", status: "inProgress" }, { step: "Run tests", status: "pending" }] }))
    .toEqual({ note: "Fix, then prove it", steps: [{ text: "Find the bug", status: "done" }, { text: "Fix it", status: "active" }, { text: "Run tests", status: "pending" }] });
  expect(codexPlan({ explanation: null, plan: [] })).toEqual({ note: "", steps: [] });
  expect(codexPlan({})).toBeNull();
});

it("reads Claude's TodoWrite list, naming the running step by what it's doing", () => {
  expect(todoPlan({ todos: [{ content: "Run the tests", activeForm: "Running the tests", status: "in_progress" }, { content: "Ship it", activeForm: "Shipping it", status: "pending" }, { content: "  Read  the code ", status: "completed" }] }))
    .toEqual({ steps: [{ text: "Running the tests", status: "active" }, { text: "Ship it", status: "pending" }, { text: "Read the code", status: "done" }] });
  expect(todoPlan({ nope: 1 })).toBeNull();
});

it("Codex's plan notification becomes a plan event", async () => {
  const { CodexTranslator } = await import("./codex.js");
  const out = new CodexTranslator().translate("turn/plan/updated", { threadId: "t", turnId: "u", explanation: null, plan: [{ step: "Fix it", status: "inProgress" }] });
  expect(out).toEqual([{ type: "plan", steps: [{ text: "Fix it", status: "active" }], note: "" }]);
});

it("Claude's TodoWrite becomes a plan event next to the tool call; a subagent's does not", async () => {
  const { ClaudeTranslator } = await import("./claude.js");
  const todo = { type: "tool_use", id: "tw1", name: "TodoWrite", input: { todos: [{ content: "Ship it", status: "pending", activeForm: "Shipping" }] } };
  const main = new ClaudeTranslator().translate({ type: "assistant", parent_tool_use_id: null, message: { content: [todo] } });
  expect(main.map((e) => e.type)).toEqual(["tool-call", "plan"]);
  expect(main[1]).toEqual({ type: "plan", steps: [{ text: "Ship it", status: "pending" }] });
  const sub = new ClaudeTranslator().translate({ type: "assistant", parent_tool_use_id: "task1", message: { content: [todo] } });
  expect(sub.map((e) => e.type)).toEqual(["tool-call"]);
});
