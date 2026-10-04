import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NotchVoiceStatus } from "./NotchVoiceStatus";

vi.mock("../lib/live-session", () => ({}));
vi.mock("./LiveVoiceSelect", () => ({ LiveVoiceSelect: () => null }));

it("shows a measured microphone waveform and the Fn release instruction", () => {
  const markup = renderToStaticMarkup(<NotchVoiceStatus state="listening" held readLevel={() => 0} />);
  expect(markup).toContain("Microphone waveform");
  expect(markup).toContain("Release Fn to send");
  const heights = [...markup.matchAll(/height:([\d.]+)px/g)].map(match => Number(match[1]));
  expect(Math.max(...heights)).toBe(3);
});

it("uses playback levels and does not imply that the mic is recording", () => {
  const markup = renderToStaticMarkup(<NotchVoiceStatus state="speaking" held={false} readLevel={() => 1} />);
  expect(markup).toContain("Voice waveform");
  expect(markup).toContain("Speaking");
  expect(markup).not.toContain("Release Fn");
  expect(markup).toContain("height:32px");
});

it("removes the listening indicator immediately during processing or idle", () => {
  for (const state of ["thinking", "idle"]) expect(renderToStaticMarkup(<NotchVoiceStatus state={state} held={false} readLevel={() => 1} />)).toBe("");
});
