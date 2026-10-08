/**
 * Where you are, so one device speaks: at your desk the Mac speaks and your iPhone stays quiet; out, your iPhone speaks
 * (in the same voice) and the Mac stays quiet. At the desk when the Mac has had keyboard or mouse input in the last
 * five minutes, or your iPhone said it's on the desk (Desk view open) in the last two; out otherwise.
 */
import { execFile } from "node:child_process";
import type { FastifyInstance } from "fastify";

export type Where = "desk" | "out";
export interface PresenceView { where: Where; macIdle: number | null; phoneDesk: boolean; why: string }

const ACTIVE = 5 * 60, PHONE_TTL = 2 * 60_000;

/** Seconds since the Mac's last keyboard or mouse input (IOHIDSystem's HIDIdleTime), or null where it can't be read. */
export function readMacIdle(): Promise<number | null> {
  return new Promise((resolve) => {
    execFile("/usr/sbin/ioreg", ["-c", "IOHIDSystem", "-d", "4"], { timeout: 2000 }, (error, out) => {
      const ns = error ? null : /"HIDIdleTime"\s*=\s*(\d+)/.exec(out)?.[1];
      resolve(ns ? Math.round(Number(ns) / 1e9) : null);
    });
  });
}

export class Presence {
  private phone: { desk: boolean; at: number } | null = null;
  private idle: { value: number | null; at: number } | null = null;
  constructor(private macIdle: () => Promise<number | null> = readMacIdle, private now = () => Date.now()) {}

  /** The phone says whether it's sitting on the desk (Desk view open) or not. */
  reportPhone(desk: boolean): void { this.phone = { desk, at: this.now() }; }

  async get(): Promise<PresenceView> {
    if (!this.idle || this.now() - this.idle.at > 3000) this.idle = { value: await this.macIdle(), at: this.now() };
    const idle = this.idle.value, phoneDesk = !!this.phone?.desk && this.now() - this.phone.at < PHONE_TTL;
    if (phoneDesk) return { where: "desk", macIdle: idle, phoneDesk, why: "your iPhone is on the desk" };
    if (idle !== null && idle < ACTIVE) return { where: "desk", macIdle: idle, phoneDesk, why: "you're using the Mac" };
    return { where: "out", macIdle: idle, phoneDesk, why: idle === null ? "the Mac can't tell, so the phone speaks" : `the Mac has been idle for ${Math.round(idle / 60)} min` };
  }
}

export function registerPresence(app: FastifyInstance, presence = new Presence()) {
  app.get("/api/presence", async () => presence.get());
  app.post<{ Body: { desk?: unknown } }>("/api/presence/phone", async (request, reply) => {
    if (typeof request.body?.desk !== "boolean") return reply.code(400).send({ error: "Say whether the phone is on the desk." });
    presence.reportPhone(request.body.desk);
    return presence.get();
  });
  return presence;
}
