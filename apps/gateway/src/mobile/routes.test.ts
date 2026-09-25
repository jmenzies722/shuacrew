import { expect, it } from "vitest";
import { EventStore } from "../store.js";
import { Supervisor } from "../runs.js";
import { Crew } from "../crew.js";
import { RoomCoordinator } from "../rooms.js";
import { createServer } from "../server.js";
import { MobileAuthority } from "./authority.js";
import type { MobileRoutesOptions } from "./routes.js";

it("activates native provisioning without restarting and fails closed when removed", async () => {
  const store = new EventStore(":memory:"), runtimes = new Map(), crew = new Crew(store);
  const supervisor = new Supervisor(store, runtimes, { workspace: "/tmp", roots: [] });
  const rooms = new RoomCoordinator(store, supervisor, crew, runtimes);
  let provisioned: MobileRoutesOptions | undefined;
  const { app } = await createServer({ store, runtimes, supervisor, rooms, mobile: () => provisioned });
  const bridgeCredential = "fixture-bridge-credential-32-bytes-long";
  try {
    expect((await app.inject({ url: "/api/mobile/config" })).statusCode).toBe(503);
    provisioned = { authority: new MobileAuthority(store, supervisor, rooms, { installationId: "mac_1" }), bridgeCredential };
    expect((await app.inject({ url: "/api/mobile/config", headers: { "x-shuacrew-mobile-bridge": bridgeCredential } })).json()).toEqual({ enabled: false, roomIds: [] });
    provisioned = undefined;
    expect((await app.inject({ url: "/api/mobile/config", headers: { "x-shuacrew-mobile-bridge": bridgeCredential } })).statusCode).toBe(503);
  } finally { await app.close(); rooms.close(); supervisor.shutdown(); crew.stop(); store.close(); }
});

it("keeps mobile routes loopback-only with a separate bridge credential and strict bodies", async () => {
  const store = new EventStore(":memory:"), runtimes = new Map(), crew = new Crew(store);
  const supervisor = new Supervisor(store, runtimes, { workspace: "/tmp", roots: [] });
  const rooms = new RoomCoordinator(store, supervisor, crew, runtimes);
  const authority = new MobileAuthority(store, supervisor, rooms, { installationId: "mac_1" });
  const bridgeCredential = "fixture-bridge-credential-32-bytes-long";
  const { app } = await createServer({ store, runtimes, supervisor, rooms, mobile: { authority, bridgeCredential } });
  const headers = { "x-shuacrew": "1", "x-shuacrew-mobile-bridge": bridgeCredential, "x-shuacrew-mobile-local-action": "1" };
  try {
    expect((await app.inject({ url: "/api/mobile/config" })).statusCode).toBe(401);
    expect((await app.inject({ url: "/api/mobile/config", headers })).json()).toMatchObject({ enabled: false, roomIds: [] });
    const head = store.head;
    for (const request of [
      { headers: { ...headers, host: "evil.example" } },
      { headers: { ...headers, origin: "https://evil.example" } },
      { headers: { ...headers, "x-shuacrew-mobile-bridge": "wrong" } },
      { headers: { ...headers, "x-shuacrew-mobile-local-action": "0" } },
      { headers, remoteAddress: "192.0.2.1" },
    ]) expect((await app.inject({ method: "POST", url: "/api/mobile/config", payload: { enabled: true, roomIds: [] }, ...request })).statusCode).toBeGreaterThanOrEqual(400);
    expect(store.head).toBe(head);
    expect((await app.inject({ method: "POST", url: "/api/mobile/config", headers, payload: { enabled: true, roomIds: [], always: true } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/api/mobile/config", headers: { ...headers, "content-type": "application/json" }, payload: '{"enabled":false,"enabled":true,"roomIds":[]}' })).statusCode).toBe(400);
    expect(store.head).toBe(head);
    expect((await app.inject({ method: "POST", url: "/api/mobile/commands", headers, payload: { payload: "x".repeat(40000), signature: "A".repeat(86) } })).statusCode).toBe(413);
    expect((await app.inject({ method: "POST", url: "/api/mobile/config", headers, payload: { enabled: true, roomIds: [] } })).statusCode).toBe(200);
    expect(authority.config().enabled).toBe(true);
    store.append("mobile.revoked", { installationId: "mac_1", deviceId: "old_phone" });
    store.append("mobile.revoked", { installationId: "other_mac", deviceId: "private_other" });
    expect((await app.inject({ url: "/api/mobile/revocations/0" })).statusCode).toBe(401);
    const revocations = (await app.inject({ url: "/api/mobile/revocations/0", headers })).json();
    expect(revocations).toEqual([{ deviceId: "old_phone", at: expect.any(Number), sequence: expect.any(Number) }]);
    expect((await app.inject({ url: `/api/mobile/revocations/${revocations[0].sequence}`, headers })).json()).toEqual([]);
    expect((await app.inject({ url: "/api/mobile/revocations/invalid", headers })).statusCode).toBe(400);
  } finally { await app.close(); rooms.close(); supervisor.shutdown(); crew.stop(); store.close(); }
});
