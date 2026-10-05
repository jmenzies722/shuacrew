import path from 'node:path';import { mkdirSync } from 'node:fs';import type { FastifyInstance } from 'fastify';
import { z } from 'zod';import { codexTeachingCompletion,type Runtime } from '@shuacrew/runtimes';import { agentEnv } from '@shuacrew/core/redact';
import { CapabilityChecks } from './capability-receipts.js';import { codexTeachingModel } from './openai-policy.js';import type { Supervisor } from './runs.js';import type { EventStore } from './store.js';
export function setupCheckRoutes(app:FastifyInstance,deps:{home:string;runtimes:Map<string,Runtime>;supervisor:Supervisor;store:EventStore}){
 let checks:CapabilityChecks|undefined;
 for(const e of deps.store.ofKinds('run.created'))if(e.kind==='run.created'&&e.body.labels.includes('setup-check')&&e.body.labels.includes('held')&&e.run){const status=deps.store.forRun(e.run).findLast(x=>x.kind==='run.status');if(status?.kind==='run.status'&&['running','planning','queued'].includes(status.body.status))deps.store.append('run.status',{status:'cancelled',reason:'Setup check interrupted by gateway restart; run a fresh check.'},{run:e.run});}

 const get=()=>checks??=new CapabilityChecks(path.join(deps.home,'capability-checks.json'),async(signal,onStarted)=>{
  const runtime=deps.runtimes.get('codex');if(!runtime)throw Error('Connect Codex to run this check.');
  const status=await runtime.status();if(!status.installed||status.signedIn===false)throw Error('Sign in to Codex before running this check.');
  const model=codexTeachingModel('',runtime.models),cwd=path.join(deps.home,'setup-check');mkdirSync(cwd,{recursive:true,mode:0o700});
  if(signal.aborted)throw Error('Check stopped.');
  const runId=deps.supervisor.launch({runtime:'codex',model,hold:true,ask:'Return SHUA_READY. No tools, files, or external actions.',title:'Setup · Codex response check',labels:['setup-check']});
  const local=new AbortController();const unsubscribe=deps.store.subscribe(e=>{if(e.run===runId&&e.kind==='run.status'&&e.body.status==='cancelled')local.abort();});
  try{
   onStarted(runId);
   deps.store.append('run.status',{status:'running'},{run:runId});
   const output=await codexTeachingCompletion({model,cwd,env:agentEnv(process.env,'subscription'),signal:AbortSignal.any([signal,local.signal]),images:[],schema:{type:'object',properties:{answer:{type:'string'}},required:['answer'],additionalProperties:false},system:'Connection test. Return exactly SHUA_READY as answer. Do not use tools.',prompt:'Return SHUA_READY.'});
   const answer=z.object({answer:z.string()}).parse(typeof output==='string'?JSON.parse(output):output).answer;
   if(signal.aborted||local.signal.aborted)throw Error('Check stopped.');
   deps.store.append('agent.message',{turn:1,text:answer,final:true},{run:runId});deps.store.append('run.status',{status:answer.trim()==='SHUA_READY'?'done':'failed',reason:'Setup response check'},{run:runId});return {runId,answer};
  }catch(e){deps.store.append('run.status',{status:signal.aborted||local.signal.aborted?'cancelled':'failed',reason:(e as Error).message.slice(0,300)},{run:runId});throw e;}finally{unsubscribe();}
 });
 const guarded=async(fn:()=>unknown,reply:any)=>{try{return await fn();}catch(e){return reply.code(e instanceof z.ZodError?400:503).send({error:(e as Error).message.slice(0,400)});}};
 app.get('/api/personal-setup/checks',async(_q,r)=>guarded(()=>get().list(),r));
 app.post('/api/personal-setup/model-check',async(_q,r)=>guarded(()=>get().check(),r));
 app.post('/api/personal-setup/model-check/cancel',async(_q,r)=>guarded(()=>{get().cancel();return {ok:true};},r));
 app.post('/api/personal-setup/observation',async(q,r)=>guarded(()=>{const b=z.object({capability:z.enum(['speaker','microphone','text-entry','interrupt']),ok:z.boolean()}).strict().parse(q.body);return get().observe(b.capability,b.ok);},r));
 app.addHook('onClose',async()=>{checks?.cancel();});
}
