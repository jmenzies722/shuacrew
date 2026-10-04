import { afterEach, expect, it, vi } from "vitest";
import { scheduleNotchClose } from "./notch-hover";

afterEach(() => vi.useRealTimers());

it("tucks away after the pointer leaves, with a small grace period", () => {
  vi.useFakeTimers();
  const close = vi.fn();
  scheduleNotchClose(close, () => false);
  vi.advanceTimersByTime(449);
  expect(close).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(close).toHaveBeenCalledOnce();
});

it("cancels collapse when the pointer returns or the component unmounts", () => {
  vi.useFakeTimers();
  const close = vi.fn();
  const cancel = scheduleNotchClose(close, () => false);
  cancel();
  vi.runAllTimers();
  expect(close).not.toHaveBeenCalled();
});

it("lets a media drag finish then collapses without another pointer event", () => {
  vi.useFakeTimers();
  const close = vi.fn();
  let dragging = true;
  scheduleNotchClose(close, () => dragging);
  vi.advanceTimersByTime(650);
  expect(close).not.toHaveBeenCalled();
  dragging = false;
  vi.advanceTimersByTime(100);
  expect(close).toHaveBeenCalledOnce();
});
