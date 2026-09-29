import { expect, it } from "vitest";
import { compactForWatch } from "./watch-projection.js";
import type { MobileSnapshot } from "@shuacrew/core/mobile";

it("bounds the Watch transport without changing approval offers or inventing observations", () => {
  const snapshot: MobileSnapshot = { version: 1, installationId: "mac", deviceId: "watch", sequence: 42, observedAt: 1000,
    rooms: Array.from({ length: 20 }, (_, i) => ({ id: `room_${i}`, title: "Room", paused: false, truncated: false, messages: [{ id: `message_${i}`, author: "Shua", text: "private conversation", at: 900 }] })),
    runs: Array.from({ length: 30 }, (_, i) => ({ id: `run_${i}`, roomId: "room_0", title: "Task", status: "running", summary: "🙂".repeat(1000) })),
    offers: Array.from({ length: 10 }, (_, i) => ({ version: 1, installationId: "mac", deviceId: "watch", offerId: `offer_${i}`, runId: "run_0", approvalId: `approval_${i}`, tool: "Bash", inputDigest: "a".repeat(64), summary: "Exact request ".repeat(140), nonce: `nonce_${i}`, issuedAt: 1000, expiresAt: 2000, requiresPhone: false })),
    usage: { inputTokens: 12, outputTokens: 3, cacheTokens: 0, records: 1, costUsd: null }, truncated: false };
  const watch = compactForWatch(snapshot);
  expect(Buffer.byteLength(JSON.stringify(watch))).toBeLessThanOrEqual(8000);
  expect(watch.sequence).toBe(42);
  expect(watch.observedAt).toBe(1000);
  expect(watch.usage.costUsd).toBeNull();
  expect(watch.truncated).toBe(true);
  expect(watch.rooms.every(room => room.messages.length === 0 && room.truncated)).toBe(true);
  expect(watch.offers.length).toBeGreaterThan(0);
  for (const offer of watch.offers) expect(offer).toEqual(snapshot.offers.find(original => original.offerId === offer.offerId));
  expect(snapshot.rooms[0]!.messages).toHaveLength(1);
});
