import { expect, it } from "vitest";
import { WebBridge, validWebCommand } from "./web-bridge.js";

it("hands Spark's command to the waiting extension and returns its answer", async () => {
  const bridge = new WebBridge();
  const polled = bridge.next(1000);
  const answer = bridge.send({ kind: "locate", text: "Sign in" }, 1000);
  const command = await polled;
  expect(command).toMatchObject({ kind: "locate", text: "Sign in" });
  bridge.answer(command!.id, { found: true, name: "Sign in", rect: { x: 0.8, y: 0.05, w: 0.05, h: 0.02 } });
  expect(await answer).toMatchObject({ found: true, name: "Sign in" });
  expect(bridge.connected()).toBe(true);
});
it("queues a command until the extension polls, and gives up cleanly when nobody answers", async () => {
  const bridge = new WebBridge();
  const answer = bridge.send({ kind: "click", text: "Buy" }, 50);
  expect(await answer).toBeNull();
  expect(await bridge.next(10)).toBeNull(); // the expired command was withdrawn, not delivered late
  expect(bridge.connected(Date.now() + 60_000)).toBe(false);
});
it("accepts only the three kinds, with a name, and a value when typing", () => {
  expect(validWebCommand({ kind: "click", text: " Sign in " })).toEqual({ kind: "click", text: "Sign in" });
  expect(validWebCommand({ kind: "type", text: "Email", value: "me@x.com" })).toEqual({ kind: "type", text: "Email", value: "me@x.com" });
  expect(validWebCommand({ kind: "type", text: "Email" })).toBeNull();
  expect(validWebCommand({ kind: "eval", text: "x" })).toBeNull();
  expect(validWebCommand({ kind: "click", text: "" })).toBeNull();
});
