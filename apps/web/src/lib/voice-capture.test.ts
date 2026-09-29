import { expect, it } from "vitest";
import { SpeechBoundary } from "./voice-capture";
it("ignores short noise, ends after sustained speech and silence, bounds silence and duration", () => {
  const speech = new SpeechBoundary(0);
  expect(speech.sample(.1, 100)).toBe("continue");
  expect(speech.sample(0, 200)).toBe("continue");
  expect(speech.sample(.1, 500)).toBe("continue");
  expect(speech.sample(.1, 800)).toBe("continue");
  expect(speech.sample(0, 1600)).toBe("continue");
  expect(speech.sample(0, 1701)).toBe("finish");
  expect(new SpeechBoundary(0).sample(0, 20001)).toBe("silent");
  const long = new SpeechBoundary(0); long.sample(.1, 0); long.sample(.1, 300);
  expect(long.sample(.1, 30001)).toBe("finish");
});
