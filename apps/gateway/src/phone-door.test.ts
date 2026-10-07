import { mkdtempSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MockRuntime, type Runtime } from "@shuacrew/runtimes";
import { afterEach, expect, it } from "vitest";
import { PhoneDoor, phoneAllowed, phonePairingRoutes, tailnetAddress } from "./phone-door.js";
import { Supervisor } from "./runs.js";
import { createServer } from "./server.js";
import { EventStore } from "./store.js";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

async function gateway() {
  const home = mkdtempSync(path.join(os.tmpdir(), "shua-phone-"));
  const store = new EventStore(path.join(home, "shuacrew.db"));
  const runtimes = new Map<string, Runtime>([["mock", new MockRuntime({ pace: 0 })]]);
  const supervisor = new Supervisor(store, runtimes, { workspace: home, roots: [], approvalTimeoutMs: 60_000 });
  const { app, hub } = await createServer({ store, supervisor, runtimes });
  // Port 0: the OS picks a free one, so tests never collide with a running gateway.
  const door = new PhoneDoor({ app, hub, home, port: 0, host: () => "127.0.0.1", every: 60_000 });
  phonePairingRoutes(app, door, home);
  cleanups.push(() => door.close(), () => app.close(), () => store.close());
  return { app, door, home };
}
const ip = (address: string, internal = false) => ({ address, family: "IPv4", internal, netmask: "255.192.0.0", mac: "00:00:00:00:00:00", cidr: null }) as os.NetworkInterfaceInfo;

it("finds the tailnet address and nothing else", () => {
  expect(tailnetAddress({ en0: [ip("192.168.1.20")], utun4: [ip("100.101.7.9")] })).toBe("100.101.7.9");
  expect(tailnetAddress({ en0: [ip("100.20.1.1")] })).toBeUndefined(); // public 100.x, not CGNAT
  expect(tailnetAddress({ en0: [ip("192.168.1.20")], lo0: [ip("127.0.0.1", true)] })).toBeUndefined();
});

it("stays shut until a phone is paired, and slams shut on unpair", async () => {
  const { app, door, home } = await gateway();
  await door.refresh();
  expect(door.address()).toBeUndefined();
  const pair = await app.inject({ method: "POST", url: "/api/phone/pair", headers: { "x-shuacrew": "1" } });
  expect(pair.statusCode).toBe(200);
  const { key, host } = pair.json();
  expect(host).toBe("127.0.0.1");
  expect(statSync(path.join(home, "phone-key")).mode & 0o777).toBe(0o600);
  expect(door.address()).toBeDefined();
  expect((await app.inject({ method: "POST", url: "/api/phone/pair", headers: { "x-shuacrew": "1", origin: "https://evil.example" } })).statusCode).toBe(403);
  expect(key.length).toBeGreaterThanOrEqual(32);
  await app.inject({ method: "POST", url: "/api/phone/unpair", headers: { "x-shuacrew": "1" } });
  expect(door.address()).toBeUndefined();
});

it("lets in only the key holder, and only to allowed routes", async () => {
  const { app, door } = await gateway();
  const { key } = (await app.inject({ method: "POST", url: "/api/phone/pair", headers: { "x-shuacrew": "1" } })).json();
  const at = door.address()!;
  const base = `http://${at.host}:${at.port}`;
  const call = (url: string, init: RequestInit = {}, k = key) => fetch(base + url, { ...init, headers: { "x-shuacrew-key": k, "content-type": "application/json", ...init.headers } });
  expect((await call("/phone/hello", {}, "nope")).status).toBe(401);
  expect((await call("/phone/hello")).status).toBe(200);
  // The crew's state and deciding approvals: what a pocket companion is for.
  expect((await call("/phone/api/snapshot")).status).toBe(200);
  expect((await call("/phone/api/approvals/q-unknown", { method: "POST", body: JSON.stringify({ allow: true }) })).status).toBe(404); // reached the app; nothing waiting
  // The Mac's settings, files and terminals are not.
  expect((await call("/phone/api/settings", { method: "POST", body: "{}" })).status).toBe(403);
  expect((await call("/phone/api/phone/unpair", { method: "POST", body: "{}" })).status).toBe(403);
});

it("allowlist: reads the crew, decides, starts and follows up; never reconfigures", () => {
  expect(phoneAllowed("GET", "/api/snapshot")).toBe(true);
  expect(phoneAllowed("GET", "/api/activity")).toBe(true);
  expect(phoneAllowed("POST", "/api/approvals/abc123")).toBe(true);
  expect(phoneAllowed("POST", "/api/runs")).toBe(true);
  expect(phoneAllowed("POST", "/api/runs/r_1/followup")).toBe(true);
  expect(phoneAllowed("GET", "/api/runs/r_1/events")).toBe(true);
  expect(phoneAllowed("POST", "/api/runs/r_1/permission")).toBe(false); // flipping a run to auto stays on the Mac
  expect(phoneAllowed("POST", "/api/settings")).toBe(false);
  expect(phoneAllowed("POST", "/api/phone/pair")).toBe(false);
  expect(phoneAllowed("DELETE", "/api/snapshot")).toBe(false);
  expect(phoneAllowed("GET", "/api/runs/../settings")).toBe(false);
});

it("pairs by the Mac's Tailscale name, which iOS allows, when MagicDNS is on", async () => {
  const { dnsNameFrom } = await import("./phone-door.js");
  expect(dnsNameFrom(JSON.stringify({ Self: { DNSName: "Josh-MacBook-Pro.tail322510.ts.net." } }))).toBe("josh-macbook-pro.tail322510.ts.net");
  expect(dnsNameFrom(JSON.stringify({ Self: { DNSName: "" } }))).toBeUndefined();
  expect(dnsNameFrom(JSON.stringify({ Self: { DNSName: "evil.example.com." } }))).toBeUndefined();
  expect(dnsNameFrom("not json")).toBeUndefined();
});
