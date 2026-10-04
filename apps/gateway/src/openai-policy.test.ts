import { expect, it } from "vitest";
import { subscriptionRuntimeIds } from "./openai-policy.js";
it("registers Claude and Codex, and nothing else, whatever legacy config says", () => {
  expect(subscriptionRuntimeIds({})).toEqual(["claude", "codex"]);
  expect(subscriptionRuntimeIds({ claude: { enabled: true }, local: { enabled: true }, acp: [{ id: "other" }] })).toEqual(["claude", "codex"]);
  expect(subscriptionRuntimeIds({ codex: { enabled: false } })).toEqual(["claude"]);
  expect(subscriptionRuntimeIds({ claude: { enabled: false } })).toEqual(["codex"]);
  expect(subscriptionRuntimeIds({}, true)).toEqual(["claude", "codex", "mock"]);
});

it("maps legacy teaching defaults to an available Codex model", async () => {
  const { codexTeachingModel } = await import("./openai-policy.js");
  const models = [{ id: "connected-model", tier: "balanced" }, { id: "quick-model", tier: "fast" }];
  expect(codexTeachingModel("claude-haiku-4-5", models)).toBe("quick-model");
  expect(codexTeachingModel("connected-model", models)).toBe("connected-model");
  expect(() => codexTeachingModel("", [])).toThrow("Codex");
});
