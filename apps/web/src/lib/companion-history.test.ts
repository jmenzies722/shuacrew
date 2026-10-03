import {expect,it} from "vitest";
import {priorConversations,firstUserAsk} from "./companion-history";
it("retains ordered history across provider/context rollovers without duplicating runs",()=>{
 const a={run:"a",first:"First ask"};const b={run:"b",first:"Second ask",previous:priorConversations(a)};
 expect(priorConversations(b)).toEqual([a,{run:"b",first:"Second ask"}]);
 expect(priorConversations({...b,previous:[a,a]})).toHaveLength(2);
 expect(firstUserAsk('system\nThe user says: Show me Settings\n\n[attachments] image')).toBe("Show me Settings");
});

it("keeps action keys stable when history loads or a streamed message finishes", async()=>{
 const {conversationMessages}=await import("./companion-history");
 const convo={run:"b",first:"Next",previous:[{run:"a",first:"First"}]};
 const delta={kind:"agent.delta",seq:20,body:{text:"Hello"}};
 const message={kind:"agent.message",seq:21,body:{text:"Hello"}};
 const live=conversationMessages(convo,{b:[delta]} as never).at(-1)!;
 const complete=conversationMessages(convo,{a:[{kind:"agent.message",seq:1,body:{text:"Old"}}],b:[delta,message]} as never).at(-1)!;
 expect(live.key).toBe("b:20");expect(complete.key).toBe(live.key);expect(complete.id).toBe(21);
});

it("finishes a reply whose turn ended without a final message, so the notch never shows it typing forever", async()=>{
 const {conversationMessages}=await import("./companion-history");
 const ev=(seq:number,kind:string,body:unknown)=>({seq,ts:seq,run:"a",kind,body}) as never;
 const convo={run:"a",first:"Count to 100"};
 const cut=[ev(1,"turn.started",{turn:1}),ev(2,"agent.delta",{text:"one, two"}),ev(3,"agent.delta",{text:", three"})];
 expect(conversationMessages(convo,{a:cut}).at(-1)).toMatchObject({text:"one, two, three",live:true}); // still streaming
 for (const end of [ev(4,"turn.completed",{turn:1,route:{runtime:"claude",model:"m"}}),ev(4,"error.raised",{message:"x"}),ev(4,"run.status",{status:"idle"})]) {
  const last=conversationMessages(convo,{a:[...cut,end]}).at(-1)!;
  expect(last.text).toBe("one, two, three"); expect(last.live).toBeUndefined();
 }
 expect(conversationMessages(convo,{a:[...cut,ev(4,"run.status",{status:"running"})]}).at(-1)!.live).toBe(true); // still going
});

it("a piece that lands just after a cancel joins the reply it belongs to, not a new 'typing' one", async()=>{
 const {conversationMessages}=await import("./companion-history");
 const ev=(seq:number,kind:string,body:unknown)=>({seq,ts:seq,run:"a",kind,body}) as never;
 const log=[ev(1,"turn.started",{turn:1}),ev(2,"agent.delta",{text:"ninety-nine"}),ev(3,"run.status",{status:"cancelled",reason:"cancelled by you"}),ev(4,"agent.delta",{text:", one hundred"})];
 const msgs=conversationMessages({run:"a",first:"Count"},{a:log});
 expect(msgs.at(-1)).toMatchObject({who:"spark",text:"ninety-nine, one hundred"}); expect(msgs.at(-1)!.live).toBeUndefined();
 // The next turn streams live again.
 const next=conversationMessages({run:"a",first:"Count"},{a:[...log,ev(5,"run.followup",{text:"again"}),ev(6,"turn.started",{turn:2}),ev(7,"agent.delta",{text:"one"})]});
 expect(next.at(-1)).toMatchObject({text:"one",live:true});
});
