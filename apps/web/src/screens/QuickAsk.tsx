import { ArrowUp, Check, CornerDownLeft, Hand, ShieldCheck, Sparkles, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api, decideApproval } from "../lib/api";
import { useLive } from "../lib/live";
import { quickClose, quickOpen, quickResize } from "../lib/native";

/**
 * ⌥Space: hand the crew something from anywhere, or clear what's waiting on you. Enter sends,
 * ⌘Enter sends and opens it, Esc closes. "@name" hands it to a crew member; otherwise the crew
 * routes it to whoever it's for.
 */
export function QuickAsk() {
  const members = useLive((s) => s.crew.members);
  const plays = useLive((s) => s.crew.plays);
  const approvals = useLive((s) => s.crew.approvals);
  const runs = useLive((s) => s.crew.runs);
  const [text, setText] = useState("");
  const [member, setMember] = useState("");
  const [suggested, setSuggested] = useState("");
  const [pick, setPick] = useState(0);
  const [sent, setSent] = useState<{ id: string; to?: string } | null>(null);
  const [error, setError] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  const box = useRef<HTMLDivElement>(null);

  const reset = () => {
    setText("");
    setMember("");
    setSent(null);
    setError("");
    field.current?.focus();
  };
  useEffect(() => {
    field.current?.focus();
    const open = () => (reset(), setTimeout(() => field.current?.focus(), 30));
    window.addEventListener("shuacrew:quick-open", open);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && quickClose();
    window.addEventListener("keydown", esc);
    return () => (window.removeEventListener("shuacrew:quick-open", open), window.removeEventListener("keydown", esc));
  }, []);

  // The panel fits what's in it.
  useLayoutEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(() => quickResize(Math.ceil(box.current!.getBoundingClientRect().height)));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  const mention = /^@(\w*)$/.exec(text.trim());
  const options = useMemo(
    () => (mention ? Object.values(members).filter((m) => `${m.name} ${m.role}`.toLowerCase().includes(mention[1]!.toLowerCase())) : []),
    [mention?.[1], members],
  );
  useEffect(() => {
    if (member || text.trim().length < 12 || !Object.keys(members).length) return setSuggested("");
    const t = setTimeout(() => void api<{ member: string | null }>(`/api/crew/route?ask=${encodeURIComponent(text)}`).then((r) => setSuggested(r.member ?? "")).catch(() => undefined), 300);
    return () => clearTimeout(t);
  }, [text, member, members]);

  const to = member || suggested;
  const send = async (open: boolean) => {
    const ask = text.trim();
    if (!ask) return;
    setError("");
    try {
      const { id } = await api<{ id: string }>("/api/runs", { body: { ask, member: to || undefined } });
      if (open) return quickOpen(`/sessions/${id}`);
      setSent({ id, to: to ? members[to]?.name : undefined });
      setText("");
      setMember("");
      setTimeout(() => quickClose(), 1400);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const gates = Object.values(plays).filter((p) => p.status === "waiting");
  const asks = Object.values(approvals);
  const who = to ? members[to] : undefined;

  return (
    <div ref={box} className="quick">
      <div className="quick-input">
        {who ? (
          <button className="quick-who" style={{ "--member": who.color } as React.CSSProperties} onClick={() => (setMember(""), setSuggested(""))} title={member ? "Remove" : "Suggested — click to clear"}>
            <span>{who.emoji}</span> {who.name}
            {!member && <span className="opacity-60">?</span>}
            <X size={11} className="opacity-60" />
          </button>
        ) : (
          <Sparkles size={18} className="mt-0.5 shrink-0 text-fg-3" />
        )}
        <textarea
          ref={field}
          rows={1}
          value={text}
          onChange={(e) => (setText(e.target.value), setPick(0), setSent(null))}
          onKeyDown={(e) => {
            if (options.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
              e.preventDefault();
              setPick((i) => (i + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
              return;
            }
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (options.length) {
                setMember(options[pick]!.id);
                setText("");
              } else void send(e.metaKey);
            }
          }}
          placeholder="Ask the crew anything…   @ to pick who"
          aria-label="Ask the crew"
          className="quick-field"
        />
        <button className="quick-send" onClick={() => void send(false)} disabled={!text.trim()} aria-label="Send">
          <ArrowUp size={15} strokeWidth={2.5} />
        </button>
      </div>

      {options.length > 0 && (
        <div className="quick-list">
          {options.map((m, i) => (
            <button key={m.id} className={`quick-row ${i === pick ? "is-on" : ""}`} onMouseEnter={() => setPick(i)} onClick={() => (setMember(m.id), setText(""), field.current?.focus())}>
              <span className="text-[15px]">{m.emoji}</span>
              <span className="font-medium text-fg">{m.name}</span>
              <span className="text-fg-3">{m.role}</span>
            </button>
          ))}
        </div>
      )}

      {sent && (
        <div className="quick-sent">
          <Check size={14} className="text-ok" /> Sent{sent.to ? ` to ${sent.to}` : ""}.
          <button className="ml-auto text-fg-2 hover:text-fg" onClick={() => quickOpen(`/sessions/${sent.id}`)}>
            Open →
          </button>
        </div>
      )}
      {error && <div className="quick-sent text-bad">{error}</div>}

      {!options.length && (gates.length > 0 || asks.length > 0) && (
        <div className="quick-list">
          <div className="quick-head">Needs you</div>
          {gates.slice(0, 4).map((p) => {
            const index = p.phases.findIndex((x) => x.status === "review");
            const phase = p.phases[index];
            return (
              <div key={p.id} className="quick-row is-static">
                <Hand size={13} className="shrink-0 text-amber" />
                <button className="min-w-0 flex-1 truncate text-left" onClick={() => quickOpen(`/plays/${p.id}`)}>
                  <span className="text-fg">{phase?.name ?? "Review"}</span> <span className="text-fg-3">· {p.title}</span>
                </button>
                {phase && (
                  <button className="quick-act" onClick={() => void api(`/api/plays/${p.id}/approve`, { body: { index } })}>
                    Approve
                  </button>
                )}
              </div>
            );
          })}
          {asks.slice(0, 4).map((a) => (
            <div key={a.id} className="quick-row is-static">
              <ShieldCheck size={13} className="shrink-0 text-wait" />
              <button className="min-w-0 flex-1 truncate text-left" onClick={() => a.run && quickOpen(`/sessions/${a.run}`)}>
                <span className="text-fg">Allow {a.tool}?</span> <span className="text-fg-3">· {(a.run && runs[a.run]?.title) || ""}</span>
              </button>
              <button className="quick-act" onClick={() => void decideApproval(a.id, true)}>
                Allow
              </button>
              <button className="quick-act is-quiet" onClick={() => void decideApproval(a.id, false)}>
                Deny
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="quick-foot">
        <span>
          <CornerDownLeft size={11} className="inline" /> send
        </span>
        <span>⌘↵ send & open</span>
        <span>@ pick who</span>
        <span className="ml-auto">esc</span>
      </div>
    </div>
  );
}
