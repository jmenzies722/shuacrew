import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { atomicPrivateWrite } from "./personal-setup.js";
import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import { z } from 'zod';
import { PersonalSetup, SetupConflict, type SetupPatch } from './personal-setup.js';
export function personalSetupRoutes(app:FastifyInstance,home:string,onComplete?:(goal:string)=>void){
 const epochFile=path.join(home,'content-epoch.json');
 const epoch=()=>existsSync(epochFile)?z.object({epoch:z.string().regex(/^[a-zA-Z0-9-]{1,100}$/)}).passthrough().parse(JSON.parse(readFileSync(epochFile,'utf8'))).epoch:null;
 app.get('/api/content-epoch',async()=>({epoch:epoch()}));
 app.post('/api/content-epoch/archive',{bodyLimit:10*1024*1024},async(q,r)=>{
  try{const b=z.object({epoch:z.string(),content:z.record(z.string().max(200),z.string().max(1000000))}).strict().parse(q.body);if(!epoch()||b.epoch!==epoch())return r.code(409).send({error:'Workspace changed; reload before resetting browser content.'});
   atomicPrivateWrite(path.join(home,'backups',`browser-${b.epoch}`,`${randomUUID()}.json`),b.content);return {ok:true};
  }catch{return r.code(400).send({error:'Browser content backup failed. Existing data is unchanged.'});}
 });
 const store=new PersonalSetup(path.join(home,'personal-setup.json'));
 app.get('/api/personal-setup',async(_req,reply)=>{try{return store.get();}catch(e){return reply.code(503).send({error:(e as Error).message});}});
 app.post<{Body:{expectedRevision:number;patch:SetupPatch}}>('/api/personal-setup',async(req,reply)=>{
  try{if(!req.body||!Number.isInteger(req.body.expectedRevision))return reply.code(400).send({error:'A saved setup revision is required.'});return store.save(req.body.expectedRevision,req.body.patch,onComplete);}
  catch(e){return reply.code(e instanceof SetupConflict?409:e instanceof z.ZodError?400:503).send({error:e instanceof z.ZodError?'Check the setup fields and try again.':(e as Error).message});}
 });
}
