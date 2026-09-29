/** Explicit manual verification with a public prerecorded sample; not a live-microphone test. */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
const base = "http://127.0.0.1:7420";
async function json(url: string, body?: unknown) {
  const response = await fetch(base + url, { method: body === undefined ? "GET" : "POST", headers: { "X-ShuaCrew": "1", ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error ?? response.statusText); return data;
}
const wav = readFileSync(process.argv[2]!);
const transcription = await fetch(base + "/api/transcribe?voice=1&name=fixture.wav", { method: "POST", headers: { "X-ShuaCrew": "1", "Content-Type": "application/octet-stream" }, body: wav });
const transcript = await transcription.json();
if (!transcription.ok || !transcript.text) throw new Error("Fixture transcription failed: " + JSON.stringify(transcript));
console.log(JSON.stringify({ fixture: "public prerecorded speech, not live microphone", transcription: transcript.text }));
for (const runtime of ["claude", "codex"]) {
  await json("/api/voice/initialize", { runtime });
  const input = { requestId: randomUUID(), memberId: "shua", runtime, text: `This is a prerecorded voice integration check. Do not use tools or access any files. Remember the word cedar for the next message. Reply with exactly: Shua is ready. Public test transcript: ${transcript.text}` };
  const first = await json("/api/voice/utterances", input);
  const retry = await json("/api/voice/utterances", input);
  if (first.runId !== retry.runId) throw new Error("Duplicate run created");
  async function wait(after: number) {
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const events = await json(`/api/runs/${first.runId}/events`);
      const recent = events.filter((e: { seq: number }) => e.seq > after);
      if (recent.some((e: { kind: string; body: { status?: string } }) => e.kind === "run.status" && ["failed", "cancelled"].includes(e.body.status ?? ""))) throw new Error(runtime + " run failed");
      if (recent.some((e: { kind: string }) => e.kind === "turn.completed") && (await json(`/api/voice/runs/${first.runId}/idle`)).idle) {
        if (recent.some((e: { kind: string }) => e.kind === "tool.called")) throw new Error("Unexpected tool activity in no-tools fixture");
        return recent.filter((e: { kind: string }) => e.kind === "agent.message").map((e: { body: { text: string } }) => e.body.text).join("\n");
      }
      await new Promise(r => setTimeout(r, 500));
    }
    throw new Error(runtime + " response timed out");
  }
  const answer = await wait(first.after);
  const followup = await json("/api/voice/utterances", { requestId: randomUUID(), runId: first.runId, memberId: "shua", runtime, text: "What word did I ask you to remember? Reply with only that word. Do not use tools." });
  const memory = await wait(followup.after);
  if (!/cedar/i.test(memory)) throw new Error(runtime + " follow-up did not retain context");
  const speech = await fetch(base + "/api/speech/synthesize", { method: "POST", headers: { "X-ShuaCrew": "1", "Content-Type": "application/json" }, body: JSON.stringify({ id: randomUUID(), generation: 1, voiceId: runtime === "claude" ? "aiden" : "charles", text: answer.slice(0, 500), speed: 1 }) });
  const chunks = (await speech.text()).trim().split("\n").map(line => JSON.parse(line));
  if (!chunks.some(c => c.type === "audio") || chunks.at(-1)?.type !== "done") throw new Error("Neural synthesis failed: " + JSON.stringify(chunks.filter(c => c.type !== "audio")));
  console.log(JSON.stringify({ runtime, runId: first.runId, answer, followup: memory, idempotent: true, audioChunks: chunks.filter(c => c.type === "audio").length, audioBytes: chunks.filter(c => c.type === "audio").reduce((n, c) => n + Buffer.from(c.data, "base64").length, 0) }));
}
