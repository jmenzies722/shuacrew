import { expect,it } from "vitest";
import { lessonMessages } from "./lesson-messages";
it("replaces streaming fragments with the authoritative final and keeps feedback turns",()=>{
 const events=[{kind:"agent.delta",body:{turn:1,text:"Partial"}},{kind:"agent.message",body:{turn:1,final:true,text:'Lesson\n```cards\n[{"front":"Question"}]\n```'}},{kind:"agent.delta",body:{turn:2,text:"Try "}},{kind:"agent.delta",body:{turn:2,text:"again"}}];
 expect(lessonMessages(events as never)).toEqual([{turn:1,text:"Lesson"},{turn:2,text:"Try again"}]);
});
it("does not remove ordinary code or confuse tool output for teaching",()=>{
 expect(lessonMessages([{kind:"agent.message",body:{turn:1,final:true,text:"```ts\nlet x=1\n```"}},{kind:"tool.returned",body:{text:"noise"}}] as never)).toEqual([{turn:1,text:"```ts\nlet x=1\n```"}]);
});
