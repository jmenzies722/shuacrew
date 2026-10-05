import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, GraduationCap } from "lucide-react";
import { api } from "../lib/api";
type Roadmap = {id:string;goal:string;title:string;milestones:Array<{title:string;why:string;project:string;skills:string[];weeks:number;done:boolean}>};
export function LearningProjects({onChoose}:{onChoose:(project:{name:string;pitch:string;goal:string;color:string})=>void}) {
  const [roads,setRoads]=useState<Roadmap[]>([]),[error,setError]=useState("");
  useEffect(()=>{let alive=true;void api<{roadmaps:Roadmap[]}>("/api/learning").then(s=>{if(alive)setRoads(s.roadmaps);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[]);
  const road=roads.at(-1), suggestions=road?.milestones.filter(m=>m.project&&!m.done)??[];
  return <section className="learning-projects"><header><div><span className="studio-eyebrow"><GraduationCap size={13}/> BUILD WHAT YOU LEARN</span><h2>Recommended projects</h2><p>From your learning roadmap. Choose an idea to review it as a project.</p></div><Link to="/learn">Your learning path <ArrowUpRight size={13}/></Link></header>{error?<p role="alert">Recommendations could not load: {error}</p>:suggestions.length?<div className="learning-project-grid">{suggestions.slice(0,3).map((m,i)=><article key={i}><small>{road!.title||road!.goal}</small><h3>{m.title}</h3><p>{m.project}</p><div>{m.skills.map(skill=><span key={skill}>{skill}</span>)}</div><small>{m.weeks} week{m.weeks===1?"":"s"} suggested in your roadmap</small><button onClick={()=>onChoose({name:m.title,pitch:m.project,goal:`Learning roadmap ${road!.id}: ${road!.goal}\n${m.why}\nSkills: ${m.skills.join(", ")}`,color:"#9aaeff"})}>Review project idea <ArrowUpRight size={13}/></button></article>)}</div>:<p className="studio-muted">{road?"No unfinished project milestones in your roadmap.":"Create a roadmap in Learning to get projects tied to your goals."}</p>}</section>;
}
