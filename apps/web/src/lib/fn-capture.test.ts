import { expect, it, vi } from "vitest";
import { fnCapture } from "./fn-capture";

it("warms on press, records on hold, and releases rather than starting a call", () => {
  const mic = { mode: "auto" as "auto" | "hold", warm: vi.fn(), press: vi.fn(), release: vi.fn(), cool: vi.fn() };
  fnCapture("down", mic, false);
  fnCapture("hold", mic, false);
  fnCapture("release", mic, false);
  expect(mic.mode).toBe("hold");
  expect(mic.warm).toHaveBeenCalledOnce();
  expect(mic.press).toHaveBeenCalledOnce();
  expect(mic.release).toHaveBeenCalledOnce();
});

it("does not open a competing microphone during an explicit Talk call", () => {
  const mic = { mode: "auto" as "auto" | "hold", warm: vi.fn(), press: vi.fn(), release: vi.fn(), cool: vi.fn() };
  for (const signal of ["down", "hold", "release", "tap", "cancel"] as const) fnCapture(signal, mic, true);
  expect(mic.warm).not.toHaveBeenCalled();
  expect(mic.press).not.toHaveBeenCalled();
  expect(mic.release).not.toHaveBeenCalled();
  expect(mic.cool).not.toHaveBeenCalled();
});
