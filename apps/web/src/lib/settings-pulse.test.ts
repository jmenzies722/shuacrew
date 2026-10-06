import { expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "./appearance";
import { sectionSummary, type Pulse } from "../components/SettingsPulse";

const now = Date.UTC(2026, 9, 6, 12);
const pulse: Pulse = {
  health: { ok: true, build: "1", uptimeS: 7200, service: true, version: "0.1.0" },
  backup: { at: now - 8 * 3_600_000, bytes: 3_000_000 },
  runtimes: [
    { id: "claude", label: "Claude", limitedUntil: null, status: { installed: true, signedIn: true, overridingKeys: [] } },
    { id: "codex", label: "Codex", limitedUntil: now + 60_000, status: { installed: true, signedIn: true, overridingKeys: [] } },
  ],
  schedules: 2,
  updates: null,
};
const input = { pulse, appearance: { ...DEFAULT_APPEARANCE, accent: "coral" as const }, companion: { name: "Shua", placement: "notch" as const, control: "auto" as const }, budget: 500_000, now };

it("says what each section is set to, in one line", () => {
  expect(sectionSummary("appearance", input).text).toBe("Onyx at night, Porcelain by day · Coral");
  expect(sectionSummary("shua", input).text).toBe("Shua lives in your notch · acts on its own");
  expect(sectionSummary("workspace", input).text).toBe("Comfortable · Enter sends · 500k daily budget");
  expect(sectionSummary("automation", input).text).toBe("2 schedules set up");
  expect(sectionSummary("workspace", { ...input, budget: 1_000_000 }).text).toBe("Comfortable · Enter sends · 1.0M daily budget");
});

it("flags what needs you", () => {
  expect(sectionSummary("agents", input)).toEqual({ text: "Claude and Codex connected · Codex resting on a limit", tone: "wait" });
  expect(sectionSummary("system", input)).toEqual({ text: "Always on · up 2 h · backed up 8 h ago", tone: "ok" });
  expect(sectionSummary("system", { ...input, pulse: { ...pulse, backup: { at: now - 40 * 3_600_000, bytes: 1 } } }).tone).toBe("wait");
  expect(sectionSummary("system", { ...input, pulse: { ...pulse, backup: null } }).text).toContain("no backup yet");
  expect(sectionSummary("agents", { ...input, pulse: { ...pulse, runtimes: [] } })).toEqual({ text: "No model connected yet", tone: "wait" });
});

it("never claims a reading it hasn't made", () => {
  const empty = { ...input, pulse: { health: null, backup: undefined, runtimes: null, schedules: null, updates: null } };
  expect(sectionSummary("agents", empty).text).toBe("Checking your models…");
  expect(sectionSummary("system", empty).text).toBe("Checking the gateway…");
});
