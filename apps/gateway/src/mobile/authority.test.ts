import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { signingBytes } from "@shuacrew/core/mobile";
import { MockRuntime, type RunContext, type RunSpec, type RuntimeEvent } from "@shuacrew/runtimes";
import { EventStore } from "../store.js";
import { Supervisor } from "../runs.js";
import { Crew } from "../crew.js";
import { RoomCoordinator } from "../rooms.js";
import { MobileAuthority } from "./authority.js";

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach(f => f()));
function world() {
  const store = new EventStore(":memory:"), crew = new Crew(store);
  const runtime = Object.assign(new MockRuntime(), { id: "codex", async *start(_spec: RunSpec, ctx: RunContext): AsyncIterable<RuntimeEvent> {
    const answer = await ctx.approve("Bash", { command: "fixture_public_command" });
    yield { type: "done", text: answer.allow ? "allowed" : "denied" };
  } });
  const runtimes = new Map([["codex", runtime]]);
  crew.set({ id: "shua", name: "Shua", role: "Coordinator", persona: "Public fixture", runtime: "codex", delegatable: true, color: "#fff", emoji: "", triggers: [] });
  const supervisor = new Supervisor(store, runtimes, { workspace: mkdtempSync(path.join(os.tmpdir(), "shua-mobile-")), roots: [], crew });
  const rooms = new RoomCoordinator(store, supervisor, crew, runtimes);
  const room = rooms.create({ title: "Selected", coordinator: "shua", members: ["shua"] });
  const options = { installationId: "mac_1" };
  const authority = new MobileAuthority(store, supervisor, rooms, options);
  const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = pair.publicKey.export({ format: "jwk" });
  const publicKey = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x!, "base64url"), Buffer.from(jwk.y!, "base64url")]).toString("base64url");
  const device = { id: "phone_1", name: "My phone", kind: "phone" as const, publicKey };
  const signed = (action: object, commandId = "cmd_1", overrides: object = {}) => {
    const payload = JSON.stringify({ version: 1, installationId: "mac_1", deviceId: "phone_1", commandId, issuedAt: 1000, expiresAt: 2000, action, ...overrides });
    return { payload, signature: sign("sha256", signingBytes(payload), { key: pair.privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url") };
  };
  cleanup.push(() => { rooms.close(); supervisor.shutdown(); crew.stop(); store.close(); });
  const enable = () => { authority.configure({ enabled: true, roomIds: [room.id] }); authority.pair(device); };
  return { store, supervisor, rooms, room, authority, options, device, signed, enable };
}
it("is off by default and validates signatures before recording commands", () => {
  const w = world();
  expect(() => w.authority.receive(w.signed({ kind: "refresh" }), 1500)).toThrow();
  w.enable(); const envelope = w.signed({ kind: "refresh" });
  const head = w.store.head;
  expect(() => w.authority.receive({ ...envelope, payload: envelope.payload + " " }, 1500)).toThrow();
  expect(w.store.head).toBe(head);
  expect(w.authority.receive(envelope, 1500)).toMatchObject({ state: "applied", reason: "snapshot-requested" });
});
it("rejects redaction-sensitive command identities before any durable receipt or action", () => {
  const w = world(); w.enable();
  const head = w.store.head;
  const envelope = w.signed({ kind: "room-pause", roomId: w.room.id, paused: true }, "sk-1234567890123456789012345");
  expect(() => w.authority.receive(envelope, 1500)).toThrow();
  expect(w.store.head).toBe(head);
  expect(w.rooms.get(w.room.id)!.paused).toBe(false);
});
it("does not pair a device whose identity would change in durable storage", () => {
  const w = world(); w.authority.configure({ enabled: true, roomIds: [w.room.id] });
  const head = w.store.head;
  expect(() => w.authority.pair({ ...w.device, id: "sk-1234567890123456789012345" })).toThrow();
  expect(w.store.head).toBe(head);
  expect(w.authority.devices()).toEqual([]);
});
it("rejects unstable installation identity before it can issue an offer", () => {
  const w = world();
  expect(() => new MobileAuthority(w.store, w.supervisor, w.rooms, { installationId: "sk-1234567890123456789012345" })).toThrow();
});
it("a new Mac installation does not inherit enabled sync or paired devices", () => {
  const w = world(); w.enable();
  const next = new MobileAuthority(w.store, w.supervisor, w.rooms, { installationId: "new_mac" });
  expect(next.config()).toEqual({ enabled: false, roomIds: [] });
  expect(next.devices()).toEqual([]);
  expect(() => next.receive(w.signed({ kind: "refresh" }), 1500)).toThrow();
  expect(w.authority.devices()).toHaveLength(1);
});
it("decides a specific live offer once and rejects conflicting replays", async () => {
  const w = world(); w.enable();
  w.rooms.send(w.room.id, "00000000-0000-4000-8000-000000000001", "Public fixture");
  await vi.waitFor(() => expect(w.supervisor.pendingApprovals()).toHaveLength(1));
  const offer = w.authority.offers(w.device.id, 1000)[0]!;
  expect(offer).toMatchObject({ requiresPhone: true, deviceId: w.device.id });
  const envelope = w.signed({ kind: "approval", offer, allow: true });
  const ack = w.authority.receive(envelope, 1500);
  expect(ack).toMatchObject({ state: "applied", reason: "decision-recorded" });
  expect(w.authority.receive(envelope, 1500)).toEqual(ack);
  expect(w.authority.receive(w.signed({ kind: "approval", offer, allow: false }), 1500).state).toBe("rejected");
  expect(w.store.ofKinds("approval.decided")).toHaveLength(1);
});
it("rejects expired, forged, revoked and no-longer-live offers without side effects", async () => {
  const w = world(); w.enable();
  w.rooms.send(w.room.id, "00000000-0000-4000-8000-000000000002", "Public fixture");
  await vi.waitFor(() => expect(w.supervisor.pendingApprovals()).toHaveLength(1));
  const offer = w.authority.offers(w.device.id, 1000)[0]!;
  expect(w.authority.receive(w.signed({ kind: "approval", offer, allow: true }), 2000).state).toBe("expired");
  expect(w.authority.receive(w.signed({ kind: "approval", offer: { ...offer, nonce: "forged" }, allow: true }, "cmd_2"), 1500).state).toBe("rejected");
  expect(w.store.ofKinds("approval.decided")).toHaveLength(0);
  w.authority.revoke(w.device.id);
  expect(() => w.authority.receive(w.signed({ kind: "approval", offer, allow: true }, "cmd_3"), 1500)).toThrow();
  expect(w.store.ofKinds("approval.decided")).toHaveLength(0);
});
it("recovers a recorded decision after ack storage failure without repeating it", async () => {
  const w = world(); w.enable();
  w.rooms.send(w.room.id, "00000000-0000-4000-8000-000000000003", "Public fixture");
  await vi.waitFor(() => expect(w.supervisor.pendingApprovals()).toHaveLength(1));
  const offer = w.authority.offers(w.device.id, 1000)[0]!;
  const envelope = w.signed({ kind: "approval", offer, allow: true });
  const append = w.store.append.bind(w.store);
  const spy = vi.spyOn(w.store, "append").mockImplementation((kind, body, where) => {
    if (kind === "mobile.ack") throw new Error("ack disk failure");
    return append(kind, body, where);
  });
  expect(() => w.authority.receive(envelope, 1500)).toThrow("ack disk failure");
  spy.mockRestore();
  const next = new MobileAuthority(w.store, w.supervisor, w.rooms, w.options);
  next.recover(1600);
  expect(next.receive(envelope, 1600)).toMatchObject({ state: "applied", reason: "decision-recorded" });
  expect(w.store.ofKinds("approval.decided")).toHaveLength(1);
});
it("restricts room commands to locally selected rooms and preserves replay identity", () => {
  const w = world(); w.enable();
  const other = w.rooms.create({ title: "Private", coordinator: "shua", members: ["shua"] });
  expect(w.authority.receive(w.signed({ kind: "room-pause", roomId: other.id, paused: true }), 1500).state).toBe("rejected");
  expect(w.rooms.get(other.id)!.paused).toBe(false);
  const envelope = w.signed({ kind: "room-pause", roomId: w.room.id, paused: true }, "cmd_2");
  expect(w.authority.receive(envelope, 1500).state).toBe("applied");
  expect(w.authority.receive(envelope, 1600).state).toBe("applied");
  expect(w.store.ofKinds("room.paused")).toHaveLength(1);
});
it("rejects a signed offer whose provider waiter ended during gateway shutdown", async () => {
  const w = world(); w.enable();
  w.rooms.send(w.room.id, "00000000-0000-4000-8000-000000000004", "Public fixture");
  await vi.waitFor(() => expect(w.supervisor.pendingApprovals()).toHaveLength(1));
  const offer = w.authority.offers(w.device.id, 1000)[0]!;
  w.supervisor.shutdown();
  expect(w.authority.receive(w.signed({ kind: "approval", offer, allow: true }), 1500)).toMatchObject({ state: "rejected", reason: "approval-no-longer-live" });
  expect(w.store.ofKinds("approval.decided")).toHaveLength(0);
});
it("does not report stop-recorded when a halted supervisor cannot persist cancellation", async () => {
  const w = world(); w.enable();
  const run = w.rooms.send(w.room.id, "00000000-0000-4000-8000-000000000005", "Public fixture");
  await vi.waitFor(() => expect(w.supervisor.pendingApprovals()).toHaveLength(1));
  w.supervisor.shutdown();
  expect(w.authority.receive(w.signed({ kind: "run-stop", runId: run.runId }), 1500)).toMatchObject({ state: "uncertain", reason: "inspect-on-mac" });
});
it("records a signed room message once and never starts work when receipt persistence fails", () => {
  const w = world(); w.enable();
  const envelope = w.signed({ kind: "room-message", roomId: w.room.id, text: "Public mobile message" });
  const append = w.store.append.bind(w.store);
  const spy = vi.spyOn(w.store, "append").mockImplementation((kind, body, where) => {
    if (kind === "mobile.received") throw new Error("receipt unavailable");
    return append(kind, body, where);
  });
  expect(() => w.authority.receive(envelope, 1500)).toThrow("receipt unavailable");
  expect(w.store.ofKinds("room.turn")).toHaveLength(0);
  spy.mockRestore();
  const ack = w.authority.receive(envelope, 1500);
  expect(ack).toMatchObject({ state: "applied", reason: "message-recorded" });
  expect(w.authority.receive(envelope, 1600)).toEqual(ack);
  expect(w.store.ofKinds("room.turn")).toHaveLength(1);
  expect(w.store.ofKinds("room.message")).toHaveLength(1);
  const next = new MobileAuthority(w.store, w.supervisor, w.rooms, w.options);
  expect(next.receive(envelope, 1600)).toEqual(ack);
});
it("binds the original Watch signer rather than trusting its phone relay", () => {
  const w = world(); w.enable();
  const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), jwk = pair.publicKey.export({ format: "jwk" });
  const publicKey = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x!, "base64url"), Buffer.from(jwk.y!, "base64url")]).toString("base64url");
  w.authority.pair({ id: "watch_1", name: "Watch", kind: "watch", publicKey });
  const relabeledPhone = w.signed({ kind: "refresh" }, "cmd_watch", { deviceId: "watch_1" });
  expect(() => w.authority.receive(relabeledPhone, 1500)).toThrow("Wrong command audience");
  const originalWatch = { payload: relabeledPhone.payload, signature: sign("sha256", signingBytes(relabeledPhone.payload), { key: pair.privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url") };
  expect(w.authority.receive(originalWatch, 1500)).toMatchObject({ state: "applied", deviceId: "watch_1" });
  w.authority.revoke("watch_1");
  expect(() => w.authority.receive(originalWatch, 1600)).toThrow("Unpaired or invalid signature");
});
it("rejects wrong-installation and schema-expanded signed commands before recording receipt", () => {
  const w = world(); w.enable(); const head = w.store.head;
  expect(() => w.authority.receive(w.signed({ kind: "refresh" }, "cmd_1", { installationId: "other_mac" }), 1500)).toThrow("Wrong command audience");
  expect(() => w.authority.receive(w.signed({ kind: "refresh", always: true }), 1500)).toThrow();
  expect(w.store.head).toBe(head);
});
