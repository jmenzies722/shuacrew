import { expect, it } from "vitest";
import { LiveVoice } from "./live.js";

/** A LiveVoice whose usage read is a counted stub, so readiness can be timed without spawning Codex. */
function voice() {
  const reads = { n: 0, release: [] as Array<() => void> };
  type Probe = { readiness(): Promise<unknown>; ready?: { at: number; value: Promise<unknown> }; refreshing: boolean; readRateLimits: () => Promise<unknown> };
  const v = Object.create(LiveVoice.prototype) as unknown as Probe;
  v.refreshing = false;
  v.readRateLimits = () => { reads.n++; return new Promise((r) => reads.release.push(() => r({ rateLimits: { primary: { usedPercent: 10 } } }))); };
  return { v, reads };
}

it("a usage read under 10 minutes old answers at once and refreshes behind it, once", async () => {
  const { v, reads } = voice();
  const cold = v.readiness(); // nothing known: this one waits
  expect(reads.n).toBe(1);
  reads.release.shift()!(); await cold;
  v.ready!.at = Date.now() - 2 * 60_000; // two minutes later
  const before = v.ready!.value;
  expect(v.readiness()).toBe(before); // instant: the last answer
  expect(v.readiness()).toBe(before);
  expect(reads.n).toBe(2); // one refresh behind it, not one per ask
  reads.release.shift()!(); await new Promise((r) => setTimeout(r, 0));
  expect(v.ready!.value).not.toBe(before); // refreshed
  v.ready!.at = Date.now() - 20 * 60_000; // long quiet: too old to trust, wait for a fresh read
  void v.readiness();
  expect(reads.n).toBe(3); // a fresh read, waited for
});
