import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, Layers3, Pin, RotateCcw, X } from "lucide-react";
import { lessonFocus, type ArchitectureLesson } from "../lib/notch-lesson";
import { narrationFocus, type NarrationIdentity } from "../lib/lesson-narration";
import { ArchitectureDiagram } from "./ArchitectureDiagram";
import "./architecture-card.css";

export function ArchitectureCard({ lesson, caption = "", narration, compact = false, onReplay, onPin, onClose, onFollowup, onPrevious }: {
  lesson: ArchitectureLesson; caption?: string; narration?: NarrationIdentity; compact?: boolean; onReplay?: (text: string, identity?: NarrationIdentity) => void; onPin?: () => void; onClose?: () => void; onFollowup?: (text: string) => void; onPrevious?: () => void;
}) {
  const [manualPage, setPage] = useState(0), [answer, setAnswer] = useState<number | null>(null), [expanded, setExpanded] = useState(false), [follow, setFollow] = useState(true), [group, setGroup] = useState("");
  const audibleStep = narrationFocus(lesson, narration);
  const playbackPage = lesson.steps.findIndex(step => step.id === audibleStep.stepId) + 1;
  useEffect(() => { if (follow && playbackPage > 0) setPage(playbackPage); }, [follow, playbackPage]);
  const page = follow && playbackPage > 0 ? playbackPage : manualPage;
  const navigate = (next: number) => { setFollow(false); setPage(next); setAnswer(null); };
  const examplePage = lesson.steps.length + 1, lastPage = examplePage + (lesson.quiz ? 1 : 0);
  const step = page > 0 && page < examplePage ? lesson.steps[page - 1] : undefined;
  const quiz = page > examplePage ? lesson.quiz : undefined;
  const title = step?.title ?? (quiz ? "Check your understanding" : page === examplePage ? "A concrete example" : "The big picture");
  const body = step?.body ?? (quiz ? quiz.question : page === examplePage ? lesson.example : lesson.summary);
  const audible = narration ? audibleStep.nodes : lessonFocus(lesson.nodes, caption), focused = follow && audible.length ? audible : step?.focus ?? [];
  const focusedEdges = follow && audibleStep.stepId ? audibleStep.edges : step?.edgeFocus ?? [];
  const groups = [...new Set(lesson.nodes.map(node => node.group).filter((value): value is string => !!value))];
  return <article className={`architecture-card ${expanded ? "is-expanded" : ""}`} aria-label={lesson.title}>
    <header><span><Layers3 size={13} /> CONCEPT STUDIO</span><div>
      {onPin && <button type="button" aria-label="Pin lesson to main window" title="Pin to Visual teaching" onClick={onPin}><Pin size={14} /></button>}
      {onClose && <button type="button" aria-label="Dismiss lesson" onClick={onClose}><X size={14} /></button>}
    </div></header>
    <h3>{lesson.title}</h3>
    <p className="architecture-scope">{lesson.scope || "Proposed teaching example"}</p>
    {groups.length > 1 && <nav className="architecture-paths" aria-label="Architecture paths"><button type="button" aria-pressed={!group} onClick={() => setGroup("")}>Overview</button>{groups.map(path => <button type="button" key={path} aria-pressed={group === path} onClick={() => setGroup(path)}>{path}</button>)}</nav>}
    <ArchitectureDiagram lesson={lesson} group={group || undefined} focused={focused} edgeFocus={focusedEdges} maxHeight={compact ? 190 : 300} />
    <div className="architecture-connections" aria-label="Connections">
      {lesson.edges.map((edge, index) => <span key={index} data-focused={focused.includes(edge.from) || focused.includes(edge.to)}>{lesson.nodes.find(node => node.id === edge.from)?.label} → {lesson.nodes.find(node => node.id === edge.to)?.label}{edge.label ? `: ${edge.label}` : ""}</span>)}
    </div>
    <section className="architecture-explanation" aria-live="polite"><small>{page === 0 ? "OVERVIEW" : quiz ? "OPTIONAL CHECK" : page === examplePage ? "IN PRACTICE" : `HOW IT WORKS · ${page}/${lesson.steps.length}`}</small><h4>{title}</h4><p>{body}</p>
      {quiz && <div className="architecture-quiz">{quiz.options.map((option, index) => <button type="button" key={index} aria-pressed={answer === index} onClick={() => setAnswer(index)}>{answer === index && <Check size={12} />}{option}</button>)}{answer !== null && <p role="status">{answer === quiz.answer ? "Exactly." : "Not quite. Try another answer."}{answer === quiz.answer && quiz.why ? ` ${quiz.why}` : ""}</p>}</div>}
    </section>
    {expanded && <div className="architecture-details"><ol>{lesson.steps.map((item, index) => <li key={index}><strong>{item.title}</strong><p>{item.body}</p></li>)}</ol>{([["Assumptions", lesson.assumptions], ["Trade-offs", lesson.tradeoffs], ["Failure handling", lesson.failureModes]] as const).map(([label, items]) => !!items?.length && <section key={label}><h4>{label}</h4><ul>{items.map(item => <li key={item}>{item}</li>)}</ul></section>)}{!!lesson.sources?.length && <section><h4>Sources · check coverage of each claim</h4>{lesson.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title}</a>)}</section>}</div>}
    <footer><button type="button" aria-label="Previous lesson step" disabled={page === 0} onClick={() => navigate(page - 1)}><ArrowLeft size={14} /></button><span>{page + 1} / {lastPage + 1}</span><button type="button" aria-label="Next lesson step" disabled={page === lastPage} onClick={() => navigate(page + 1)}><ArrowRight size={14} /></button><div />
      <button type="button" aria-pressed={follow} onClick={() => { setPage(page); setFollow(current => !current); }}>Follow voice</button>
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded(current => !current)}><BookOpen size={13} />{expanded ? "Less" : "Details"}</button>
      {onReplay && <button type="button" aria-label="Replay this explanation" onClick={() => onReplay(body, step?.id && lesson.id ? { lessonId: lesson.id, revision: lesson.revision ?? 1, stepId: step.id } : undefined)}><RotateCcw size={13} />Replay</button>}
    </footer>
    {(onPrevious || onFollowup) && <div className="architecture-followups">{onPrevious && <button type="button" onClick={onPrevious}>Previous version</button>}{onFollowup && (lesson.followups?.length ? lesson.followups : ["Simplify this architecture", "Walk one request through this design", "What fails first in this design?"]).map(text => <button type="button" key={text} onClick={() => onFollowup(text)}>{text}</button>)}</div>}
  </article>;
}
