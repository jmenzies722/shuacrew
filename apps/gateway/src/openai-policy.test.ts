import { expect, it } from "vitest";
import { subscriptionRuntimeIds } from "./openai-policy.js";
it("registers both crew providers while respecting disabled connections", () => {
 expect(subscriptionRuntimeIds({})).toEqual(["codex","claude"]);
 expect(subscriptionRuntimeIds({claude:{enabled:false}})).toEqual(["codex"]);
 expect(subscriptionRuntimeIds({codex:{enabled:false}})).toEqual(["claude"]);
 expect(subscriptionRuntimeIds({},true)).toEqual(["codex","claude","mock"]);
});

it("maps legacy teaching defaults to an available Codex model", async () => {
  const { codexTeachingModel } = await import("./openai-policy.js");
  const models = [{ id: "connected-model", tier: "balanced" }, { id: "quick-model", tier: "fast" }];
  expect(codexTeachingModel("claude-haiku-4-5", models)).toBe("quick-model");
  expect(codexTeachingModel("connected-model", models)).toBe("connected-model");
  expect(() => codexTeachingModel("", [])).toThrow("Codex");
});
