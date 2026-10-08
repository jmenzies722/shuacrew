import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { phoneAllowed } from "./phone-door.js";
import { Presence, readMacIdle, registerPresence } from "./presence.js";

describe("presence: one device speaks", () => {
  it("is at the desk while you use the Mac, out once it's been idle five minutes", async () => {
    let idle: number | null = 30, now = 0;
    const p = new Presence(async () => idle, () => now);
    expect((await p.get()).where).toBe("desk");
    idle = 6 * 60; now += 5000;
    expect(await p.get()).toMatchObject({ where: "out", why: "the Mac has been idle for 6 min" });
    idle = null; now += 5000;
    expect((await p.get()).where).toBe("out"); // can't tell: the phone speaks rather than nobody
  });

  it("counts your iPhone in Desk view as the desk, for two minutes after it last said so", async () => {
    let now = 0;
    const p = new Presence(async () => 3600, () => now);
    p.reportPhone(true);
    expect(await p.get()).toMatchObject({ where: "desk", phoneDesk: true });
    now += 3 * 60_000;
    expect((await p.get()).where).toBe("out");
    p.reportPhone(false);
    expect((await p.get()).where).toBe("out");
  });

  it("serves it on the gateway and through the phone door", async () => {
    const app = Fastify(); registerPresence(app, new Presence(async () => 10));
    expect((await app.inject({ method: "GET", url: "/api/presence" })).json()).toMatchObject({ where: "desk" });
    expect((await app.inject({ method: "POST", url: "/api/presence/phone", payload: { desk: "yes" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/api/presence/phone", payload: { desk: true } })).json()).toMatchObject({ phoneDesk: true });
    expect(phoneAllowed("GET", "/api/presence")).toBe(true);
    expect(phoneAllowed("POST", "/api/presence/phone")).toBe(true);
  });

  it("reads the Mac's idle time", async () => {
    const idle = await readMacIdle();
    expect(idle === null || (Number.isInteger(idle) && idle >= 0)).toBe(true);
  });
});
