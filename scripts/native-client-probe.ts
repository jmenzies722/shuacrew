import type { Page } from "@playwright/test";

export async function probeNativeClient(page: Page, clips: string[]) {
  return page.evaluate(async clips => {
    const events: Array<Record<string, unknown>> = [];
    const started = performance.now(), at = () => Math.round(performance.now() - started);
    const outputs: HTMLAudioElement[] = [];
    const OriginalAudio = Audio;
    (window as any).Audio = function () { const element = new OriginalAudio(); outputs.push(element); return element; };
    let socket: any;
    (window as any).WebSocket = class {
      static OPEN = 1;
      readyState = 1;
      onopen?: () => void;
      onmessage?: (event: { data: string }) => void;
      constructor() { socket = this; setTimeout(() => this.onopen?.(), 0); }
      send(data: string) { void (window as any).probeSend(data); }
      close() { this.readyState = 3; }
    };
    (window as any).probeReceive = (message: unknown) => socket?.onmessage?.({ data: JSON.stringify(message) });
    const ctx = new AudioContext(), microphone = ctx.createMediaStreamDestination();
    const buffers = await Promise.all(clips.map(encoded => ctx.decodeAudioData(Uint8Array.from(atob(encoded), character => character.charCodeAt(0)).buffer)));
    let ready = false, failed = "", interrupted = false, mutedAt = 0, stopLatency = -1, liveSamplesWhileMuted = 0;
    let activeInput = -1, captured = false, followupEnded = false, followupVoiceSamples = 0;
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const play = (index: number) => {
      activeInput = index;
      if (index) call.press();
      call.acceptHold();
      const source = ctx.createBufferSource(); source.buffer = buffers[index]; source.connect(microphone); source.start();
      events.push({ type: "synthetic-input", index, at: at() });
      source.onended = () => {
        call.release(); captured = false; activeInput = -1;
        events.push({ type: "release", index, at: at() });
        if (index === 2) followupEnded = true;
      };
    };
    const call = new (window as any).ShuaNative.LiveCall({
      mode: "hold", mic: microphone.stream, voice: "cove",
      onEvent: (event: any) => {
        if (event.type !== "levels") events.push({ at: at(), ...event });
        if (event.type === "capture") captured = event.on;
        if (event.type === "state" && event.state === "error") failed = event.detail;
        if (event.type === "state" && event.state === "listening" && !ready) { ready = true; play(0); }
        if (event.type !== "levels") return;
        if (activeInput < 0 && event.mic > 0) failed = "Microphone levels remained active after release";
        if (mutedAt && outputs.some(output => output.muted || !output.srcObject) && event.voice > 0) liveSamplesWhileMuted++;
        if (followupEnded && event.voice > 0.015) followupVoiceSamples++;
        if (ready && activeInput < 0 && event.voice > 0.015 && !interrupted) {
          interrupted = true;
          timers.push(setTimeout(() => {
            const before = performance.now(); call.stopSpeaking(); mutedAt = at();
            stopLatency = outputs.every(output => output.muted && !output.srcObject) ? performance.now() - before : -1;
            events.push({ type: "stop-check", at: at(), stopLatency, captured });
          }, 1000));
          timers.push(setTimeout(() => play(1), 2200));
          timers.push(setTimeout(() => play(2), 12000));
        }
      },
    });
    try {
      await call.start();
      const deadline = Date.now() + 65000;
      while (Date.now() < deadline && !failed && (!mutedAt || at() < mutedAt + 30000)) await new Promise(resolve => setTimeout(resolve, 100));
      const text = events.filter(event => event.type === "caption" && event.role === "assistant" && event.final).map(event => event.text).join(" ");
      return { ready, failed, stopLatency, liveSamplesWhileMuted, followupVoiceSamples, text, events };
    } finally {
      for (const timer of timers) clearTimeout(timer);
      call.end(); microphone.stream.getTracks().forEach(track => track.stop()); await ctx.close();
    }
  }, clips);
}
