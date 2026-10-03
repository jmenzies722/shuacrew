import { afterEach, expect, it, vi } from "vitest";
import { micConstraints, setMicRoute, setMicPreference } from "./mic-route";

const devices = [{ kind: "audioinput", label: "Shua Airpods", deviceId: "bt" }, { kind: "audioinput", label: "MacBook Pro Microphone", deviceId: "mac" }];
afterEach(() => { vi.unstubAllGlobals(); setMicRoute({}); setMicPreference("default"); });

it("listens through the Mac's mic when the headphones are Bluetooth, so they stay high quality", async () => {
  vi.stubGlobal("navigator", { mediaDevices: { enumerateDevices: async () => devices } });
  const base = { echoCancellation: true };
  setMicPreference("built-in");
  expect(await micConstraints(base)).toEqual(base); // no route yet: the system default
  setMicRoute({ bluetooth: true, mic: "MacBook Pro Microphone" });
  expect(await micConstraints(base)).toEqual({ echoCancellation: true, deviceId: { exact: "mac" } });
  setMicRoute({ bluetooth: false, mic: "MacBook Pro Microphone" });
  expect(await micConstraints(base)).toEqual(base); // speakers: leave the mic alone
  setMicRoute({ bluetooth: true, mic: "Studio Display Microphone" });
  expect(await micConstraints(base)).toEqual(base); // named mic not present: default rather than fail
});

it("honors the system input including AirPods unless the user selects another microphone", async () => {
  vi.stubGlobal("navigator", { mediaDevices: { enumerateDevices: async () => devices } });
  setMicRoute({ bluetooth: true, mic: "MacBook Pro Microphone" });
  expect(await micConstraints({ echoCancellation: true })).toEqual({ echoCancellation: true });
  setMicPreference("bt");
  expect(await micConstraints({})).toEqual({ deviceId: { ideal: "bt" } });
});
