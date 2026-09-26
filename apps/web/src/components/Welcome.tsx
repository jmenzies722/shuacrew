import { SPARK_FINISHES, sparkVars, stops } from "../lib/spark-color";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, Keyboard, Mic, MonitorUp, MousePointerClick } from "lucide-react";
import { api } from "../lib/api";
import { saveCompanion, SPARK_CHARACTERS, useCompanion, type CompanionPreferences } from "../lib/companion";
import { CHARACTER_INFO, SparkCharacter } from "./SparkCharacter";
import { setSparkPanel } from "../lib/spark-panel";
import "./welcome.css";
const swatchBg = (f: string) => { const s = stops(f); return s.gradient ? `linear-gradient(135deg, ${s.from}, ${s.to})` : s.from; };

/** Seen once: after this, ShuaCrew opens straight to work. Bumping the version shows the tour again after a big release. */
const KEY = "shuacrew.welcome";
const VERSION = "2";
export const welcomed = () => { try { return localStorage.getItem(KEY) === VERSION; } catch { return true; } };

type Native = { postMessage(m: unknown): void };
const native = () => (window as unknown as { webkit?: { messageHandlers?: { shuacrew?: Native } } }).webkit?.messageHandlers?.shuacrew;
interface Runtime { id: string; label: string; status: { installed: boolean; signedIn: boolean | null; account?: string } }

const GOALS = ["AI Platform Engineer", "Staff Software Engineer", "Founder shipping products", "Full-stack developer", "iOS & macOS developer", "DevOps / SRE"];

/** The first five minutes: your assistant, your goal, your engines, your permissions, and a first win. */
export function Welcome({ onDone }: { onDone: () => void }) {
  const prefs = useCompanion();
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState(""), [runtimes, setRuntimes] = useState<Runtime[] | null>(null);
  const [perms, setPerms] = useState<{ screen?: boolean; hands?: boolean; mic?: boolean }>({});
  const set = (patch: Partial<CompanionPreferences>) => saveCompanion({ ...prefs, ...patch });
  const name = prefs.nickname || "Spark";
  useEffect(() => { void api<{ profile?: { goal?: string } }>("/api/learning").then((l) => setGoal(l.profile?.goal?.trim() ?? "")).catch(() => {}); void api<Runtime[]>("/api/runtimes").then(setRuntimes).catch(() => setRuntimes([])); }, []);
  useEffect(() => {
    const screen = (e: Event) => setPerms((p) => ({ ...p, screen: (e as CustomEvent<{ granted?: boolean }>).detail.granted === true }));
    const hands = (e: Event) => setPerms((p) => ({ ...p, hands: (e as CustomEvent<{ trusted?: boolean }>).detail.trusted === true }));
    const poll = () => { native()?.postMessage({ type: "buddyScreenAccess" }); native()?.postMessage({ type: "buddyHands" }); };
    window.addEventListener("shuacrew:screenAccess", screen); window.addEventListener("shuacrew:hands", hands); window.addEventListener("focus", poll); poll();
    return () => { window.removeEventListener("shuacrew:screenAccess", screen); window.removeEventListener("shuacrew:hands", hands); window.removeEventListener("focus", poll); };
  }, []);
  const askMic = async () => { try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach((t) => t.stop()); setPerms((p) => ({ ...p, mic: true })); } catch { setPerms((p) => ({ ...p, mic: false })); } };
  const finish = (openSpark = false) => {
    try { localStorage.setItem(KEY, VERSION); } catch { /* ignore */ }
    if (goal.trim()) void api("/api/learning/profile", { body: { goal: goal.trim() } }).catch(() => {});
    if (openSpark) setSparkPanel(true);
    onDone();
  };
  const steps = ["You", "Goal", "Engines", "Access", "Go"];
  const next = () => setStep((s) => Math.min(steps.length - 1, s + 1));

  return <div className="wel" role="dialog" aria-modal="true" aria-label="Welcome to ShuaCrew">
    <motion.div className="wel-card" initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 30 }}>
      <nav className="wel-steps" aria-label="Steps">{steps.map((s, i) => <button key={s} type="button" className={i === step ? "is-on" : i < step ? "is-done" : ""} onClick={() => setStep(i)} aria-current={i === step ? "step" : undefined}><i>{i < step ? <Check size={11} /> : i + 1}</i>{s}</button>)}</nav>
      <AnimatePresence mode="wait">
        <motion.section key={step} className="wel-body" initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -18 }} transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}>
          {step === 0 && <>
            <div className="wel-hero" style={sparkVars(prefs.color)}><SparkCharacter preferences={prefs} mood="happy" size={112} /></div>
            <h1>Welcome to ShuaCrew.</h1>
            <p>Your crew of AI engineers, and one assistant who's always with you: on your desktop, in the app, and in your ear. Make it yours.</p>
            <div className="wel-chars">{SPARK_CHARACTERS.map((id) => <button key={id} type="button" className={prefs.character === id ? "is-on" : ""} aria-pressed={prefs.character === id} onClick={() => set({ character: id })}><SparkCharacter preferences={{ ...prefs, character: id }} size={46} /><span>{CHARACTER_INFO[id].name}</span></button>)}</div>
            <div className="wel-row">
              <label className="wel-name"><span>Name</span><input value={prefs.nickname} maxLength={24} placeholder="Spark" onChange={(e) => set({ nickname: e.target.value })} /></label>
              <div className="wel-colors">{SPARK_FINISHES.filter((f) => ["#8e48ff", "#111114", "#f5b544", "#60a5fa", "grad:#a78bfa:#60a5fa", "grad:#f472b6:#f59e0b", "grad:#18181b:#7c3aed", "grad:#050506:#52525b"].includes(f.id)).map((f) => <button key={f.id} type="button" title={f.name} aria-label={f.name} aria-pressed={prefs.color === f.id} style={{ background: swatchBg(f.id) }} onClick={() => set({ color: f.id })} />)}</div>
            </div>
          </>}
          {step === 1 && <>
            <h1>Where are you headed?</h1>
            <p>{name} and your coach use this to plan what you learn, suggest what to build, and keep you moving toward it.</p>
            <input className="wel-input" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. AI Platform Engineer" aria-label="Career goal" />
            <div className="wel-chips">{GOALS.map((g) => <button key={g} type="button" className={goal.trim() === g ? "is-on" : ""} onClick={() => setGoal(g)}>{g}</button>)}</div>
          </>}
          {step === 2 && <>
            <h1>Your engines</h1>
            <p>ShuaCrew runs on the AI subscriptions you already have. Nothing to configure if these are signed in.</p>
            <div className="wel-list">{runtimes === null ? <div className="wel-item">Checking…</div> : runtimes.map((r) => <div key={r.id} className="wel-item"><span className={`wel-dot ${r.status.signedIn ? "is-ok" : "is-bad"}`} /><div><b>{r.label}</b><small>{r.status.signedIn ? `Signed in${r.status.account ? ` as ${r.status.account}` : ""}` : r.status.installed ? "Installed, not signed in" : "Not installed"}</small></div></div>)}</div>
          </>}
          {step === 3 && <>
            <h1>Let {name} help for real</h1>
            <p>Each is optional and asked once by macOS. You can change them any time in System Settings.</p>
            <div className="wel-list">
              <Perm icon={Mic} title="Microphone" why="Talk instead of type. Transcribed on this Mac." on={perms.mic} onAsk={() => void askMic()} />
              <Perm icon={MonitorUp} title="Screen Recording" why={`So ${name} can see what you're stuck on, read it exactly, and point.`} on={perms.screen} onAsk={() => native()?.postMessage({ type: "buddyScreenAccess", ask: true })} />
              <Perm icon={MousePointerClick} title="Accessibility" why={`So ${name} can click and type for you, one step at a time. Esc stops it.`} on={perms.hands} onAsk={() => native()?.postMessage({ type: "buddyHands", ask: true })} />
            </div>
          </>}
          {step === 4 && <>
            <h1>You're set. Try one.</h1>
            <p>Open {name} with <kbd>⌘J</kbd> here or <kbd>⌃⌥Space</kbd> anywhere on your Mac, tap the waveform, and just say it:</p>
            <div className="wel-tries">{[`“Teach me ${goal.trim() ? "what an " + goal.trim() + " needs to know" : "Kubernetes"}”`, "“I want to make money with an idea for…”", "“Show me how to do this” (with the eye on)", "“Have the crew fix the failing test in my project”", "“Design a URL shortener”", "“Play some lofi and start a 25 minute focus”"].map((t) => <div key={t}>{t}</div>)}</div>
            <p className="wel-keys"><Keyboard size={13} /> <kbd>⌘1</kbd>–<kbd>⌘5</kbd> jump between hubs · <kbd>⌘K</kbd> finds anything · <kbd>⌘N</kbd> starts a session</p>
          </>}
        </motion.section>
      </AnimatePresence>
      <footer className="wel-foot">
        <button type="button" className="wel-skip" onClick={() => finish()}>Skip</button>
        {step < steps.length - 1
          ? <button type="button" className="wel-next" onClick={next}>Continue <ArrowRight size={14} /></button>
          : <button type="button" className="wel-next" onClick={() => finish(true)}>Open {name} <ArrowRight size={14} /></button>}
      </footer>
    </motion.div>
  </div>;
}

function Perm({ icon: Icon, title, why, on, onAsk }: { icon: typeof Mic; title: string; why: string; on?: boolean; onAsk: () => void }) {
  return <div className="wel-item"><Icon size={17} /><div><b>{title}</b><small>{why}</small></div>{on ? <span className="wel-ok"><Check size={13} /> On</span> : <button type="button" onClick={onAsk}>Allow</button>}</div>;
}

export function resetWelcome() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
