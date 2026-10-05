import { expect,it } from 'vitest';import { mkdtempSync } from 'node:fs';import path from 'node:path';import os from 'node:os';
import { CapabilityChecks } from './capability-receipts.js';
const file=()=>path.join(mkdtempSync(path.join(os.tmpdir(),'shua-check-')),'checks.json');
it('deduplicates a check and persists scoped evidence',async()=>{
 let count=0,release!:()=>void;const gate=new Promise<void>(r=>release=r);const f=file();
 const c=new CapabilityChecks(f,async()=>{count++;await gate;return {runId:'r_1',answer:'SHUA_READY'};});
 const a=c.check(),b=c.check();expect(count).toBe(1);expect(c.list()[0]?.state).toBe('checking');release();expect(await a).toEqual(await b);expect(new CapabilityChecks(f,async()=>{throw 0;}).list()[0]).toMatchObject({state:'verified',evidenceKind:'model-run',runId:'r_1'});
});
it('failure and wrong output cannot become verified',async()=>{
 const c=new CapabilityChecks(file(),async()=>{throw Error('Connect Codex');});expect(await c.check()).toMatchObject({state:'blocked',detail:'Connect Codex'});
 const d=new CapabilityChecks(file(),async()=>({runId:'r_2',answer:'I clicked it'}));expect((await d.check()).state).toBe('blocked');
});
it('interrupted checks become stale after restart',async()=>{
 const f=file(),c=new CapabilityChecks(f,async()=>new Promise(()=>{}));void c.check();expect(new CapabilityChecks(f,async()=>{throw 0;}).list()[0]?.state).toBe('stale');c.cancel();
});
it('user observations cannot forge model or native evidence',()=>{
 const c=new CapabilityChecks(file(),async()=>{throw 0;});expect(()=>c.observe('codex' as never,true)).toThrow();expect(c.observe('speaker',true)).toMatchObject({evidenceKind:'user-observed',state:'verified'});
});
it('cancels without accepting a late success',async()=>{
 let release!:(v:{runId:string;answer:string})=>void;const c=new CapabilityChecks(file(),()=>new Promise(r=>release=r));const p=c.check();c.cancel();release({runId:'r_late',answer:'SHUA_READY'});expect((await p).state).toBe('blocked');
});
it('retains source run linkage when a started check fails',async()=>{
 const c=new CapabilityChecks(file(),async(_signal,started)=>{started('r_failed');throw Error('rate limited');});expect(await c.check()).toMatchObject({state:'blocked',runId:'r_failed'});
});
