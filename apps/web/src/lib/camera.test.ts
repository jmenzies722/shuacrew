import { describe, expect, it } from "vitest";
import { building, cameraProblem, needsCamera } from "./camera";

describe("Shua's camera", () => {
  it("looks through the camera when you show it something in the real world", () => {
    for (const q of ["what is this part?", "look at this", "can you see what I'm holding?", "check my wiring", "is this servo wired right? look at my breadboard",
      "what am i holding", "use the camera and tell me what's on my desk", "inspect the solder joints", "what's this sensor"]) expect(needsCamera(q), q).toBe(true);
  });
  it("leaves the screen to the screenshot, and respects 'don't use the camera'", () => {
    for (const q of ["look at this error on my screen", "what's on my screen", "look at this code", "fix the failing test", "don't use the camera, just tell me the pinout of an ESP32"])
      expect(needsCamera(q), q).toBe(false);
    expect(needsCamera("look at this window through the camera")).toBe(true); // asked for the camera by name
  });
  it("knows a physical build when it hears one", () => {
    expect(building("my robot's left motor won't spin")).toBe(true);
    expect(building("wire an LED to the Arduino")).toBe(true);
    expect(building("refactor the auth module")).toBe(false);
  });
  it("says what to do when the camera can't be used", () => {
    expect(cameraProblem({ name: "NotAllowedError" })).toMatch(/reopen ShuaCrew/);
    expect(cameraProblem({ name: "NotFoundError" })).toMatch(/Continuity Camera/);
  });
});
