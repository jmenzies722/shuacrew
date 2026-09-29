import { useEffect, useState } from "react";
import { Plug, Sparkles, X } from "lucide-react";
import { api } from "../lib/api";
import "./recommendations.css";

/**
 * In the chat: the connections and skills that would make this ask go better — only ones you don't have yet. One
 * tap connects (signing in through your browser when the service uses OAuth) or installs the skill. Dismissed ones
 * stay dismissed, so it never nags.
 */
type McpRec = { kind: "mcp"; id: string; title: string; blurb: string; oauth: boolean; why: string };
type SkillRec = { kind: "skill"; name: string; description: string; why: string };
const KEY = "shuacrew.recs.dismissed";
const dismissed = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]; } catch { return []; } };

export function Recommendations({ ask }: { ask: string }) {
  const [recs, setRecs] = useState<Array<McpRec | SkillRec>>([]);
  const [state, setState] = useState<Record<string, "working" | "done" | { error: string }>>({});
  const [hidden, setHidden] = useState(dismissed);
  useEffect(() => {
    setRecs([]); if (ask.trim().length < 12) return;
    let alive = true;
    void api<{ mcp: McpRec[]; skills: SkillRec[] }>("/api/recommend", { body: { ask } }).then((r) => { if (alive) setRecs([...r.mcp, ...r.skills]); }).catch(() => {});
    return () => { alive = false; };
  }, [ask]);
  const key = (r: McpRec | SkillRec) => (r.kind === "mcp" ? `mcp:${r.id}` : `skill:${r.name}`);
  const shown = recs.filter((r) => !hidden.includes(key(r)));
  if (!shown.length) return null;
  const dismiss = (r: McpRec | SkillRec) => { const next = [...hidden, key(r)].slice(-200); setHidden(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ } };
  const act = async (r: McpRec | SkillRec) => {
    const k = key(r); setState((s) => ({ ...s, [k]: "working" }));
    try {
      if (r.kind === "mcp") {
        const server = await api<{ id: string }>(`/api/mcp/featured/${r.id}`, { body: {} });
        if (r.oauth) await api(`/api/mcp/${server.id}/signin`, { body: {} }); // opens the service's sign-in in your browser
      } else await api("/api/skills/install", { body: { name: r.name } });
      setState((s) => ({ ...s, [k]: "done" }));
    } catch (e) { setState((s) => ({ ...s, [k]: { error: (e as Error).message.replace(/^\d+\s*/, "") } })); }
  };
  return <div className="recs" aria-label="Works better with">
    <small className="recs-head">Works better with</small>
    {shown.map((r) => {
      const k = key(r), st = state[k];
      return <div key={k} className="recs-row">
        <i className={`recs-icon is-${r.kind}`}>{r.kind === "mcp" ? <Plug size={13} /> : <Sparkles size={13} />}</i>
        <span className="recs-text"><b>{r.kind === "mcp" ? r.title : r.name}</b><small>{st && typeof st === "object" ? st.error : r.kind === "mcp" ? `${r.why} · ${r.blurb}` : r.description}</small></span>
        {st === "done" ? <em className="recs-done">{r.kind === "mcp" ? (r.oauth ? "Finish sign-in in your browser" : "Connected") : "Added"}</em>
          : <button type="button" className="recs-go" disabled={st === "working"} onClick={() => void act(r)}>{st === "working" ? "…" : r.kind === "mcp" ? (r.oauth ? "Connect & sign in" : "Connect") : "Add skill"}</button>}
        <button type="button" className="recs-x" aria-label={`Not now: ${r.kind === "mcp" ? r.title : r.name}`} onClick={() => dismiss(r)}><X size={12} /></button>
      </div>;
    })}
  </div>;
}
