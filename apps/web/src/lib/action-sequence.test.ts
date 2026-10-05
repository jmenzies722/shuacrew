import {expect,it,vi} from "vitest";
import {actionSequence} from "./action-sequence";
it("stops dependent commands at the first failure",async()=>{
 const execute=vi.fn(async(a:string)=>({ok:a!=="open",message:a}));const receipts=[];
 for await(const step of actionSequence(["open","type","save"],execute,()=>true))receipts.push(step);
 expect(execute).toHaveBeenCalledTimes(1);expect(receipts).toHaveLength(1);
 expect(receipts[0]?.result.ok).toBe(false);
});
it("preserves exact commands and order and honors cancellation between steps",async()=>{
 let active=true;const execute=vi.fn(async(a:string)=>({ok:true,message:a}));const receipts=[];
 for await(const step of actionSequence(["Type EXACT text","Press Return"],execute,()=>active)){receipts.push(step);active=false;}
 expect(execute).toHaveBeenCalledWith("Type EXACT text",0);expect(execute).toHaveBeenCalledTimes(1);
});
