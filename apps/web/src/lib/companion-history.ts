export interface ConversationLink { run: string; first: string }
export interface CompanionConversation extends ConversationLink { runtime?: string; model?: string; rules?: string; previous?: ConversationLink[] }
/** A provider/context rollover changes the execution session, not the user's visible conversation. */
export function priorConversations(current: CompanionConversation | null): ConversationLink[] {
 if (!current) return [];
 const entries=[...(current.previous??[]),{run:current.run,first:current.first}];
 return entries.filter((v,i)=>entries.findIndex(x=>x.run===v.run)===i);
}
export function firstUserAsk(prompt: string) {
 const marker="\nThe user says: ";const i=prompt.lastIndexOf(marker);
 return (i>=0?prompt.slice(i+marker.length):prompt.replace(/^<spark-system>\n[\s\S]*?\n<\/spark-system>\n?/,"")).split("\n\n[screen]")[0]!.split("\n\n[attachments]")[0]!.split("\n\nAttached files:")[0]!.split("\nAttached files:")[0]!;
}

import type { AnyEvent } from "@shuacrew/core";
export function conversationMessages(convo: CompanionConversation | null, events: Record<string, AnyEvent[] | undefined>) {
 const out: Array<{who:"you"|"spark";text:string;key:string;id?:number;live?:boolean}> = [];
 for(const history of priorConversations(convo)) {
  out.push({who:"you",text:firstUserAsk(history.first),key:`${history.run}:first`});
  let streaming="", firstDelta:number|undefined, ended=false;
  for(const e of events[history.run]??[]) {
   if(e.kind==="turn.started") ended=false;
   if(e.kind==="run.followup") {
    streaming="";firstDelta=undefined;ended=false;
    const text=e.body.text.replace(/^<spark-system>\n[\s\S]*?\n<\/spark-system>\n?/,"");
    if(/^\[(guide|act|mail|zoom|check)\]/.test(text))continue;
    out.push({who:"you",text:text.split("\n\n[screen]")[0]!.split("\n\n[attachments]")[0]!.split("\n\n[app]")[0]!,key:`${history.run}:user:${e.seq}`});
   } else if(e.kind==="agent.delta") {
    // A piece recorded just after its turn ended (a cancel races the stream) belongs to the reply that just finished.
    const last=out.at(-1);
    if(ended&&last?.who==="spark"){last.text+=e.body.text;continue;}
    firstDelta??=e.seq;streaming+=e.body.text;
   }
   else if(e.kind==="agent.message") {out.push({who:"spark",text:e.body.text,id:e.seq,key:`${history.run}:${firstDelta??e.seq}`});streaming="";firstDelta=undefined;ended=true;}
   // A turn that ended without its final message (interrupted, failed, the app quit mid-reply): what streamed is all
   // there is. Keep it as a finished reply; left "live", the notch showed it typing forever, even after a relaunch.
   else if(e.kind==="turn.completed"||e.kind==="error.raised"||(e.kind==="run.status"&&!["running","planning","queued"].includes(e.body.status))) {
    if(streaming)out.push({who:"spark",text:streaming,key:`${history.run}:${firstDelta}`});
    streaming="";firstDelta=undefined;ended=true;
   }
  }
  if(history.run===convo?.run && streaming)out.push({who:"spark",text:streaming,live:true,key:`${history.run}:${firstDelta}`});
 }
 return out;
}
