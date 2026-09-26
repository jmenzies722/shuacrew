/**
 * Health alerts: problems worth interrupting you for, computed from real measurements. The menu bar notifies once per
 * new alert and Insights lists them. Each has a stable id so the same problem never nags twice.
 */
export interface HealthInput { rssMb: number; diskFreeGb: number | null; speech: string | null; runtimesOut: string[]; battery: { pct: number; charging: boolean } | null }
export interface HealthAlert { id: string; level: "warn" | "critical"; text: string }

export function healthAlerts(h: HealthInput): HealthAlert[] {
  const out: HealthAlert[] = [];
  if (h.rssMb >= 2500) out.push({ id: "gateway-memory", level: "critical", text: `The gateway is using ${(h.rssMb / 1024).toFixed(1)} GB of memory. Restarting it (pnpm service restart) frees it; your sessions resume.` });
  else if (h.rssMb >= 1500) out.push({ id: "gateway-memory", level: "warn", text: `The gateway is using ${h.rssMb} MB of memory — higher than usual.` });
  if (h.diskFreeGb !== null && h.diskFreeGb < 5) out.push({ id: "disk", level: "critical", text: `Only ${h.diskFreeGb.toFixed(1)} GB free on disk — sessions that build or install may fail.` });
  else if (h.diskFreeGb !== null && h.diskFreeGb < 15) out.push({ id: "disk", level: "warn", text: `${h.diskFreeGb.toFixed(0)} GB free on disk.` });
  if (h.speech === "failed") out.push({ id: "speech", level: "warn", text: "Spark's voice engine failed to start — replies stay text-only until it's reinstalled in Settings → Voice." });
  for (const r of h.runtimesOut) out.push({ id: `runtime-${r}`, level: "warn", text: `Every ${r} model is out of usage right now — work moves to the other runtime until it resets.` });
  if (h.battery && !h.battery.charging && h.battery.pct <= 10) out.push({ id: "battery", level: "warn", text: `Battery at ${h.battery.pct}% — long sessions may stop if the Mac sleeps.` });
  return out;
}
