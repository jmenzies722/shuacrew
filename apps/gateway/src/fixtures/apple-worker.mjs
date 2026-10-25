#!/usr/bin/env node
import readline from "node:readline";
console.log(JSON.stringify({ type: "ready" }));
readline.createInterface({ input: process.stdin }).on("line", line => {
  const request = JSON.parse(line);
  if (request.type === "list") return console.log(JSON.stringify({ type: "voices", voices: [
    { identifier: "com.apple.voice.enhanced.en-GB.Daniel", name: "Daniel (Enhanced)", language: "en-GB", quality: "enhanced", gender: "male" },
    { identifier: "com.apple.voice.premium.en-US.Zoe", name: "Zoe (Premium)", language: "en-US", quality: "premium", gender: "female" },
  ] }));
  // Echo the voice it was asked for in the WAV's data, so the test can see the gateway's id became Apple's identifier.
  const said = Buffer.from(request.voiceId), wav = Buffer.alloc(44 + said.length);
  wav.write("RIFF"); wav.writeUInt32LE(36 + said.length, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(22050, 24); wav.writeUInt32LE(44100, 28); wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(said.length, 40); said.copy(wav, 44);
  if (!request.warmup) console.log(JSON.stringify({ id: request.id, type: "audio", data: wav.toString("base64") }));
  console.log(JSON.stringify({ id: request.id, type: "done" }));
});
