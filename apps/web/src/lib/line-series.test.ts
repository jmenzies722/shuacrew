import { expect, it } from "vitest";
import { lineGeometry } from "./line-series";
it("does not bridge missing time buckets in sparse all-history data", () => {
  expect(lineGeometry([{ at: 0, value: 1 }, { at: 3 * 86400000, value: 2 }], undefined, 86400000).path.match(/M/g)).toHaveLength(2);
});
it("uses real elapsed time and breaks lines at unknown values", () => {
  const chart = lineGeometry([{ at: 0, value: 10 }, { at: 10, value: null }, { at: 100, value: 20 }]);
  expect(chart.points.map(p => p.x)).toEqual([0, 60, 600]);
  expect(chart.path.match(/M/g)).toHaveLength(2);
  expect(chart.max).toBe(20);
  expect(chart.points[1]!.y).toBeNull();
});
it("does not fabricate a line for empty or all unknown data", () => {
  expect(lineGeometry([]).path).toBe("");
  expect(lineGeometry([{ at: 1, value: null }]).path).toBe("");
  const chart = lineGeometry([{ at: 1, value: 0 }]);
  expect(chart.points[0]!.x).toBe(300);
  expect(chart.path).not.toMatch(/NaN|Infinity/);
});
it("honors shared scales and treats invalid measurements as gaps", () => {
  const chart = lineGeometry([{ at: 1, value: 5 }, { at: 2, value: NaN }, { at: 3, value: -1 }], 10);
  expect(chart.max).toBe(10);
  expect(chart.points[0]!.y).toBe(90);
  expect(chart.points.slice(1).every(p => p.y === null)).toBe(true);
});
