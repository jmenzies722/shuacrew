import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LiveWaveform, VoiceWaveform } from "./LiveMode";

const audio = vi.hoisted(() => ({ state: "listening", mic: 0, voice: 0 }));
vi.mock("../lib/live-session", () => ({ useLive: () => ({ state: audio.state }), useLiveLevels: () => audio }));
vi.mock("./LiveVoiceSelect", () => ({ LiveVoiceSelect: () => null }));

it("does not animate stale microphone samples when capture has ended", () => {
  const markup = renderToStaticMarkup(<VoiceWaveform state="thinking" readLevel={() => 1} />);
  const heights = [...markup.matchAll(/height:([\d.]+)px/g)].map(match => Number(match[1]));
  expect(Math.max(...heights)).toBe(3);
});

it("uses microphone energy while listening and playback energy while speaking", () => {
  audio.state = "listening"; audio.mic = 0; audio.voice = 1;
  expect(renderToStaticMarkup(<LiveWaveform />)).toContain('height:3px');
  audio.mic = 1;
  expect(renderToStaticMarkup(<LiveWaveform />)).toContain('height:32px');
  audio.state = "speaking"; audio.voice = 0;
  expect(renderToStaticMarkup(<LiveWaveform />)).toContain('height:3px');
  audio.voice = 1;
  const markup = renderToStaticMarkup(<LiveWaveform compact />);
  expect(markup).toContain('height:18px');
  expect(markup).toContain('Voice waveform');
});

it("keeps quiet but audible playback visible without animating silence", () => {
  audio.state = "speaking"; audio.voice = 0.001; audio.mic = 0;
  const markup = renderToStaticMarkup(<LiveWaveform />);
  const heights = [...markup.matchAll(/height:([\d.]+)px/g)].map(match => Number(match[1]));
  expect(Math.max(...heights)).toBeGreaterThan(5);
  audio.voice = 0;
  expect(renderToStaticMarkup(<LiveWaveform />)).toContain("height:3px");
});

it("renders transcript speakers once and keeps corrections concise", async () => {
  const { LiveTranscript } = await import("./LiveMode");
  const markup = renderToStaticMarkup(<LiveTranscript live={{active:true,state:"ready",mic:0,voice:0,feed:[{kind:"line",role:"user",text:"Type a test",final:true},{kind:"result",text:"No action ran.",corrected:"Done"},{kind:"line",role:"assistant",text:"Sorry, no action ran.",final:true}]}} />);
  expect(markup).toContain("Conversation transcript"); expect(markup).toContain("You");
  expect(markup).toContain("updated result"); expect(markup).not.toContain("Corrected what Shua said");
  expect(markup).not.toContain("Sorry, no action ran.");
});

it("renders long answers and copy controls without truncating text", async () => {
  const { ConversationTranscript } = await import("./LiveMode");
  const answer = "A full paragraph.\n".repeat(100) + "Final sentence preserved.";
  const markup = renderToStaticMarkup(<ConversationTranscript lines={[{role:"user",text:"Explain everything"},{role:"assistant",text:answer}]} />);
  expect(markup).toContain("Explain everything");
  expect(markup).toContain("Final sentence preserved.");
  expect(markup).toContain("Copy conversation");
  expect(markup).toContain('tabindex="0"');
});
