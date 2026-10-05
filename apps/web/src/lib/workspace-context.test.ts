import { expect, it, vi } from "vitest";
import { workspaceContext } from "./workspace-context";
const course = { id: "c1", title: "Cloud engineering", topic: "Cloud", lessons: [{title:"Queues",summary:"Backpressure",done:false,run:"lesson1"}] };
it("refreshes courses and visual state and reads the selected lesson", async () => {
  const read = vi.fn(async (path: string) => path === "/api/learning" ? {courses:[course],profile:{goal:"Ship reliable apps",tracks:[]},due:2} : path === "/api/teaching" ? {document:{title:"Queue design",stepId:"s1",steps:[{id:"s1",title:"Buffer",text:"Absorb spikes"}],objects:[],answer:"Use a queue"}} : [{kind:"agent.message",body:{final:true,turn:1,text:"A queue decouples producers."}}]);
  const result = await workspaceContext(read, {path:"/learn",at:100}, {course:"c1",index:0,run:"lesson1"});
  expect(result).toContain("Cloud engineering"); expect(result).toContain("A queue decouples producers"); expect(result).toContain("Absorb spikes");
  expect(result).toContain('"tracks":[]'); expect(result).not.toContain("No learning");
  await workspaceContext(read, null, null);
  expect(read.mock.calls.filter(([p])=>p === "/api/learning")).toHaveLength(2);
});
it("distinguishes unavailable data from an empty workspace and ignores stale selected lessons", async () => {
  const read = vi.fn(async (path:string) => {if(path === "/api/learning") return {courses:[],profile:{}};throw Error("offline");});
  const result=await workspaceContext(read,null,{course:"deleted",index:0,run:"old"});
  expect(result).toContain("Visual workspace unavailable"); expect(result).toContain('"courses":[]'); expect(read).not.toHaveBeenCalledWith("/api/runs/old/events");
});
it("reports assistant-enabled MCPs without exposing connection commands or credentials", async () => {
 const read=async(path:string)=>path==="/api/mcp"?[{id:"notes",name:"Notes",spark:true,auth:"oauth",signedIn:true,url:"https://private.invalid/?token=secret",args:["private-token"]},{id:"crew",name:"Crew only",spark:false,auth:"none",signedIn:false}]:path==="/api/learning"?{courses:[],profile:{}}:{document:null};
 const result=await workspaceContext(read,null,null);
 expect(result).toContain('"name":"Notes"');expect(result).toContain('"assistantEnabled":true');
 expect(result).toContain('"assistantEnabled":false');expect(result).not.toContain("private-token");expect(result).not.toContain("private.invalid");
});
