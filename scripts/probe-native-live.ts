import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { LiveVoice } from "../apps/gateway/src/live.js";
import { probeNativeClient } from "./native-client-probe.js";

async function main() {
  if (!process.argv.includes("--subscription-probe")) throw new Error("Pass --subscription-probe to spend subscription usage on synthetic audio only.");
  const root = mkdtempSync(path.join(tmpdir(), "shua-native-probe-"));
  const clips = [
    "Please count slowly from one to thirty, with a pause between each number. This is a voice test, do not use tools.",
    "Stop counting. Say only the word amber, then be quiet.",
    "What is two plus two? Answer in one word.",
  ].map((text, index) => {
    const file = path.join(root, `input-${index}.wav`);
    execFileSync("/usr/bin/say", ["-o", file, "--data-format=LEI16@24000", text]);
    return readFileSync(file).toString("base64");
  });
  const server = createServer((_request, response) => { response.setHeader("Content-Type", "text/html"); response.end("<!doctype html><title>Isolated synthetic voice probe</title>"); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No local probe port");
  const browser = await chromium.launch({ headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage();
  const listeners = new Map<string, (data?: unknown) => void>();
  const service = new LiveVoice({ home: root, protectedPaths: () => ["/Users/admin/Nectar-Work", "/Users/admin/Developer/work"] });
  try {
    await page.addInitScript("window.__name = (value) => value;");
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.exposeFunction("probeSend", (data: string) => listeners.get("message")?.(data));
    service.attach({
      on: (event, listener) => { listeners.set(event, listener); },
      send: data => { void page.evaluate(data => (window as any).probeReceive?.(JSON.parse(data)), data).catch(() => undefined); },
      close: () => { listeners.get("close")?.(); },
    });
    if (process.argv.includes("--app-client")) {
      const bundle = path.join(root, "native-client.js");
      execFileSync(path.resolve("node_modules/.bin/esbuild"), ["apps/web/src/lib/live-voice.ts", "--bundle", "--format=iife", "--global-name=ShuaNative", `--outfile=${bundle}`]);
      await page.addScriptTag({ path: bundle });
      const result = await probeNativeClient(page, clips);
      const artifact = path.join(root, "client-result.json");
      writeFileSync(artifact, JSON.stringify(result, null, 2));
      console.log(JSON.stringify({ artifact, ...result, events: result.events.filter(event => event.type !== "playback") }, null, 2));
      if (!result.ready || result.failed || result.stopLatency < 0 || result.stopLatency > 50 || result.liveSamplesWhileMuted || !result.followupVoiceSamples || !/amber/i.test(result.text) || !/four|4/i.test(result.text.slice(result.text.toLowerCase().indexOf("amber")))) process.exitCode = 1;
      return;
    }
    const result = await page.evaluate(async ({ clips, textStop }) => {
      const events: Array<Record<string, unknown>> = [], samples: Array<{ at: number; rms: number }> = [];
      const started = performance.now(), at = () => Math.round(performance.now() - started);
      const ctx = new AudioContext(), output = ctx.createMediaStreamDestination();
      const buffers = await Promise.all(clips.map(encoded => ctx.decodeAudioData(Uint8Array.from(atob(encoded), character => character.charCodeAt(0)).buffer)));
      const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let index = 0; index < data.length; index++) data[index] = (Math.random() * 2 - 1) * 0.002;
      const clock = ctx.createBufferSource(); clock.buffer = noise; clock.loop = true; clock.connect(output); clock.start();
      const peer = new RTCPeerConnection(); peer.addTrack(output.stream.getAudioTracks()[0], output.stream);
      peer.onconnectionstatechange = () => events.push({ at: at(), type: "connection-state", state: peer.connectionState });
      peer.oniceconnectionstatechange = () => events.push({ at: at(), type: "ice-state", state: peer.iceConnectionState });
      const channel = peer.createDataChannel("oai-events");
      const analyser = ctx.createAnalyser(), sample = new Float32Array(analyser.fftSize);
      const audio = new Audio(); audio.autoplay = true;
      let ready = false, failed = "", interruptionAt = 0, initialEndedAt = 0, firstAudioAt = 0;
      let interruptionScheduled = false;
      const play = (index: number) => {
        events.push({ at: at(), type: "synthetic-input", index, duration: buffers[index].duration });
        const source = ctx.createBufferSource(); source.buffer = buffers[index]; source.connect(output); source.start();
        source.onended = () => { events.push({ at: at(), type: "synthetic-input-ended", index }); if (index === 0) initialEndedAt = at(); };
      };
      peer.ontrack = event => {
        const stream = event.streams[0] ?? new MediaStream([event.track]);
        audio.srcObject = stream; void audio.play().catch(error => { failed = error.message; });
        ctx.createMediaStreamSource(stream).connect(analyser);
      };
      channel.onmessage = event => {
        const message = JSON.parse(event.data);
        events.push({ at: at(), ...message });
        if (message.type === "session.started") { ready = true; play(0); }
      };
      (window as any).probeReceive = async (message: any) => {
        if (message.type === "answer") await peer.setRemoteDescription({ type: "answer", sdp: message.sdp });
        else { events.push({ at: at(), source: "gateway", ...message }); if (message.type === "error") failed = message.message; }
      };
      const timer = setInterval(() => {
        analyser.getFloatTimeDomainData(sample);
        const rms = Math.sqrt(sample.reduce((sum, value) => sum + value * value, 0) / sample.length);
        samples.push({ at: at(), rms });
        if (ready && initialEndedAt && rms > 0.015 && !interruptionScheduled) {
          interruptionScheduled = true; firstAudioAt = at();
          setTimeout(() => {
            interruptionAt = at();
            if (textStop) {
              events.push({ at: at(), type: "text-stop" });
              void (window as any).probeSend(JSON.stringify({ type: "text", text: "Stop counting. Say only the word amber, then be quiet." }));
            } else play(1);
          }, 1800);
          setTimeout(() => play(2), 9500);
        }
      }, 50);
      try {
        await peer.setLocalDescription(await peer.createOffer());
        await new Promise(resolve => setTimeout(resolve, 1200));
        await (window as any).probeSend(JSON.stringify({ type: "start", sdp: peer.localDescription!.sdp, voice: "cove" }));
        const deadline = Date.now() + 65000;
        while (Date.now() < deadline && !failed && (!interruptionAt || at() < interruptionAt + 26000)) await new Promise(resolve => setTimeout(resolve, 100));
        return { ready, failed, initialEndedAt, firstAudioAt, interruptionAt, events, samples, connectionState: peer.connectionState };
      } finally {
        clearInterval(timer); audio.pause(); audio.srcObject = null;
        clock.stop(); peer.close(); await ctx.close();
        await (window as any).probeSend(JSON.stringify({ type: "stop" }));
      }
    }, { clips, textStop: process.argv.includes("--text-stop") });
    writeFileSync(path.join(root, "result.json"), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ artifact: path.join(root, "result.json"), ...result, samples: `${result.samples.length} samples retained in artifact`, events: result.events.filter(event => /transcript|synthetic|error|closed/.test(String(event.type))) }, null, 2));
    const replies = result.events.filter(event => event.source === "gateway" && event.type === "transcript" && event.role === "assistant").map(event => String(event.text)).join(" ");
    if (!result.ready || result.failed || result.connectionState !== "connected" || !result.interruptionAt || !/amber/i.test(replies) || !/four|4/i.test(replies.slice(replies.toLowerCase().indexOf("amber")))) process.exitCode = 1;
  } finally {
    listeners.get("close")?.(); await browser.close(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
