import {expect,it} from "vitest";
import {WorkspaceTools,planUsage} from "./workspace-tools.js";
const state={profile:{goal:"Learn AWS"},courses:[{id:"course",title:"AWS",lessons:[{title:"IAM",summary:"Roles",done:false,run:"lesson"},{title:"S3",done:false}]}]};
const tool=()=>new WorkspaceTools({get:()=>state,due:()=>[{id:"q",track:"aws",front:"What is IAM?",back:"Identity",due:0,source:{}}]} as never,{forRun:()=>[{kind:"run.created",body:{ask:"Hidden prompt"}},{kind:"agent.message",body:{final:true,text:"Use least privilege."}}]} as never,async()=>planUsage({rateLimits:{planType:"pro",primary:{usedPercent:25,resetsAt:100}}},1));
it("reads real learning content separately from navigation and hides internal prompts",async()=>{
 expect(await tool().call("get_learning_state",{})).toContain("Learn AWS");
 const lesson=JSON.parse(await tool().call("read_lesson",{course:"course",lesson:0}));
 expect(lesson.content).toBe("Use least privilege.");expect(JSON.stringify(lesson)).not.toContain("Hidden prompt");
 expect(JSON.parse(await tool().call("read_lesson",{course:"course",lesson:1})).status).toBe("not_generated");
});
it("rejects stale targets and invalid review limits",async()=>{
 await expect(tool().call("read_lesson",{course:"missing",lesson:0})).rejects.toThrow("Course not found");
 await expect(tool().call("read_lesson",{course:"course",lesson:-1})).rejects.toThrow("Lesson index");
 await expect(tool().call("get_due_reviews",{limit:-1})).rejects.toThrow("limit");
 expect(JSON.parse(await tool().call("get_due_reviews",{})).cards[0].question).toBe("What is IAM?");
});
it("reports usage units and unavailable billing honestly",()=>{
 const result=planUsage({rateLimits:{planType:"pro",primary:{usedPercent:25,resetsAt:100}},ordinaryUsageAllowed:false},1);
 expect(result).toMatchObject({plan:"pro",primary:{remainingPercent:75,resetTimeUnit:"unix_seconds"},billingAmount:null,absoluteTokenLimit:null,ordinaryUsageAllowed:false});
 expect(()=>planUsage({})).toThrow("unavailable");
 expect(planUsage({rateLimits:{}}).primary).toBeNull();
});
