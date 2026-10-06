/**
 * Hand work to the crew in one place: type what you need, and the member it's for lights up (from what they're for).
 * Tap another face to override, or send to whoever fits. Opens the session it starts.
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowUp, Sparkles } from "lucide-react";
import type { CrewMember } from "@shuacrew/core/projections";
import { api } from "../lib/api";
import { Glyph } from "../lib/glyphs";

export function CrewDispatch({ members, text, setText, picked, setPicked, match }: {
  members: CrewMember[]; text: string; setText: (t: string) => void; picked: string | null; setPicked: (id: string | null) => void; match: CrewMember | null;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const to = members.find((m) => m.id === picked) ?? match;
  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true); setError("");
    try {
      const r = to ? await api<{ run: string }>(`/api/crew/${to.id}/talk`, { body: { text } }).then((x) => x.run)
        : await api<{ id: string }>("/api/runs", { body: { ask: text } }).then((x) => x.id);
      setText(""); setPicked(null);
      void navigate({ to: "/sessions/$id", params: { id: r } });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <section className="cd" aria-label="Hand work to the crew" style={to ? { "--member": to.color } as React.CSSProperties : undefined}>
    <div className="cd-box">
      <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Hand something to the crew… e.g. “compare three competitors' pricing” or “fix the upload bug”"
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} aria-label="What should the crew do?" />
      <div className="cd-row">
        <div className="cd-faces" role="radiogroup" aria-label="Who takes it">
          {members.map((m) => <button key={m.id} type="button" role="radio" aria-checked={to?.id === m.id} title={`${m.name} · ${m.role}`} style={{ "--member": m.color } as React.CSSProperties}
            className={`cd-face${to?.id === m.id ? " is-on" : ""}${!picked && match?.id === m.id ? " is-match" : ""}`} onClick={() => setPicked(picked === m.id ? null : m.id)}>
            <Glyph name={m.emoji} fallback={m.id} label={m.name} size={15} />
          </button>)}
        </div>
        <span className="cd-to">{to ? <><b>{to.name}</b> {picked ? "takes it" : <span className="cd-why"><Sparkles size={11} /> fits best</span>}</> : text.trim() ? "The crew picks who" : ""}</span>
        <button type="button" className="cd-send" disabled={!text.trim() || busy} onClick={() => void send()} aria-label="Send"><ArrowUp size={16} strokeWidth={2.5} /></button>
      </div>
    </div>
    {error && <p className="cd-error">{error}</p>}
  </section>;
}
