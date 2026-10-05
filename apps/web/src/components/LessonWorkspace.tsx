import { teachingApi } from "../lib/teaching";
import { lessonMessages } from "../lib/lesson-messages";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { AnyEvent } from "@shuacrew/core/events";
import { ArrowLeft, BookOpen, Check, MessageSquare, Presentation } from "lucide-react";
import { api } from "../lib/api";
import { selectIntelligence } from "../lib/intelligence";
import { useLive } from "../lib/live";
import { Markdown } from "./Markdown";
import { Teaching } from "../screens/Teaching";
import "./lesson-workspace.css";
export function LessonWorkspace({ course, title, summary, run, done, onDone, onClose }: { course: string; title: string; summary: string; run: string; done: boolean; onDone: () => Promise<void>; onClose: () => void }) {
  const [events, setEvents] = useState<AnyEvent[]>([]), [error, setError] = useState(""), [sending, setSending] = useState(false), [view,setView] = useState<"lesson"|"visual">("lesson");
  const [answer,setAnswer] = useState(() => {try{return localStorage.getItem(`shuacrew.exercise.${run}`)??"";}catch{return "";}});
  const state = useLive(s => s.crew.runs[run]);
  const active = ["queued","running","planning","awaiting_approval"].includes(state?.status??"");
  useEffect(() => {let alive=true; const load=()=>void api<AnyEvent[]>(`/api/runs/${run}/events`).then(value=>{if(alive)setEvents(value);}).catch(e=>{if(alive)setError(e.message);});load();const timer=setInterval(load,1800);return()=>{alive=false;clearInterval(timer);};},[run]);
  const send = async (text: string) => {setSending(true);setError("");try {
    const choice = await selectIntelligence({ask:text,mode:"auto",purpose:"conversation",images:false,tier:"balanced",preferredRuntime:"codex"});
    if(!choice.runtime||!choice.model)throw new Error(choice.reason);
    await api(`/api/runs/${run}/followup`,{body:{text,selection:{runtime:choice.runtime,model:choice.model}}});
  }catch(e){setError((e as Error).message);}finally{setSending(false);}};
  const openVisual = async () => {
    setSending(true);setError("");
    try {
      let saved: string|null=null;try{saved=localStorage.getItem(`shuacrew.lessonVisual.${run}`);}catch{}
      const next=await teachingApi(saved?`/${saved}/load`:"/new",{});
      if(next.active)try{localStorage.setItem(`shuacrew.lessonVisual.${run}`,next.active);}catch{}
      setView("visual");
    }catch(e){setError((e as Error).message);}finally{setSending(false);}
  };
  return <div className="lesson-workspace"><header><button onClick={onClose}><ArrowLeft size={14}/> Learning path</button><Link to="/sessions/$id" params={{id:run}}>Source session ↗</Link></header><span className="studio-eyebrow">{course}</span><h1>{title}</h1><p className="lesson-summary">{summary}</p><nav aria-label="Lesson workspace"><button aria-pressed={view==="lesson"} onClick={()=>setView("lesson")}><BookOpen size={14}/> Lesson & practice</button><button aria-pressed={view==="visual"} disabled={sending} onClick={()=>void openVisual()}><Presentation size={14}/> Visual explanation</button></nav>
    {error&&<p role="alert" className="lx-error">{error}</p>}
    {view==="visual" ? <Teaching compact initialReference={lessonMessages(events)[0]?.text.slice(0,12000)??""} initialQuestion={`Explain ${title} visually, in the context of ${course}. ${summary}`} /> : <div className="lesson-columns"><article className="lesson-reading">{lessonMessages(events).map(m=><section key={m.turn}><Markdown text={m.text}/></section>)}{active&&<p role="status">{state?.status==="awaiting_approval"?"Open the source session to review the pending decision.":"Shua is preparing your lesson…"}</p>}{state?.status==="failed"&&<p role="alert">This lesson stopped with an error. Open the source session for details or ask Shua to try again.</p>}{!events.length&&!active&&<p>Loading your saved lesson…</p>}</article><aside className="lesson-practice"><h2>Make it stick.</h2><p>Try the exercise from the lesson. Explain your reasoning and ask for feedback.</p><textarea aria-label="Your exercise attempt" rows={9} value={answer} onChange={e=>{setAnswer(e.target.value);try{localStorage.setItem(`shuacrew.exercise.${run}`,e.target.value);}catch{/* preserve in memory */}}} placeholder="My approach, code, or explanation…"/><button disabled={active||sending||!answer.trim()} onClick={()=>void send(`Review my exercise attempt for this lesson. Explain what is correct, what needs work, and one next practice step. Do not mark mastery automatically. My attempt:\n${answer}`)}><MessageSquare size={14}/>{sending?"Sending…":"Get feedback"}</button><div className="lesson-tutor-actions">{["Explain more simply","Show another example","Quiz me on this lesson"].map(text=><button key={text} disabled={active||sending} onClick={()=>void send(text)}>{text}</button>)}</div><button disabled={active||sending} onClick={()=>{setSending(true);void onDone().catch(e=>setError(e.message)).finally(()=>setSending(false));}}><Check size={14}/>{done?"Mark as still learning":"Mark lesson complete"}</button><small>Completion tracks your progress. It does not imply mastery. Feedback is saved in the source session.</small></aside></div>}
  </div>;
}
