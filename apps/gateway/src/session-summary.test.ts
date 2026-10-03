import { expect, it } from "vitest";
import { summaryEvidence, SessionSummaries } from "./session-summary.js";
import type { AnyEvent } from "@shuacrew/core/events";
const events = [
 {seq:1,kind:"turn.started",body:{turn:1,text:"Old request"}},
 {seq:2,kind:"agent.message",body:{turn:1,final:true,text:"Old result"}},
 {seq:3,kind:"turn.started",body:{turn:2,text:"Fix login"}},
 {seq:4,kind:"agent.message",body:{turn:2,final:true,text:"Fixed login. Browser verification remains."}},
 {seq:5,kind:"check.ran",body:{command:"pnpm test",exitCode:0,output:"42 passed"}},
] as AnyEvent[];
it("grounds summaries in only the current request and preserves verification evidence",()=>{
 const evidence=summaryEvidence(events,"reviewing","Login");
 expect(evidence).toContain("Fixed login"); expect(evidence).toContain("Browser verification remains");
 expect(evidence).toContain('"exitCode":0'); expect(evidence).not.toContain("Old result");
});
it("coalesces simultaneous summaries for one result without repeating model work",async()=>{
 let calls=0; const summaries=new SessionSummaries(async()=>{calls++; return {summary:"The login fix is ready. Tests passed, but browser verification is still needed."};});
 const result=await Promise.all([summaries.get("a:5", "evidence"),summaries.get("a:5","evidence")]);
 expect(calls).toBe(1);expect(result[0]).toContain("browser verification");expect(result[1]).toBe(result[0]);
});
it("rejects raw command blocks and oversized spoken responses",async()=>{
 for(const summary of ["```sh\nrm -rf temp\n```","x".repeat(801)]) {
  const summaries=new SessionSummaries(async()=>({summary}));
  await expect(summaries.get("a", "evidence")).rejects.toThrow();
 }
});
