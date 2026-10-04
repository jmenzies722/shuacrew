import { expect, it } from "vitest";
import { applyTeachingReview } from "./workflow-teaching.js";
const field = { role: "AXTextField", identifier: "entry", label: "Name" };
const steps = [{ id: "focus", app: "test", operation: "focus" as const, target: field }, { id: "input", app: "test", operation: "input" as const, target: field, parameter: "input_1" }];
it("allows only redundant focus removal and retains input/checkpoint evidence", () => {
  expect(applyTeachingReview(steps, ["focus"])).toEqual([steps[1]!]);
  expect(() => applyTeachingReview(steps, ["input"])).toThrow();
  expect(() => applyTeachingReview(steps, ["invented"])).toThrow();
  expect(() => applyTeachingReview([...steps].reverse(), ["focus"])).toThrow();
  expect(() => applyTeachingReview([steps[0]!, { ...steps[1]!, app: "other" }], ["focus"])).toThrow();
  expect(applyTeachingReview(steps, [])).toEqual(steps);
});
it("preserves new-window guards even on otherwise redundant focus", () => {
  expect(() => applyTeachingReview([{ ...steps[0]!, newWindow: true }, steps[1]!], ["focus"])).toThrow();
});
it("does not fall back to another provider when Codex is disconnected", async () => {
  const Fastify = (await import("fastify")).default;
  const { workflowTeachingRoutes } = await import("./workflow-teaching-routes.js");
  const app = Fastify(); workflowTeachingRoutes(app, { home: "/private/tmp", runtimes: new Map() });
  try {
    const response = await app.inject({ method: "POST", url: "/api/workflows/teach", payload: { name: "Note", steps, feedback: "Keep my documents", priorLessons: [], successes: 0, failures: 0 } });
    expect(response.statusCode).toBe(400); expect(response.json().error).toContain("Connect ChatGPT/Codex");
  } finally { await app.close(); }
});
