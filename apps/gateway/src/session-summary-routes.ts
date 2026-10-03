import type { FastifyInstance } from "fastify";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fold } from "@shuacrew/core";
import { agentEnv, redact } from "@shuacrew/core/redact";
import { codexTeachingCompletion, teachingCompletion, type Runtime } from "@shuacrew/runtimes";
import type { EventStore } from "./store.js";
import type { Supervisor } from "./runs.js";
import { SessionSummaries, summaryEvidence, SUMMARY_SYSTEM } from "./session-summary.js";

export function sessionSummaryRoutes(app: FastifyInstance, deps: {store:EventStore;supervisor:Supervisor;runtimes:Map<string,Runtime>;home:string}) {
  const summaries = new SessionSummaries(async evidence => {
    const choice = deps.supervisor.intelligence({ask:"Summarize a completed session for speech",mode:"auto",purpose:"conversation",images:false,tier:"fast",preferredRuntime:"codex"});
    if (!choice.runtime || !choice.model || !["codex","claude"].includes(choice.runtime) || !deps.runtimes.has(choice.runtime)) throw new Error("A connected summary model is unavailable");
    const cwd = path.join(deps.home,"spoken-summaries"); mkdirSync(cwd,{recursive:true});
    const complete = choice.runtime === "codex" ? codexTeachingCompletion : teachingCompletion;
    return complete({prompt:evidence,system:SUMMARY_SYSTEM,model:choice.model,cwd,env:agentEnv(process.env,"subscription"),signal:AbortSignal.timeout(45_000),images:[],schema:{type:"object",properties:{summary:{type:"string"}},required:["summary"],additionalProperties:false}});
  });
  app.post<{Params:{id:string}}>("/api/runs/:id/spoken-summary", async (request, reply) => {
    const events = deps.store.forRun(request.params.id);
    const run = fold(events).runs[request.params.id];
    if (!run) return reply.code(404).send({error:"Session not found"});
    if (!["done","merged","reviewing","failed","cancelled"].includes(run.status)) return reply.code(409).send({error:"The request is still in progress"});
    const revision = events.at(-1)?.seq ?? 0;
    try { return {summary:redact(await summaries.get(`${run.id}:${revision}`,summaryEvidence(events,run.status,run.title))),revision}; }
    catch { return reply.code(503).send({error:"The spoken summary is unavailable; the full result is in the session."}); }
  });
}
