import type { Learning } from "./learning.js";
import type { EventStore } from "./store.js";

export const WORKSPACE_TOOLS = [
 {name:"get_learning_state",description:"Read the user's current learning goal, courses, lesson progress and number of reviews due. No navigation or generation.",inputSchema:{type:"object",properties:{},additionalProperties:false}},
 {name:"read_lesson",description:"Read an existing lesson by course id and zero-based lesson index from get_learning_state. Does not open the UI or generate missing content.",inputSchema:{type:"object",properties:{course:{type:"string"},lesson:{type:"integer",minimum:0}},required:["course","lesson"],additionalProperties:false}},
 {name:"get_due_reviews",description:"Read due review questions and answers from the learner's actual deck. Does not grade or change progress.",inputSchema:{type:"object",properties:{limit:{type:"integer",minimum:1,maximum:50}},additionalProperties:false}},
 {name:"get_plan_usage",description:"Read provider-reported Codex plan usage percentages, limits and reset times. Does not infer billing amounts, absolute token limits, or Claude usage.",inputSchema:{type:"object",properties:{},additionalProperties:false}},
];

export class WorkspaceTools {
 constructor(private learning:Learning,private store:EventStore,private usage:()=>Promise<unknown>){}
 async call(name:string,args:Record<string,unknown>):Promise<string>{
  const now=Date.now();
  if(name==="get_plan_usage")return JSON.stringify(await this.usage());
  const state=this.learning.get();
  if(name==="get_learning_state")return JSON.stringify({source:"ShuaCrew Learning",readAt:now,profile:state.profile,totalCourses:state.courses.length,courses:state.courses.map(c=>({id:c.id,title:c.title||c.topic,lessons:c.lessons.map((l,index)=>({index,title:l.title,summary:l.summary,done:l.done,run:l.run}))})),due:this.learning.due(now).length});
  if(name==="read_lesson"){
   const course=state.courses.find(c=>c.id===args.course),index=args.lesson;
   if(!course)throw Error("Course not found. Refresh get_learning_state and use a current course id.");
   if(typeof index!=="number"||!Number.isSafeInteger(index)||index<0||!course.lessons[index])throw Error("Lesson index not found in this course.");
   const lesson=course.lessons[index]!;
   const messages=lesson.run?this.store.forRun(lesson.run).filter(e=>e.kind==="agent.message"&&e.body.final):[];
   const latest=messages.at(-1);const content=latest?.kind==="agent.message"?latest.body.text:"";
   return JSON.stringify({source:"ShuaCrew Learning",readAt:now,course:course.id,index,...lesson,status:content?"available":"not_generated",content:content.slice(0,30000),truncated:content.length>30000});
  }
  if(name==="get_due_reviews"){
   const limit=args.limit===undefined?10:args.limit;
   if(typeof limit!=="number"||!Number.isSafeInteger(limit)||limit<1||limit>50)throw Error("limit must be an integer from 1 to 50.");
   const due=this.learning.due(now);return JSON.stringify({source:"ShuaCrew Learning",readAt:now,total:due.length,cards:due.slice(0,limit).map(c=>({id:c.id,track:c.track,question:c.front,answer:c.back,due:c.due,source:c.source}))});
  }
  throw Error(`Unknown workspace tool ${name}`);
 }
}

/** Provider rate windows are percentages, not a bill or an absolute token allowance. */
export function planUsage(result:Record<string,any>,readAt=Date.now()){
 const single=result.rateLimits;
 if(!single || typeof single!=="object")throw Error("Provider usage unavailable; no rate-limit snapshot was returned.");
 const window=(w:any)=>w&&typeof w.usedPercent==="number"&&Number.isFinite(w.usedPercent)?{usedPercent:w.usedPercent,percentageLimit:100,remainingPercent:Math.max(0,100-w.usedPercent),windowDurationMins:typeof w.windowDurationMins==="number"?w.windowDurationMins:null,resetsAt:typeof w.resetsAt==="number"?w.resetsAt:null,resetTimeUnit:"unix_seconds"}:null;
 const bucket=(b:any)=>({plan:typeof b.planType==="string"?b.planType:null,primary:window(b.primary),secondary:window(b.secondary)});
 return {source:"Codex account/rateLimits/read",readAt,...bucket(single),ordinaryUsageAllowed:typeof result.ordinaryUsageAllowed==="boolean"?result.ordinaryUsageAllowed:null,buckets:Object.fromEntries(Object.entries(result.rateLimitsByLimitId??{}).filter(([,v])=>v&&typeof v==="object").map(([id,b])=>[id,bucket(b)])),billingAmount:null,absoluteTokenLimit:null,note:"Provider usage windows only. Invoice amounts, absolute token allowances and other providers' billing are unavailable through this tool."};
}
