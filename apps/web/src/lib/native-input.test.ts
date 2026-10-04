import { expect, it } from "vitest";
import { NativeInputBuffer } from "./native-input";

it("buffers a cold hold, releases without admitting later mic samples, then drains", () => {
  const input = new NativeInputBuffer(8);
  input.press(); input.push(new Float32Array([1, 2]));
  expect([...input.read(2)]).toEqual([0, 0]);
  input.accept(); input.release(); input.push(new Float32Array([9, 9]));
  input.ready = true;
  expect([...input.read(3)]).toEqual([1, 2, 0]);
  expect([...input.read(2)]).toEqual([0, 0]);
});

it("discards taps and caps retained audio rather than growing without bound", () => {
  const input = new NativeInputBuffer(3);
  input.press(); input.push(new Float32Array([1, 2])); input.cancel();
  input.ready = true; input.accept();
  expect([...input.read(2)]).toEqual([0, 0]);
  input.press(); input.accept();
  expect(input.push(new Float32Array([1, 2, 3, 4]))).toBe(false);
  expect(input.capturing).toBe(false);
  expect([...input.read(4)]).toEqual([0, 0, 0, 0]);
});
