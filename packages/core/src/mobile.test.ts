import { expect, it } from "vitest";
import { MobileCommandSchema, MobileSnapshotSchema, decodeEnvelope, decodeSnapshotEnvelope, parseStrictJSON, signingBytes, ApprovalOfferSchema } from "./mobile.js";
const command = { version: 1, commandId: "cmd_1", deviceId: "phone_1", installationId: "mac_1", issuedAt: 1000, expiresAt: 2000, action: { kind: "refresh" } };
it("allows bounded signed snapshots without expanding command envelope limits", () => {
  const envelope = { payload: "x".repeat(20000), signature: "A".repeat(86) };
  expect(() => decodeEnvelope(envelope)).toThrow();
  expect(decodeSnapshotEnvelope(JSON.stringify(envelope))).toEqual(envelope);
  expect(() => decodeSnapshotEnvelope({ ...envelope, payload: "x".repeat(524289) })).toThrow();
});
it("validates bounded snapshots without inventing unknown cost or accepting raw tool data", () => {
  const snapshot = { version: 1, installationId: "mac_1", deviceId: "phone_1", sequence: 7, observedAt: 1000, rooms: [], runs: [], offers: [], usage: { inputTokens: 12, outputTokens: 3, cacheTokens: 0, records: 1, costUsd: null }, truncated: false };
  expect(MobileSnapshotSchema.parse(snapshot)).toEqual(snapshot);
  for (const bad of [{ ...snapshot, rawLog: [] }, { ...snapshot, sequence: 1.5 }, { ...snapshot, usage: { ...snapshot.usage, costUsd: -1 } }, { ...snapshot, rooms: Array(51).fill({ id: "room", title: "Room", paused: false, messages: [], truncated: false }) }]) expect(() => MobileSnapshotSchema.parse(bad)).toThrow();
});
it("rejects unpaired Unicode surrogates rather than signing replacement characters", () => {
  expect(() => parseStrictJSON('"\\ud800"')).toThrow();
  expect(() => decodeEnvelope({ payload: "\ud800", signature: "A".repeat(86) })).toThrow();
});
it("rejects trailing newlines in wire identities and signatures and overflowing JSON numbers", () => {
  expect(() => MobileCommandSchema.parse({ ...command, commandId: "cmd_1\n" })).toThrow();
  expect(() => decodeEnvelope({ payload: "{}", signature: "A".repeat(86) + "\n" })).toThrow();
  expect(() => parseStrictJSON('{"number":1e309}')).toThrow();
});
it("accepts the closed command vocabulary and rejects authority-expanding fields", () => {
  expect(MobileCommandSchema.parse(command)).toEqual(command);
  for (const body of [{ ...command, always: true }, { ...command, version: 2 }, { ...command, action: { kind: "shell", command: "ls" } }, { ...command, expiresAt: 999 }, { ...command, issuedAt: Number.MAX_SAFE_INTEGER + 1 }]) expect(() => MobileCommandSchema.parse(body)).toThrow();
});
it("rejects duplicate decoded keys at every nesting level and limits recursion", () => {
  for (const text of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"a":{"b":1,"b":2}}', '[{"x":1,"x":2}]', '['.repeat(40) + '0' + ']'.repeat(40)]) expect(() => parseStrictJSON(text)).toThrow();
  expect(parseStrictJSON('{"a":[true,null,"x\\\"y"],"b":-1.25e2}')).toEqual({ a: [true, null, 'x"y'], b: -125 });
});
it("bounds envelope and payload bytes and preserves the exact signed string", () => {
  const payload = JSON.stringify(command), signature = "A".repeat(86);
  expect(decodeEnvelope({ payload, signature }).payload).toBe(payload);
  expect(() => decodeEnvelope({ payload: "é".repeat(9000), signature })).toThrow();
  expect(() => decodeEnvelope({ payload, signature: "a" })).toThrow();
  expect(new TextDecoder().decode(signingBytes(payload))).toBe(`ShuaCrew/mobile/v1\n${payload}`);
});
it("binds offer lifetime, device and installation to an approval command", () => {
  const offer = { version: 1, installationId: "mac_1", deviceId: "phone_1", offerId: "offer_1", runId: "r_1", approvalId: "a_1", tool: "read", inputDigest: "a".repeat(64), summary: "Public file", nonce: "n_1", issuedAt: 1000, expiresAt: 2000, requiresPhone: false };
  expect(ApprovalOfferSchema.parse(offer)).toEqual(offer);
  expect(() => ApprovalOfferSchema.parse({ ...offer, expiresAt: 301001 })).toThrow();
  expect(() => MobileCommandSchema.parse({ ...command, deviceId: "watch_1", action: { kind: "approval", offer, allow: true } })).toThrow();
});
