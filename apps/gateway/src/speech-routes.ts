import { Readable } from "node:stream";
import type { FastifyInstance } from "fastify";
import { validateSpeechRequest, type SpeechService } from "./speech.js";

export function speechRoutes(app: FastifyInstance, speech?: SpeechService) {
  app.get("/api/speech/status", async () => speech?.status() ?? { state: "missing", voices: [], error: "Local speech is not configured." });
  app.post("/api/speech/install", async (_request, reply) => {
    if (!speech) return reply.code(503).send({ error: "Speech service unavailable." });
    if (speech.status().state === "installing") return reply.code(409).send({ error: "Setup is already running." });
    if (speech.status().state === "ready") return { ok: true };
    void speech.installer.install().catch(() => {});
    return { ok: true };
  });
  app.post("/api/speech/install/cancel", async () => { speech?.installer.cancel(); return { ok: true }; });
  app.post<{ Body: { voiceId?: string; warmMinutes?: number } }>("/api/speech/warm", async (request, reply) => {
    if (!speech) return reply.code(503).send({ error: "Speech service unavailable." });
    const abort = new AbortController(); const cancel = () => abort.abort();
    reply.raw.once("close", cancel);
    try { return await speech.warm(request.body?.voiceId ?? "", abort.signal, request.body?.warmMinutes); }
    catch (error) { return reply.code(422).send({ error: (error as Error).message }); }
    finally { reply.raw.off("close", cancel); }
  });
  app.post("/api/speech/synthesize", async (request, reply) => {
    let input;
    try { input = validateSpeechRequest(request.body); }
    catch { return reply.code(400).send({ error: "Choose an available voice and use 1–600 characters at 0.8–1.2× speed." }); }
    if (!speech) return reply.code(503).send({ error: "Local speech is not configured." });
    const abort = new AbortController();
    const cancel = () => abort.abort();
    reply.raw.once("close", cancel);
    // One line per spoken piece, like transcription's: proof Shua spoke, and how soon its voice started.
    const began = Date.now(); let first = 0, clips = 0, failed = "";
    const stream = async function* () {
      try { for await (const chunk of speech.synthesize(input, abort.signal)) { if ((chunk as { type?: string }).type === "audio") { clips++; first ||= Date.now() - began; } yield JSON.stringify(chunk) + "\n"; } }
      catch (error) {
        failed = error instanceof Error ? error.message : "Speech failed.";
        if (!abort.signal.aborted) yield JSON.stringify({ id: input.id, generation: input.generation, type: "error", error: failed }) + "\n";
      } finally {
        reply.raw.off("close", cancel);
        console.log(`${new Date().toISOString()} speak voice=${input.voiceId} chars=${input.text.length} clips=${clips} first=${first}ms ms=${Date.now() - began}${abort.signal.aborted ? " cancelled" : ""}${failed ? ` error=${failed.slice(0, 120)}` : ""}`);
      }
    };
    return reply.header("Cache-Control", "no-store").type("application/x-ndjson").send(Readable.from(stream()));
  });
  app.addHook("onClose", async () => speech?.close());
}
