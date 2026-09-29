import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { MobileCommandSchema, MobileSnapshotSchema, signingBytes } from "./mobile.js";
import { MobileV2CommandSchema, MobileV2SnapshotSchema, signingBytesV2 } from "./mobile-v2.js";
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../../../fixtures/mobile-v2/${name}.json`, import.meta.url), "utf8"));
it("uses literal shared v2 fixtures without weakening the v1 decoder", () => {
  const command = fixture("message"), snapshot = fixture("snapshot");
  expect(MobileV2CommandSchema.parse(command)).toEqual(command);
  expect(MobileV2SnapshotSchema.parse(snapshot)).toEqual(snapshot);
  expect(MobileCommandSchema.safeParse(command).success).toBe(false);
  expect(MobileSnapshotSchema.safeParse(snapshot).success).toBe(false);
  expect(MobileV2CommandSchema.safeParse({ ...command, version: 1 }).success).toBe(false);
  expect(MobileV2SnapshotSchema.safeParse({ ...snapshot, version: 3 }).success).toBe(false);
  expect(signingBytesV2("payload")).not.toEqual(signingBytes("payload"));
});
it("rejects foreign references, excessive UTF-8 and undeclared fields", () => {
  const command = fixture("message"), snapshot = fixture("snapshot");
  expect(MobileV2CommandSchema.safeParse({ ...command, action: { ...command.action, text: "🙂".repeat(2001) } }).success).toBe(false);
  expect(MobileV2CommandSchema.safeParse({ ...command, admin: true }).success).toBe(false);
  snapshot.work[0].roomId = "foreign";
  expect(MobileV2SnapshotSchema.safeParse(snapshot).success).toBe(false);
});
