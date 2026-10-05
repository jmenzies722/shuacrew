import { existsSync,readFileSync } from 'node:fs';
import { z } from 'zod';
import { atomicPrivateWrite } from './personal-setup.js';
const Receipt=z.object({capability:z.string(),state:z.enum(['untested','checking','verified','blocked','stale']),scope:z.string(),checkedAt:z.number(),evidenceKind:z.enum(['service','model-run','native-action','user-observed']),runId:z.string().optional(),detail:z.string(),fixPath:z.string().optional()});
export type CapabilityReceipt=z.infer<typeof Receipt>;
export class CapabilityChecks {
 private values:CapabilityReceipt[]=[];private pending:Promise<CapabilityReceipt>|null=null;private abort?:AbortController;
 constructor(private file:string,private run:(signal:AbortSignal,onStarted:(runId:string)=>void)=>Promise<{runId:string;answer:string}>){
  if(existsSync(file)){try{this.values=z.object({version:z.literal(1),receipts:z.array(Receipt)}).parse(JSON.parse(readFileSync(file,'utf8'))).receipts.map(r=>r.state==='checking'?{...r,state:'stale',detail:'Interrupted by restart. Run this check again.'}:r);}catch{throw Error('Saved capability checks could not be read. Their file has been preserved.');}}
 }
 list(){return structuredClone(this.values);}
 private put(r:CapabilityReceipt){const next=[...this.values.filter(x=>x.capability!==r.capability||x.evidenceKind!==r.evidenceKind),r];atomicPrivateWrite(this.file,{version:1,receipts:next});this.values=next;return r;}
 check():Promise<CapabilityReceipt>{
  if(this.pending)return this.pending;const abort=new AbortController();this.abort=abort;
  const base:{capability:string;scope:string;checkedAt:number;evidenceKind:'model-run';runId?:string}={capability:'codex',scope:'Short Codex response; no Mac action tested',checkedAt:Date.now(),evidenceKind:'model-run' as const};
  this.put({...base,state:'checking',detail:'Waiting for a real Codex response…'});
  this.pending=(async()=>{let timer:ReturnType<typeof setTimeout>|undefined;
   try{
    const cancelled=new Promise<never>((_,reject)=>{abort.signal.addEventListener('abort',()=>reject(Error('Check stopped or timed out.')),{once:true});timer=setTimeout(()=>abort.abort(),60000);timer.unref();});
    const result=await Promise.race([this.run(abort.signal,runId=>{base.runId=runId;this.put({...base,state:"checking",detail:"Waiting for a real Codex response…"});}),cancelled]);if(abort.signal.aborted)throw Error('Check stopped.');
    return this.put({...base,runId:result.runId,checkedAt:Date.now(),state:result.answer.trim()==='SHUA_READY'?'verified':'blocked',detail:result.answer.trim()==='SHUA_READY'?'Codex returned the expected response.':'Codex responded, but the check did not match the expected result.'});
   }catch(e){return this.put({...base,checkedAt:Date.now(),state:'blocked',detail:(e as Error).message.slice(0,400),fixPath:'/settings#agents'});}finally{clearTimeout(timer);this.pending=null;this.abort=undefined;}
  })();return this.pending;
 }
 cancel(){this.abort?.abort();}
 observe(capability:'speaker'|'microphone'|'text-entry'|'interrupt',ok:boolean){if(!['speaker','microphone','text-entry','interrupt'].includes(capability))throw Error('Only device observations can be recorded here.');return this.put({capability,state:ok?'verified':'blocked',scope:'Reported by you; not an automated device test',checkedAt:Date.now(),evidenceKind:'user-observed',detail:ok?'You confirmed the expected result.':'You reported that this check needs attention.'});}
}
