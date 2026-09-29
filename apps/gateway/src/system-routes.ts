import { execFile } from "node:child_process";
import { statfs } from "node:fs/promises";
import os from "node:os";
import type { FastifyInstance } from "fastify";

export interface Battery { pct: number; charging: boolean; source: "ac" | "battery"; remaining: string | null }

/** `pmset -g batt` → percentage, charging and time left; null on Macs without a battery. */
export function parseBattery(text: string): Battery | null {
  const pct = /(\d{1,3})%/.exec(text);
  if (!pct) return null;
  const state = /%;\s*([a-z ]+);/i.exec(text)?.[1]?.trim().toLowerCase() ?? "";
  const left = /(\d+:\d{2}) remaining/.exec(text)?.[1] ?? null;
  return { pct: Math.min(100, Number(pct[1])), charging: state === "charging" || state === "charged" || state === "finishing charge", source: /AC Power/.test(text) ? "ac" : "battery", remaining: left };
}

const battery = (): Promise<Battery | null> => new Promise((resolve) => {
  if (process.platform !== "darwin") { resolve(null); return; }
  execFile("/usr/bin/pmset", ["-g", "batt"], { timeout: 3000 }, (err, out) => resolve(err ? null : parseBattery(out)));
});

/** This Mac at a glance for the System widget: load, memory, disk, battery. Read-only, local only. */
export function systemRoutes(app: FastifyInstance, home = os.homedir()) {
  let cached: { at: number; body: unknown } | null = null;
  app.get("/api/system", async () => {
    if (cached && Date.now() - cached.at < 5000) return cached.body;
    const cores = os.cpus().length || 1, [l1, l5] = os.loadavg();
    const fs = await statfs(home).catch(() => null);
    const body = {
      cpu: Math.min(100, Math.round(((l1 ?? 0) / cores) * 100)), load: [l1, l5].map((n) => Math.round((n ?? 0) * 100) / 100), cores,
      memory: { used: os.totalmem() - os.freemem(), total: os.totalmem() },
      disk: fs ? { free: fs.bavail * fs.bsize, total: fs.blocks * fs.bsize } : null,
      battery: await battery(),
      uptime: Math.round(os.uptime()), host: os.hostname().replace(/\.local$/, ""),
    };
    cached = { at: Date.now(), body };
    return body;
  });
}
