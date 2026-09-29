import { expect, it } from "vitest";
import { appendHealthSample } from "./health-history";
it("retains measured samples only, caps memory, and inserts gaps after disconnect or restart", () => {
  let samples = appendHealthSample([], { at: 1000, rssMb: 42, uptimeS: 20 });
  expect(samples).toHaveLength(1);
  samples = appendHealthSample(samples, { at: 5000, rssMb: 44, uptimeS: 24 });
  expect(samples.map(s => s.value)).toEqual([42, 44]);
  samples = appendHealthSample(samples, { at: 90000, rssMb: 30, uptimeS: 1 });
  expect(samples.map(s => s.value)).toEqual([42, 44, null, 30]);
  for (let i = 1; i < 250; i++) samples = appendHealthSample(samples, { at: 90000 + i * 1000, rssMb: 30, uptimeS: i + 1 });
  expect(samples.length).toBeLessThanOrEqual(120);
});
