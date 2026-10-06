import { CREW_TEMPLATES } from "../lib/crew-templates";
import { CrewPerformance } from "../components/CrewPerformance";
import type { CrewMember, RunView } from "@shuacrew/core/projections";
import { Button } from "@shuacrew/ui";
import { useNavigate } from "@tanstack/react-router";
import { ArrowUp, GraduationCap, Pencil, Plus, Sparkles, Trash2, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useLive } from "../lib/live";
import { Glyph, IconPicker } from "../lib/glyphs";
import { SHUA_PERSONA, type MemberVoice } from "@shuacrew/core/voice";
import { VoiceCastPicker } from "../components/VoiceCastPicker";
import { PaneHeader } from "../components/Pane";
import { StatStrip } from "../components/StatStrip";
import { CrewDispatch } from "../components/CrewDispatch";
import { bestMember } from "../lib/crew-match";
import "./crew-hq.css";

interface Runtime {
  id: string;
  label: string;
  models: Array<{ id: string; label: string; unavailable?: string }>;
}
const WORKING = new Set(["running", "planning", "queued", "awaiting_approval"]);
const COLORS = ["#6cb6ff", "#4ade80", "#f778ba", "#ffb020", "#56d4dd", "#ff7a59", "#e8845c", "#c9d1d9"];

/** Your crew: the standing team you hand work to. Each keeps its own thread, model and lessons. */
export function CrewPage() {
  const members = useLive((s) => s.crew.members);
  const runs = useLive((s) => s.crew.runs);
  const [editing, setEditing] = useState<Partial<CrewMember> | null>(null);
  const [lessons, setLessons] = useState<Record<string, number>>({});
  const [runtimes, setRuntimes] = useState<Runtime[]>([]);
  const list = Object.values(members);
  const [ask, setAsk] = useState(""), [picked, setPicked] = useState<string | null>(null);
  const match = useMemo(() => bestMember(ask, list), [ask, list]);

  useEffect(() => {
    void api<Runtime[]>("/api/runtimes").then(setRuntimes).catch(() => undefined);
    void api<{ lessons: Array<{ project?: string; retired?: string }> }>("/api/memory")
      .then((m) => {
        const count: Record<string, number> = {};
        for (const l of m.lessons) if (!l.retired && l.project?.startsWith("crew:")) count[l.project.slice(5)] = (count[l.project.slice(5)] ?? 0) + 1;
        setLessons(count);
      })
      .catch(() => undefined);
  }, [list.length]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1440px] px-8 pb-12 pt-8">
        <PaneHeader children={<StatStrip stats={[{ value: list.length, label: "members" }, { value: list.filter((m) => m.delegatable).length, label: "available in rooms", tone: "amber", to: "/rooms" }, { value: Object.values(runs).filter((r) => r.member && ["running", "planning"].includes(r.status)).length, label: "working now", live: Object.values(runs).some((r) => r.member && ["running", "planning"].includes(r.status)), to: "/floor" }]} />} eyebrow="Work" icon={Users} title="Your crew" description="A standing team you hand work to. Each member keeps its own thread, model and lessons — and new work is routed to whoever it's for." actions={<>
          <Button onClick={() => setEditing({ color: COLORS[list.length % COLORS.length], triggers: [] })}>
            <Plus size={14} /> New member
          </Button>
          <Button variant="ghost" onClick={() => setEditing({ role: "Personal assistant", persona: SHUA_PERSONA, color: "#56d4dd", emoji: "audio-lines", triggers: [], voice: { voiceId: "michael", speed: 1, personality: "calm" } })}>Start from Shua</Button>
        </>} />

        {list.length > 0 && <CrewDispatch members={list} text={ask} setText={setAsk} picked={picked} setPicked={setPicked} match={match} />}
        {list.length === 0 ? (
          <StarterCta />
        ) : (
          <div className="crew-roster grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
            <AnimatePresence initial={false}>
              {list.map((m) => (
                <motion.div key={m.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
                  className={(picked ? picked === m.id : match?.id === m.id) ? "is-picked" : ask.trim() ? "is-dim" : undefined}>
                  <MemberCard member={m} runs={runs} lessons={lessons[m.id] ?? 0} onEdit={() => setEditing(m)} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
        {list.length > 0 && <CrewPerformance members={list} runs={runs} lessons={lessons} />}
      </div>
      {editing && <MemberEditor member={editing} runtimes={runtimes} onClose={() => setEditing(null)} />}
    </div>
  );
}

function StarterCta() {
  const [busy, setBusy] = useState(false);
  const roles = [
    ["researcher", "Rhea", "Researcher", "Markets, competitors, who pays — with sources"],
    ["engineer", "Eli", "Engineer", "Builds and tests, in small verified steps"],
    ["designer", "Dani", "Designer", "Brand, UI and landing pages, as real code"],
    ["marketer", "Maya", "Marketer", "Positioning, copy, launch, content"],
    ["operator", "Otto", "Operator", "Pricing, payments, hosting, analytics"],
  ];
  return (
    <div className="crew-cta">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--amber-soft)] text-amber">
          <Users size={20} />
        </span>
        <div>
          <div className="text-[16px] font-semibold">Start with a crew that can take an idea to revenue</div>
          <div className="text-[12.5px] text-fg-3">Five members, each with a persona and model you can change. Nothing runs until you ask.</div>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5">
        {roles.map(([icon, name, role, what]) => (
          <div key={role} className="crew-cta-role">
            <span className="crew-cta-icon">
              <Glyph fallback={icon} size={17} />
            </span>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-fg">
                {name} <span className="font-normal text-fg-3">· {role}</span>
              </div>
              <div className="text-[11.5px] leading-snug text-fg-3">{what}</div>
            </div>
          </div>
        ))}
      </div>
      <Button variant="primary" className="mt-5" disabled={busy} onClick={() => (setBusy(true), void api("/api/crew/starter", { body: {} }).finally(() => setBusy(false)))}>
        <Sparkles size={14} /> {busy ? "Adding…" : "Add the starter crew"}
      </Button>
    </div>
  );
}

function MemberCard({ member, runs, lessons, onEdit }: { member: CrewMember; runs: Record<string, RunView>; lessons: number; onEdit: () => void }) {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [teaching, setTeaching] = useState(false);
  const [lesson, setLesson] = useState("");
  const [busy, setBusy] = useState(false);
  const mine = useMemo(() => Object.values(runs).filter((r) => r.member === member.id), [runs, member.id]);
  const active = mine.find((r) => WORKING.has(r.status));
  const last = [...mine].sort((a, b) => b.updatedAt - a.updatedAt)[0];

  const talk = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const { run } = await api<{ run: string }>(`/api/crew/${member.id}/talk`, { body: { text } });
      navigate({ to: "/sessions/$id", params: { id: run } });
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className={`member-card ${active ? "is-active" : ""}`} style={{ "--member": member.color } as React.CSSProperties}>
      <div className="flex items-start gap-3">
        <span className="member-avatar" aria-hidden>
          <span className="member-ring" />
          <span className="member-face">
            <Glyph name={member.emoji} fallback={member.id} label={member.name} size={19} />
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-[16px] font-semibold text-fg">{member.name}</span>
            <span className="text-[12.5px] text-fg-3">{member.role}</span>
          </div>
          <div className="mono mt-0.5 truncate text-[11px] text-fg-3">{member.model ?? "auto model"}</div>
        </div>
        <button onClick={onEdit} className="member-icon" title="Edit" aria-label={`Edit ${member.name}`}>
          <Pencil size={13} />
        </button>
      </div>

      <div className="member-status">
        {active ? (
          <>
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full" style={{ background: member.color }} />
            <span className="min-w-0 flex-1 truncate">
              <span className="shimmer-text font-medium">Working</span> <span className="text-fg-3">— {active.title}</span>
            </span>
          </>
        ) : (
          <>
            <span className="h-2 w-2 shrink-0 rounded-full bg-fg-3 opacity-50" />
            <span className="min-w-0 flex-1 truncate text-fg-3">{last ? `Last: ${last.title}` : "Hasn't worked yet"}</span>
          </>
        )}
      </div>

      <p className="member-persona">{member.persona}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {member.triggers.slice(0, 5).map((t) => (
          <span key={t} className="member-trigger">
            {t}
          </span>
        ))}
      </div>

      <div className="member-foot">
        <span>{mine.length} session{mine.length === 1 ? "" : "s"}</span>
        <span>
          {lessons} lesson{lessons === 1 ? "" : "s"}
        </span>
        {member.thread && (
          <button className="ml-auto text-amber hover:underline" onClick={() => navigate({ to: "/sessions/$id", params: { id: member.thread! } })}>
            Open thread →
          </button>
        )}
      </div>

      {teaching ? (
        <div className="member-talk">
          <GraduationCap size={14} className="shrink-0 text-amber" />
          <input
            value={lesson}
            onChange={(e) => setLesson(e.target.value)}
            autoFocus
            onKeyDown={async (e) => {
              if (e.key === "Escape") setTeaching(false);
              if (e.key === "Enter" && lesson.trim()) {
                await api("/api/memory/lessons", { body: { text: lesson, project: `crew:${member.id}` } });
                setLesson("");
                setTeaching(false);
              }
            }}
            placeholder={`Teach ${member.name} something it should always do…`}
            aria-label={`Teach ${member.name}`}
          />
        </div>
      ) : (
        <div className="member-talk">
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void talk()} placeholder={`Ask ${member.name}…`} aria-label={`Talk to ${member.name}`} />
          <button onClick={() => setTeaching(true)} className="member-icon" title={`Teach ${member.name}`} aria-label={`Teach ${member.name}`}>
            <GraduationCap size={14} />
          </button>
          <button onClick={() => void talk()} disabled={!text.trim() || busy} className="member-send" aria-label={`Send to ${member.name}`}>
            <ArrowUp size={14} strokeWidth={2.5} />
          </button>
        </div>
      )}
    </article>
  );
}

function MemberEditor({ member, runtimes, onClose }: { member: Partial<CrewMember>; runtimes: Runtime[]; onClose: () => void }) {
  const [voice, setVoice] = useState<MemberVoice>(member.voice ?? { voiceId: "michael", speed: 1, personality: "calm" });
  const [draft, setDraft] = useState({
    id: member.id ?? "",
    name: member.name ?? "",
    role: member.role ?? "",
    emoji: member.emoji ?? "",
    color: member.color ?? COLORS[0]!,
    runtime: member.runtime ?? "claude",
    model: member.model ?? "",
    persona: member.persona ?? "",
    delegatable: member.delegatable ?? false,
    triggers: (member.triggers ?? []).join(", "),
  });
  const [error, setError] = useState("");
  const runtime = runtimes.find((r) => r.id === draft.runtime);
  const set = (k: keyof typeof draft) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const save = async () => {
    try {
      await api("/api/crew", { body: { ...draft, voice, id: draft.id || draft.name, model: draft.model || undefined, triggers: draft.triggers.split(",").map((t) => t.trim()).filter(Boolean) } });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label="Crew member">
      <motion.div initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="w-[560px] max-w-full rounded-[16px] border border-line-strong bg-panel p-5 shadow-[0_30px_90px_rgba(0,0,0,.45)]">
        <div className="mb-4 text-[16px] font-semibold">{member.id ? `Edit ${member.name}` : "New crew member"}</div>
        {!member.id && <div className="crew-templates" role="group" aria-label="Start from a template">
          <span>Start from</span>
          {CREW_TEMPLATES.map((t) => <button key={t.key} type="button" className={draft.role === t.role ? "is-on" : ""} onClick={() => {
            setDraft((d) => ({ ...d, name: t.name, role: t.role, emoji: t.emoji, color: t.color, runtime: "claude", model: "", persona: t.persona, triggers: t.triggers.join(", "), delegatable: true }));
            setVoice(t.voice);
          }}>{t.role}</button>)}
        </div>}
        <div className="grid grid-cols-2 gap-3">
          <label className="field">
            <span>Name</span>
            <input value={draft.name} onChange={set("name")} placeholder="Nova" autoFocus />
          </label>
          <label className="field">
            <span>Role</span>
            <input value={draft.role} onChange={set("role")} placeholder="Growth analyst" />
          </label>
        </div>
        <div className="field mt-3">
          <span>Icon</span>
          <IconPicker value={draft.emoji} color={draft.color} onChange={(emoji) => setDraft((d) => ({ ...d, emoji }))} choices={["telescope", "code", "pen-tool", "megaphone", "chart-line", "brain", "flask", "shield", "briefcase", "palette", "cpu", "feather", "compass", "target", "zap", "layers"]} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="field">
            <span>Agent</span>
            <select value={draft.runtime} onChange={(e) => setDraft((d) => ({ ...d, runtime: e.target.value, model: "" }))}>
              {runtimes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Model</span>
            <select value={draft.model} onChange={set("model")}>
              <option value="">auto</option>
              {runtime?.models.map((m) => (
                <option key={m.id} value={m.id} disabled={Boolean(m.unavailable)}>
                  {m.label}
                  {m.unavailable ? ` · ${m.unavailable}` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field mt-3">
          <span>How it works — its persona</span>
          <textarea value={draft.persona} onChange={set("persona")} rows={4} placeholder="You find the fastest honest way to learn whether people will pay…" />
        </label>
        <label className="field mt-3">
          <span>Hand it work about… (comma-separated phrases)</span>
          <input value={draft.triggers} onChange={set("triggers")} placeholder="growth, retention, funnel, cohorts" />
        </label>
        <div className="mt-4"><VoiceCastPicker value={voice} onChange={setVoice} /><p className="mt-2 text-[11px] text-fg-3">Hear every voice in Settings → Shua companion → Personality &amp; voice. Personality adds speaking style without replacing your instructions. Playback pace also changes pitch; 1× preserves the natural voice.</p></div>
        {["claude", "codex"].includes(draft.runtime) && <label className="mt-4 flex items-start gap-3 rounded-xl border border-line bg-sunken p-3 text-[12px]">
          <input type="checkbox" className="mt-1 accent-[var(--amber)]" checked={draft.delegatable} onChange={(e) => setDraft((d) => ({ ...d, delegatable: e.target.checked }))} />
          <span><strong className="block font-medium">Available for delegation</strong><span className="mt-1 block text-fg-3">Crew rooms can assign this member supervised tasks using its provider, persona and model, in a separate workspace. Claude members are also available as native specialists outside rooms. Applies to new assignments.</span></span>
        </label>}
        <div className="mt-3 flex gap-2">
          {COLORS.map((c) => (
            <button key={c} onClick={() => setDraft((d) => ({ ...d, color: c }))} className={`h-6 w-6 rounded-full ${draft.color === c ? "ring-2 ring-offset-2 ring-offset-[var(--panel)]" : ""}`} style={{ background: c, ["--tw-ring-color" as string]: c }} aria-label={`Colour ${c}`} />
          ))}
        </div>
        {error && <div className="mt-3 text-[12px] text-bad">{error}</div>}
        <div className="mt-5 flex items-center gap-2">
          {member.id && (
            <Button variant="danger" onClick={() => void api(`/api/crew/${member.id}`, { method: "DELETE" }).then(onClose)}>
              <Trash2 size={13} /> Remove
            </Button>
          )}
          <span className="ml-auto" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={!draft.name.trim()}>
            Save
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
