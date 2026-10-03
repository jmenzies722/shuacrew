import type { CSSProperties } from "react";
import { useScreenMemory, useWakeWord } from "../lib/screen-memory";
import { SPARK_FINISHES, sparkVars, stops } from "../lib/spark-color";
import { useEffect, useState } from "react";
import { AudioLines, Check } from "lucide-react";
import { VoiceSettings, setVoiceEverywhere } from "./VoiceSettings";
import { VoiceComparison } from "./VoiceComparison";
import { MicrophoneSettings } from "./MicrophoneSettings";
import { MacReach } from "./MacReach";
import { useLive } from "../lib/live";
import { api } from "../lib/api";
import { saveBuddyVoice, useBuddyVoice } from "../lib/buddy-voice";
import { parseCompanion, saveCompanion, SOUND_PACKS, ROBOT_CHARACTERS, ROBOT_EYES, ROBOT_FACEWEAR, ROBOT_HATS, ROBOT_MATERIALS, ROBOT_MOUTHS, ROBOT_NECKS, SPARK_HOTKEYS, useCompanion, type CompanionPreferences, type SparkHotkey } from "../lib/companion";
import { CHARACTER_INFO, SparkCharacter, type Mood } from "./SparkCharacter";
import { Segmented, SettingRow, Switch } from "./SettingControls";
import "./spark-settings.css";
import "../screens/buddy.css";
import "../alive.css";
import { summary, useSparkLog } from "../lib/spark-log";
import { resetWelcome } from "./Welcome";
import { earcon, soundStyle } from "../lib/earcons";

/** Where Spark reaches your mail and Notion: Mail on this Mac (read and draft only), Notion through the crew. */
function SparkReach({ name }: { name: string }) {
  const [notion, setNotion] = useState<boolean | null>(null);
  useEffect(() => {
    void api<Array<{ name?: string; url?: string }>>("/api/mcp")
      .then((servers) => setNotion(servers.some((s) => s.name === "notion" || (s.url ?? "").includes("mcp.notion.com"))))
      .catch(() => setNotion(null));
  }, []);
  const go = (path: string) => window.shuacrew?.navigate(path);
  return <>
    <SettingRow name="Email" detail={`${name} checks, searches, reads and drafts your mail through the Mail app on this Mac, so Gmail (or any account you've added to Mail) works with no Google setup. It never sends: drafts open in Mail for you. macOS asks once to let ShuaCrew use Mail.`}>
      <span className="spark-reach-state">Via Mail</span>
    </SettingRow>
    <SettingRow name="Notion" detail={`Ask ${name} about your Notion and it hands the job to the crew, which reads and writes your pages once Notion is connected.`}>
      {notion ? <span className="spark-reach-state is-on"><Check size={12} /> Connected</span>
        : <button type="button" className="spark-reach-go" onClick={() => go("/integrations")}>{notion === false ? "Connect Notion" : "Open Tools & Skills"}</button>}
    </SettingRow>
  </>;
}
/** Sound packs: a different instrument each, all clean tones. Played natively, so a preview is the real thing. */
const PACK_INFO: Record<(typeof SOUND_PACKS)[number], { name: string; blurb: string }> = {
  glass: { name: "Glass", blurb: "Struck crystal, bright and airy" },
  pop: { name: "Pop", blurb: "Soft bubbles, quick and playful" },
  chime: { name: "Chime", blurb: "A plucked kalimba, warm and clear" },
  pulse: { name: "Pulse", blurb: "Pure digital taps, nothing extra" },
  droplet: { name: "Droplet", blurb: "Water drops that glide up and down" },
  felt: { name: "Felt", blurb: "Low muted piano, the gentlest" },
};

const TRIMS = ["auto", "#e5e7eb", "#111114", "#f5b544", "#f472b6", "#60a5fa", "#34d399"] as const;
const label = (v: string) => ({ o: "O", tophat: "Top hat", bowtie: "Bow tie", faceWear: "Face" } as Record<string, string>)[v] ?? v[0]!.toUpperCase() + v.slice(1);

type Look = Partial<CompanionPreferences>;
/** One-click looks: a whole outfit at once, on whichever robot you have. */
const PRESETS: Array<{ name: string; look: Look }> = [
  { name: "Classic", look: { color: "#e5e7eb", material: "glossy", style: "smooth", trim: "auto", eyeColor: "#f5a524", eyes: "moon", mouth: "smile", hat: "none", faceWear: "none", neck: "none" } },
  { name: "Retro pixel", look: { color: "#ff7a59", material: "glossy", style: "pixel", trim: "auto", eyeColor: "#a5f3fc", eyes: "pixel", mouth: "grin", hat: "cap", faceWear: "none", neck: "none" } },
  { name: "Gold", look: { color: "#f5b544", material: "metal", style: "smooth", trim: "auto", eyeColor: "#fde68a", eyes: "visor", mouth: "smile", hat: "crown", faceWear: "none", neck: "badge" } },
  { name: "Night ops", look: { color: "#111114", material: "matte", style: "smooth", trim: "auto", eyeColor: "#34d399", eyes: "visor", mouth: "flat", hat: "headphones", faceWear: "shades", neck: "none" } },
  { name: "Candy", look: { color: "grad:#f472b6:#f59e0b", material: "glossy", style: "smooth", trim: "#fff1f2", eyeColor: "#f9a8d4", eyes: "happy", mouth: "cat", hat: "bow", faceWear: "blush", neck: "none" } },
  { name: "Glass", look: { color: "grad:#a78bfa:#60a5fa", material: "glass", style: "smooth", trim: "auto", eyeColor: "#e0f2fe", eyes: "star", mouth: "o", hat: "halo", faceWear: "none", neck: "bowtie" } },
];
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)]!;
/** Surprise me: a random but wearable outfit (one face piece at most, so it never looks cluttered). */
function surprise(): Look {
  return { color: pick(SPARK_FINISHES.filter((f) => f.id !== "theme")).id, material: pick(ROBOT_MATERIALS), style: Math.random() < 0.2 ? "pixel" : "smooth",
    trim: pick(TRIMS), eyeColor: pick(["#a5f3fc", "#f5a524", "#34d399", "#f9a8d4", "#fde68a", "#c4b5fd", "#ffffff"]), eyes: pick(ROBOT_EYES), mouth: pick(ROBOT_MOUTHS),
    hat: pick(ROBOT_HATS), faceWear: Math.random() < 0.5 ? "none" : pick(ROBOT_FACEWEAR), neck: Math.random() < 0.5 ? "none" : pick(ROBOT_NECKS) };
}

/** One piece of the robot, as tiles: your own robot (head and shoulders) wearing each choice. Hover to try it on. */
function PieceTiles<K extends "eyes" | "mouth" | "hat" | "faceWear" | "neck">({ prefs, piece, options, set, onTry }: { prefs: CompanionPreferences; piece: K; options: readonly CompanionPreferences[K][]; set(patch: Partial<CompanionPreferences>): void; onTry(look: Look | null): void }) {
  return <div className="spark-pieces" role="radiogroup" aria-label={label(piece)} onMouseLeave={() => onTry(null)}>{options.map((o) => {
    const on = prefs[piece] === o;
    return <button key={o} type="button" role="radio" aria-checked={on} className={on ? "is-on" : ""} onClick={() => { onTry(null); set({ [piece]: o } as Partial<CompanionPreferences>); }} onMouseEnter={() => onTry({ [piece]: o } as Look)} onFocus={() => onTry({ [piece]: o } as Look)} onBlur={() => onTry(null)} title={label(o)}>
      <SparkCharacter preferences={{ ...prefs, [piece]: o }} size={piece === "neck" ? 58 : 52} crop={piece === "neck" ? "full" : "portrait"} /><small>{label(o)}</small>
    </button>;
  })}</div>;
}

const swatchBg = (f: string) => { if (f === "theme") return "var(--amber)"; const s = stops(f); return s.gradient ? `linear-gradient(135deg, ${s.from}, ${s.to})` : s.from; };

type Native = { postMessage(m: unknown): void };
const native = () => (window as unknown as { webkit?: { messageHandlers?: { shuacrew?: Native } } }).webkit?.messageHandlers?.shuacrew;
const DESKTOP = "shuacrew.buddy.desktop";
const readDesktop = () => { try { return localStorage.getItem(DESKTOP) !== "0"; } catch { return true; } };

/** Spark, made yours: who it is, how it looks, how it sounds and talks, how you call it, how it shows you things. */
export function SparkSettings({ searching = false }: { searching?: boolean }) {
  const prefs = useCompanion(), voice = useBuddyVoice();
  const shua = useLive((l) => l.crew.members.shua);
  const [category, setCategory] = useState<"character" | "presence" | "voice" | "guidance">("character");
  const [nameDraft, setNameDraft] = useState(prefs.nickname);
  useEffect(() => setNameDraft(prefs.nickname), [prefs.nickname]);
  const set = (patch: Partial<CompanionPreferences>) => saveCompanion({ ...prefs, ...patch });
  const [mood, setMood] = useState<Mood>("idle"), [desktop, setDesktop] = useState(readDesktop);
  /** What you're hovering in the workshop, worn by the preview robot until you pick it or move away. */
  const [trial, setTrial] = useState<Look | null>(null);
  const [voices, setVoices] = useState<Array<{ id: string; name: string; description?: string; engine?: string }>>([]);
  const [speechStatus, setSpeechStatus] = useState<{ state?: string; engine?: string; error?: string }>({});
  const [screen, setScreen] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = () => void api<{ state?: string; engine?: string; error?: string; voices?: Array<{ id: string; name: string; description?: string; engine?: string }> }>("/api/speech/status").then(status => { if (active) { setVoices(status.voices ?? []); setSpeechStatus(status); } }).catch(() => { if (active) setSpeechStatus({ state: "error", error: "Could not check the local speech engine." }); });
    refresh(); window.addEventListener("focus", refresh);
    return () => { active = false; window.removeEventListener("focus", refresh); };
  }, []);
  useEffect(() => {
    const on = (e: Event) => setScreen((e as CustomEvent<{ granted?: boolean }>).detail.granted === true);
    const poll = () => native()?.postMessage({ type: "buddyScreenAccess" });
    window.addEventListener("shuacrew:screenAccess", on);
    window.addEventListener("focus", poll);
    poll();
    return () => { window.removeEventListener("shuacrew:screenAccess", on); window.removeEventListener("focus", poll); };
  }, []);
  const [trusted, setTrusted] = useState<boolean | null>(null);
  useEffect(() => {
    const on = (e: Event) => setTrusted((e as CustomEvent<{ trusted?: boolean }>).detail.trusted === true);
    const poll = () => native()?.postMessage({ type: "buddyHands" });
    window.addEventListener("shuacrew:hands", on); window.addEventListener("focus", poll); poll();
    return () => { window.removeEventListener("shuacrew:hands", on); window.removeEventListener("focus", poll); };
  }, []);
  const toggleDesktop = (on: boolean) => { setDesktop(on); try { localStorage.setItem(DESKTOP, on ? "1" : "0"); } catch { /* ignore */ } native()?.postMessage({ type: "buddyEnabled", on }); };
  const hotkey = (combo: SparkHotkey) => { set({ hotkey: combo }); native()?.postMessage({ type: "buddyHotkey", combo }); };
  const name = prefs.nickname || "Spark";

  return <div className="spark-settings">
    <section className="settings-card spark-hero">
      <div className="spark-stage" style={sparkVars(prefs.color)}>
        <SparkCharacter preferences={prefs} mood={mood} size={prefs.size === "s" ? 96 : prefs.size === "l" ? 150 : 120} />
        <div className="spark-moods" role="group" aria-label="Try a mood">{(["idle", "thinking", "speaking", "happy", "sleepy"] as Mood[]).map((m) => <button key={m} type="button" aria-pressed={mood === m} onClick={() => setMood(m)}>{m}</button>)}</div>
      </div>
      <div className="spark-identity">
        <label className="spark-name"><small>Name</small><input value={nameDraft} maxLength={40} onChange={(e) => setNameDraft(e.target.value)} onBlur={() => { set({ nickname: nameDraft }); setNameDraft(nameDraft.trim() || "Spark"); }} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} aria-label="Your buddy's name" placeholder="Spark" /></label>
        <p>{name} lives on your desktop, over every app. {native() ? "Click it or press " : "In the Mac app, press "}<kbd>{SPARK_HOTKEYS[prefs.hotkey]}</kbd> to ask. {prefs.desktopPlacement === "notch" ? "At home beside your MacBook notch." : "Drag it to a favorite spot."}</p>
        <div className="spark-toggle"><span>On your desktop</span><Switch label="Show on the desktop" on={desktop} onChange={toggleDesktop} /></div>
      </div>
    </section>

    <div className="spark-categories"><Segmented label="Spark settings category" value={category} onChange={setCategory} options={[["character", "Your robot"], ["presence", "Presence & brain"], ["voice", "Voice"], ["guidance", "Guidance"]]} /></div>
    {(searching || category === "character") && <section className="settings-card batch-pad">
      <h4 className="spark-h">Meet your next sidekick</h4><p className="spark-workshop-note">A different silhouette. The same companion, memories, and conversation.</p>
      <div className="spark-gallery">{ROBOT_CHARACTERS.map((id) => <button key={id} type="button" className={prefs.character === id ? "is-on" : ""} aria-pressed={prefs.character === id} onClick={() => set({ character: id })} style={sparkVars(prefs.color)}>
        <SparkCharacter preferences={{ ...prefs, character: id }} size={64} /><strong>{CHARACTER_INFO[id].name}</strong><small>{CHARACTER_INFO[id].blurb}</small>{prefs.character === id && <i><Check size={11} /></i>}
      </button>)}</div>
      <SettingRow name="Finish" detail="A colour, true black, or a gradient. Tints the character, its chat, and the cursor and spotlight when it shows you something.">
        <div className="spark-swatches">{SPARK_FINISHES.map((f) => <button key={f.id} type="button" title={f.name} aria-label={f.name} aria-pressed={prefs.color === f.id} style={{ background: swatchBg(f.id) }} onClick={() => set({ color: f.id })} />)}
          <label className="spark-custom" title="Any colour"><input type="color" value={stops(prefs.color).from} onChange={(e) => set({ color: e.target.value })} aria-label="Custom colour" /></label></div>
      </SettingRow>
      {ROBOT_CHARACTERS.some(id => id === prefs.character) && <div className="spark-workshop">
        <aside className="spark-fitting" style={sparkVars((trial?.color as string | undefined) ?? prefs.color)}>
          <div className="spark-fitting-stage"><SparkCharacter preferences={{ ...prefs, ...trial }} mood={mood} size={168} /></div>
          {trial && <span className="spark-fitting-trying">Trying on</span>}
          <div className="spark-moods" role="group" aria-label="Try a mood">{(["idle", "thinking", "speaking", "happy", "sleepy"] as Mood[]).map((m) => <button key={m} type="button" aria-pressed={mood === m} onClick={() => setMood(m)}>{m}</button>)}</div>
          <div className="spark-fitting-actions">
            <button type="button" onClick={() => { setTrial(null); set(surprise()); }}>Surprise me</button>
            <button type="button" onClick={() => { setTrial(null); set({ material: "glossy", style: "smooth", trim: "auto", eyes: prefs.character === "spark" ? "moon" : "round", mouth: "smile", hat: "none", faceWear: "none", neck: "none" }); }} title="Plain shell, no accessories. Keeps your colours.">Reset</button>
          </div>
        </aside>
        <div className="spark-workshop-controls">
          <h5 className="spark-sub is-first">Looks</h5>
          <div className="spark-pieces is-looks" onMouseLeave={() => setTrial(null)}>{PRESETS.map((pr) => <button key={pr.name} type="button" onClick={() => { setTrial(null); set(pr.look); }} onMouseEnter={() => setTrial(pr.look)} onFocus={() => setTrial(pr.look)} onBlur={() => setTrial(null)}>
            <SparkCharacter preferences={{ ...prefs, ...pr.look }} size={60} crop="portrait" /><small>{pr.name}</small></button>)}</div>
          <SettingRow name="Style" detail="Smooth 3D, or the same robot as pixel art. Every piece and colour carries over."><Segmented label="Style" value={prefs.style} onChange={(style) => set({ style })} options={[["smooth", "Smooth"], ["pixel", "Pixel"]]} /></SettingRow>
          <SettingRow name="Material" detail="What the shell is made of."><Segmented label="Material" value={prefs.material} onChange={(material) => set({ material })} options={ROBOT_MATERIALS.map((m) => [m, label(m)] as [typeof m, string])} /></SettingRow>
          <SettingRow name="Trim" detail="Joints, ears and the visor frame. Auto is graphite.">
            <div className="spark-swatches">{TRIMS.map((t) => <button key={t} type="button" title={t === "auto" ? "Auto (graphite)" : t} aria-label={t === "auto" ? "Auto trim" : `Trim ${t}`} aria-pressed={prefs.trim === t} style={{ background: t === "auto" ? "linear-gradient(135deg, #4a5262, #1c212b)" : t }} onClick={() => set({ trim: t })} onMouseEnter={() => setTrial({ trim: t })} onMouseLeave={() => setTrial(null)} />)}
              <label className="spark-custom" title="Any colour"><input type="color" value={prefs.trim === "auto" ? "#2b3240" : prefs.trim} onChange={(e) => set({ trim: e.target.value })} aria-label="Custom trim colour" /></label></div>
          </SettingRow>
          <SettingRow name="Eye glow" detail="The eyes, the core, and the little lights."><input type="color" className="spark-eye-color" value={prefs.eyeColor} onChange={e => set({ eyeColor: e.target.value })} aria-label="Robot eye color" /></SettingRow>
          <h5 className="spark-sub">Eyes</h5><PieceTiles prefs={prefs} piece="eyes" options={ROBOT_EYES} set={set} onTry={setTrial} />
          <h5 className="spark-sub">Mouth</h5><PieceTiles prefs={prefs} piece="mouth" options={ROBOT_MOUTHS} set={set} onTry={setTrial} />
          <h5 className="spark-sub">On its head</h5><PieceTiles prefs={prefs} piece="hat" options={ROBOT_HATS} set={set} onTry={setTrial} />
          <h5 className="spark-sub">On its face</h5><PieceTiles prefs={prefs} piece="faceWear" options={ROBOT_FACEWEAR} set={set} onTry={setTrial} />
          <h5 className="spark-sub">Round its neck</h5><PieceTiles prefs={prefs} piece="neck" options={ROBOT_NECKS} set={set} onTry={setTrial} />
        </div>
      </div>}
      <SettingRow name="Energy" detail="Choose how lively your companion feels between conversations."><Segmented label="Robot energy" value={prefs.presence} onChange={presence => set({ presence })} options={[["interaction", "When we talk"], ["subtle", "Easygoing"], ["playful", "Playful"]]} /></SettingRow>
      <SettingRow name="Little victories" detail="How your robot celebrates completed crew work."><Segmented label="Celebrations" value={prefs.celebration} onChange={celebration => set({ celebration })} options={[["off", "Quiet"], ["subtle", "A little joy"], ["expressive", "Celebrate"]]} /></SettingRow>
    </section>}
    {(searching || category === "presence") && <section className="settings-card batch-pad"><h4 className="spark-h">Presence &amp; connected intelligence</h4>
      <MacReach name={name} />
      <SettingRow name="Brain" detail={<>Each question goes to the model it needs: quick things to a fast model, real work to a stronger one, always Claude or Codex. <a className="spark-link" href="#agents">Manage connected providers →</a></>}><span className="spark-muted">Automatic</span></SettingRow>
      <SettingRow name="Language" detail={`English is fastest and shows live captions. Any language: speak whatever you like — Whisper detects it on this Mac and ${name} answers in it (captions pause).`} modified={prefs.language !== "en"}><Segmented label="Language" value={prefs.language} onChange={(language) => set({ language })} options={[["en", "English"], ["auto", "Any language"]]} /></SettingRow>
      <WakeRow name={name} nickname={prefs.nickname} />
      <FnKeyRow name={name} />
      <ScreenMemoryRow name={name} />
      <SettingRow name="Radio DJ" detail={`${name} introduces each new track or station in a line or two, with the occasional crew update. The music dips under the voice.`} modified={prefs.dj}><Switch label="Radio DJ" on={prefs.dj} onChange={(dj) => set({ dj })} /></SettingRow>
      <SettingRow name="Desktop home" detail="MacBook notch turns the camera housing into a smart island: hover to open it, and the chat grows out of it. On other displays it sits at the top centre. Free placement remembers where you dragged it." modified={prefs.desktopPlacement !== "free"}>
        <Segmented label="Desktop home" value={prefs.desktopPlacement} onChange={(desktopPlacement) => set({ desktopPlacement })} options={[["free", "Free placement"], ["notch", "MacBook notch"]]} />
      </SettingRow>
      {prefs.desktopPlacement === "notch" && <NotchLook prefs={prefs} set={set} name={name} />}
      <SettingRow name="Stay on top" detail={`In free placement, keep ${name} above other windows. The notch dock stays available above your workspace.`} modified={prefs.onTop}><Switch label="Stay on top" on={prefs.onTop} onChange={(onTop) => set({ onTop })} /></SettingRow>
      <SettingRow name="Follow my cursor" detail={`${name} rides beside your pointer wherever you work, like a buddy at your elbow. Clicks pass through it while it follows; press your ${name} shortcut to talk. It walks off to point at things and comes back.`} modified={!prefs.follow}><Switch label="Follow my cursor" on={prefs.follow} onChange={(follow) => set({ follow })} /></SettingRow>
      <SettingRow name="Notice when I'm stuck" detail={`While live watching is on, ${name} glances at your screen's text every 15 seconds (on this Mac; no images kept). An error that won't go away, the same error coming back, or searching again and again: ${name} offers to walk you through it. Once, then it leaves you alone.`} modified={!prefs.notice}><Switch label="Notice when I'm stuck" on={prefs.notice} onChange={(notice) => set({ notice })} /></SettingRow>
      <SettingRow name="Speak first" detail={`Like a real assistant: ${name} gives you a heads-up before a meeting, says a reminder the moment it's due, and catches you up when you come back after a while. In a meeting it only shows it in the notch, never out loud.`} modified={!prefs.proactive}><Switch label="Speak first" on={prefs.proactive} onChange={(proactive) => set({ proactive })} /></SettingRow>
      {prefs.proactive && <SettingRow name="Meeting heads-up" modified={prefs.headsUpMinutes !== 10}><Segmented label="Meeting heads-up" value={String(prefs.headsUpMinutes) as "5" | "10" | "15"} onChange={(m) => set({ headsUpMinutes: Number(m) as 5 | 10 | 15 })} options={[["5", "5 min before"], ["10", "10 min before"], ["15", "15 min before"]]} /></SettingRow>}
      <SparkReach name={name} />
      <ChromeRow name={name} />
      <SettingRow name="Keep going on its own" detail={`Say “agent:” and a task (or let ${name} hand work to the crew) and it becomes a mission: ${name} stays with it, tells the crew to keep going when it stops early to ask or hits a failure (up to 3 times), and tells you when it's done. It never approves anything for you.`} modified={!prefs.persist}><Switch label="Keep going on its own" on={prefs.persist} onChange={(persist) => set({ persist })} /></SettingRow>
      <SettingRow name="Size on the desktop" modified={prefs.size !== "m"}><Segmented label="Size" value={prefs.size} onChange={(size) => set({ size })} options={[["s", "Small"], ["m", "Medium"], ["l", "Large"]]} /></SettingRow>
      <ChatLook prefs={prefs} set={set} name={name} />

    </section>}

    {(searching || category === "voice") && <section className="settings-card batch-pad">
      <h4 className="spark-h">Personality &amp; voice</h4>
      <MicrophoneSettings />
      <SettingRow name="Personality" detail="How it talks to you. Your instructions to the crew are unchanged." modified={prefs.tone !== "cheerful"}>
        <Segmented label="Personality" value={prefs.tone} onChange={(tone) => set({ tone })} options={[["engineer", "Engineer"], ["cheerful", "Cheerful"], ["chill", "Chill"], ["direct", "Direct"], ["coach", "Coach"]]} />
      </SettingRow>
      <label className="spark-personality"><strong>Make it sound like your sidekick</strong><span>Favorite phrases, a sense of humor, or how you like to be encouraged. Used for future conversations.</span><textarea rows={4} maxLength={1000} value={prefs.personality} onChange={e => set({ personality: e.target.value })} placeholder="A curious co-pilot. Dry humor, clear explanations, and a tiny celebration when a tricky bug is gone." /><small>{prefs.personality.length} / 1000</small></label>
      <SettingRow name="Answers" modified={prefs.length !== "brief"}><Segmented label="Answer length" value={prefs.length} onChange={(length) => set({ length })} options={[["brief", "Brief"], ["detailed", "Detailed"]]} /></SettingRow>
      <SettingRow name={`${name} talks`} detail="Spoken as the answer streams in, with a local neural voice. Nothing leaves this Mac." modified={!voice.on}><Switch label="Talks" on={voice.on} onChange={(on) => saveBuddyVoice({ on })} /></SettingRow>
      <SettingRow name="Conversation" detail={`Open mic while ${name}'s card is open: just talk, no buttons. It hears when you stop, answers out loud, and listens again. Transcribed on this Mac.`} modified={prefs.conversation}>
        <Switch label="Conversation" on={prefs.conversation} onChange={(conversation) => set({ conversation })} />
      </SettingRow>
      {prefs.conversation && <SettingRow name="Talk over to interrupt" detail={`Start speaking while ${name} talks and it stops to listen.`} modified={!prefs.interrupt}><Switch label="Interrupt" on={prefs.interrupt} onChange={(interrupt) => set({ interrupt })} /></SettingRow>}
      <SettingRow name="Change me by asking" detail={`Say “talk faster”, “use Ryan's voice”, “be more direct”, “call yourself Nova”, “make yourself purple”, “stop clicking things”: ${name} updates these settings itself.`} />
      {voice.on && <SettingRow name="Voice" detail={voices.length ? "The same voice everywhere: on the desktop, in the notch, and when you talk to Shua in Sessions." : "Install the local voice below."}>
        <select className="setting-input" value={voice.id} onChange={(e) => void setVoiceEverywhere(shua, e.target.value)} aria-label="Voice">{(voices.length ? voices : [{ id: voice.id, name: voice.id }]).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
        <Segmented label="Speed" value={String(voice.speed) as "0.9" | "1" | "1.15"} onChange={(v) => saveBuddyVoice({ speed: Number(v) })} options={[["0.9", "Calm"], ["1", "Normal"], ["1.15", "Quick"]]} />
      </SettingRow>}
    </section>}

    {(searching || category === "voice") && <details className="settings-card batch-pad spark-voice-studio">
      <summary><AudioLines size={16} /><span><strong>Hear every voice</strong><small>Audition the cast, install or repair the local voice engine, and tune conversation audio.</small></span></summary>
      <VoiceComparison voices={voices} ready={speechStatus.state === "ready"} engine={speechStatus.engine || [...new Set(voices.map(voice => voice.engine).filter(Boolean))].join(" / ") || "Configured local speech engine"} error={speechStatus.error} />
      <VoiceSettings embedded />
    </details>}

    {(searching || category === "guidance") && <section className="settings-card batch-pad">
      <h4 className="spark-h">Showing you &amp; doing things</h4>
      <SettingRow name="Shortcut" detail="Works from any app. Changes take effect immediately." modified={prefs.hotkey !== "ctrl-opt-space"}>
        <Segmented label="Shortcut" value={prefs.hotkey} onChange={hotkey} options={Object.entries(SPARK_HOTKEYS) as Array<[SparkHotkey, string]>} />
      </SettingRow>
      <SettingRow name="Mouse & keyboard" detail={<>{`${name} can click, type, press shortcuts and scroll to do a task for you, one step at a time, looking again after each. Never in password managers or password fields; `}<kbd>Esc</kbd> stops it anywhere.{trusted === false && native() && <> <button type="button" className="spark-link" onClick={() => native()?.postMessage({ type: "buddyHands", ask: true })}>Allow Accessibility…</button></>}{trusted && " Accessibility: allowed."}</>} modified={prefs.control !== "ask"}>
        <Segmented label="Mouse and keyboard" value={prefs.control} onChange={(control) => set({ control })} options={[["off", "Off"], ["ask", "Ask each step"], ["auto", "Autopilot"]]} />
      </SettingRow>
      <SettingRow name="Guided steps" detail={`Ask “show me how to…” and ${name} spotlights one step at a time. With “When I click it”, doing the step is enough: it looks again and plans the next one from what's really on screen.`} modified={prefs.guide !== "click"}>
        <Segmented label="Advance guided steps" value={prefs.guide} onChange={(guide) => set({ guide })} options={[["click", "When I click it"], ["manual", "When I say done"]]} />
      </SettingRow>
      <SettingRow name="Looking at your screen" detail={screen === false ? "Settings can show this on while the grant is ignored — usually an unsigned build. Allow ShuaCrew once, then quit the app once. After that it stays on." : "Only when you ask with the eye on: one screenshot of the display it's on (itself left out), attached to that question. Live viewing and screen memory are separate controls above."}>
        {native() && (screen === true ? <span className="spark-screen-ok">On</span> : screen === false
          ? <button type="button" className="tb-btn" onClick={() => native()?.postMessage({ type: "buddyScreenAccess", request: true, openSettings: true })}>Allow in System Settings</button>
          : <button type="button" className="tb-btn" onClick={() => native()?.postMessage({ type: "buddyScreenAccess" })}>Check</button>)}
      </SettingRow>
      <SettingRow name="Doing things" detail="Opens apps, websites, and files or folders in your home folder; starts focus timers; adds to your note; hands big jobs to the crew. The Mac app checks every action. Mouse and keyboard actions follow the control mode above. Results appear in the track record." />
      <TrackRecord name={name} />
      <div className="spark-foot"><button type="button" className="tb-btn" onClick={() => { resetWelcome(); window.dispatchEvent(new Event("shuacrew:welcome")); }}>Replay welcome</button><button type="button" className="tb-btn" onClick={() => saveCompanion({ ...parseCompanion(null), enabled: prefs.enabled })}>Reset {name}</button></div>
    </section>}
  </div>;
}

/** How Spark has actually done for you: every action it took, and whether it worked. */
/** The chat window's look: solid or glass, tone, corners, text size, header — with a live preview. */
function ChatLook({ prefs, set, name }: { prefs: CompanionPreferences; set: (patch: Partial<CompanionPreferences>) => void; name: string }) {
  return <>
    <div className="chat-look-preview" aria-hidden>
      <section className="buddy-card spk" data-chat-style={prefs.chatStyle} data-chat-tone={prefs.chatTone} data-chat-corners={prefs.chatCorners} data-chat-text={prefs.chatText} data-chat-header={prefs.chatHeader}>
        <header className="spk-head"><b>{name}</b><span className="spk-status spk-pill"><i className="spk-dot" />Ready</span></header>
        <div className="spk-thread">
          <div className="spk-row is-you"><div className="buddy-msg is-you">Anything I should know this morning?</div></div>
          <div className="spk-row"><div className="buddy-msg is-spark">Two approvals are waiting, and your mission finished overnight. Want the summary?</div></div>
        </div>
      </section>
    </div>
    <SettingRow name="Chat window" detail="Solid is opaque and easy to read over anything. Glass lets your desktop show through, frosted." modified={prefs.chatStyle !== "solid"}>
      <Segmented label="Chat window" value={prefs.chatStyle} onChange={(chatStyle) => set({ chatStyle })} options={[["solid", "Solid"], ["glass", "Glass"]]} />
    </SettingRow>
    <SettingRow name="Tone" detail="Theme follows your palette; Deep is darker and calmer; Accent tints it with your accent colour." modified={prefs.chatTone !== "theme"}>
      <Segmented label="Tone" value={prefs.chatTone} onChange={(chatTone) => set({ chatTone })} options={[["theme", "Theme"], ["deep", "Deep"], ["accent", "Accent"]]} />
    </SettingRow>
    <SettingRow name="Corners" modified={prefs.chatCorners !== "round"}>
      <Segmented label="Corners" value={prefs.chatCorners} onChange={(chatCorners) => set({ chatCorners })} options={[["round", "Round"], ["soft", "Soft"], ["square", "Square"]]} />
    </SettingRow>
    <SettingRow name="Text size" modified={prefs.chatText !== "m"}>
      <Segmented label="Text size" value={prefs.chatText} onChange={(chatText) => set({ chatText })} options={[["s", "Small"], ["m", "Medium"], ["l", "Large"]]} />
    </SettingRow>
    <SettingRow name="Header" detail="Gradient washes the top of the window in your accent." modified={prefs.chatHeader !== "plain"}>
      <Segmented label="Header" value={prefs.chatHeader} onChange={(chatHeader) => set({ chatHeader })} options={[["plain", "Plain"], ["gradient", "Gradient"]]} />
    </SettingRow>
  </>;
}

/** Customize the notch: what the island shows and how it glows, with a live preview. */
function NotchLook({ prefs, set, name }: { prefs: CompanionPreferences; set: (patch: Partial<CompanionPreferences>) => void; name: string }) {
  return <>
    <h4 className="spark-h">Customize the notch</h4>
    <div className="notch-look-preview buddy" data-notch-glow={prefs.notchGlow} aria-hidden>
      <div className="shua-island is-live" style={{ "--hw": "120px", "--hh": "26px", "--flare": "96px", "--drop": prefs.notchCaptions ? "46px" : "0px" } as CSSProperties}>
        <div className="shua-island-shape">
          <div className="shua-island-ears"><span className="shua-island-ear"><i className="shua-island-face is-speaking" />{prefs.notchMedia && <i className="notch-look-art" />}</span><span className="shua-island-cam" /><span className="shua-island-ear is-live"><i className="shua-island-dot" /></span></div>
          {prefs.notchCaptions && <div className="shua-island-live"><div className="notch-caption"><p className="notch-caption-now"><span className="is-said">Your build passed, </span><span className="is-said">and two </span><span>approvals are waiting.</span></p></div></div>}
        </div>
      </div>
    </div>
    <SettingRow name="While you talk" detail={`A waveform moves with your voice, and your words appear the moment you stop — so you can catch a mishearing before ${name} answers. Or show your words live as you speak (they shift as it works out what you said).`} modified={prefs.notchHearing !== "wave"}>
      <Segmented label="While you talk" value={prefs.notchHearing} onChange={(notchHearing) => set({ notchHearing })} options={[["wave", "Waveform"], ["words", "Waveform + words"]]} />
    </SettingRow>
    <SettingRow name={`${name}'s captions`} detail={`While ${name} talks, the notch shows the words as they're said, sentence by sentence, so you can read along when it says a lot.`} modified={!prefs.notchCaptions}><Switch label={`${name}'s captions`} on={prefs.notchCaptions} onChange={(notchCaptions) => set({ notchCaptions })} /></SettingRow>
    <SettingRow name="Now playing" detail="Music or Spotify in the notch: artwork, title, progress and play, pause and skip. It only reads a player that's already open." modified={!prefs.notchMedia}><Switch label="Now playing" on={prefs.notchMedia} onChange={(notchMedia) => set({ notchMedia })} /></SettingRow>
    <SettingRow name="Mic & screen controls" detail={`Turn the mic and live screen watching on or off right from the notch and the chat's top edge.`} modified={!prefs.notchControls}><Switch label="Mic and screen controls" on={prefs.notchControls} onChange={(notchControls) => set({ notchControls })} /></SettingRow>
    <SettingRow name="Sounds" detail={`A soft sound when you start talking (hold fn or voice mode), when ${name} has heard you, and when something's done. Spatial places them up at the notch — best with headphones.`} modified={prefs.sounds !== "spatial"}>
      <Segmented label="Sounds" value={prefs.sounds} onChange={(sounds) => { set({ sounds }); soundStyle(sounds, prefs.soundPack); earcon("listen", sounds, 0.7, prefs.soundPack); setTimeout(() => earcon("sent", sounds, 0.7, prefs.soundPack), 650); }} options={[["spatial", "Spatial"], ["simple", "Simple"], ["off", "Off"]]} />
    </SettingRow>
    {prefs.sounds !== "off" && <SettingRow name="Sound" detail="The instrument. Pick one to hear the start-talking and heard-you pair.">
      <div className="spark-packs" role="radiogroup" aria-label="Sound">{SOUND_PACKS.map((pack) => <button key={pack} type="button" role="radio" aria-checked={prefs.soundPack === pack} className={prefs.soundPack === pack ? "is-on" : ""}
        onClick={() => { set({ soundPack: pack }); soundStyle(prefs.sounds, pack); earcon("listen", prefs.sounds, 0.7, pack); setTimeout(() => earcon("sent", prefs.sounds, 0.7, pack), 600); }}>
        <b><AudioLines size={12} /> {PACK_INFO[pack].name}</b><small>{PACK_INFO[pack].blurb}</small></button>)}</div>
    </SettingRow>}
    <SettingRow name="Glow" detail="Accent lights the island's edge while it's open or talking; Spectrum runs your palette's gradient round it." modified={prefs.notchGlow !== "accent"}>
      <Segmented label="Glow" value={prefs.notchGlow} onChange={(notchGlow) => set({ notchGlow })} options={[["off", "Off"], ["accent", "Accent"], ["spectrum", "Spectrum"]]} />
    </SettingRow>
    <SettingRow name="Island size" detail="Roomy shows radio, sessions and your focus timer when you hover; Compact keeps just ask, controls, captions and music." modified={prefs.notchSize !== "roomy"}>
      <Segmented label="Island size" value={prefs.notchSize} onChange={(notchSize) => set({ notchSize })} options={[["roomy", "Roomy"], ["compact", "Compact"]]} />
    </SettingRow>
  </>;
}

/** Spark for Chrome: the pairing key to paste into the extension once, and how to install it. */
function ChromeRow({ name }: { name: string }) {
  const [key, setKey] = useState(""), [shown, setShown] = useState(false), [copied, setCopied] = useState(false);
  useEffect(() => { void api<{ key: string }>("/api/ext/key").then((r) => setKey(r.key)).catch(() => setKey("")); }, []);
  const copy = () => void navigator.clipboard.writeText(key).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }).catch(() => setShown(true));
  return <SettingRow name="Spark for Chrome" detail={<>Highlight anything on the web and {name} explains, summarizes, rewrites, drafts a reply, saves it to your Library or hands it to the crew. Install: open <code>chrome://extensions</code>, turn on Developer mode, choose <b>Load unpacked</b> and pick <code>~/Developer/projects/shuacrew/apps/chrome</code>. Then click the Spark icon and paste this key. It only works with ShuaCrew on this Mac.</>}>
    {key ? <span className="spark-reach-key">
      <code>{shown ? key : "•".repeat(12)}</code>
      <button type="button" onClick={() => setShown((v) => !v)}>{shown ? "Hide" : "Show"}</button>
      <button type="button" className="spark-reach-go" onClick={copy}>{copied ? "Copied" : "Copy key"}</button>
    </span> : <span className="spark-reach-state">Restart ShuaCrew to enable</span>}
  </SettingRow>;
}

/** fn (Globe) key: tap for Spark's quick card beside your pointer, hold to talk. The Mac app watches the key. */
function FnKeyRow({ name }: { name: string }) {
  const bridge = (window as { webkit?: { messageHandlers?: { shuacrew?: { postMessage(m: unknown): void } } } }).webkit?.messageHandlers?.shuacrew;
  const [state, setState] = useState<{ on: boolean; globe: number; trusted: boolean } | null>(null);
  useEffect(() => {
    const on = (e: Event) => setState((e as CustomEvent<{ on: boolean; globe: number; trusted: boolean }>).detail);
    window.addEventListener("shuacrew:fnKey", on);
    bridge?.postMessage({ type: "buddyFnKey" });
    return () => window.removeEventListener("shuacrew:fnKey", on);
  }, []);
  if (!bridge) return null;
  const clash = state && state.globe !== 0 ? ["", "switches your input source", "opens the emoji picker", "starts dictation"][state.globe] ?? "does something else" : "";
  return <SettingRow name="fn key" detail={<>Tap <kbd>fn</kbd> for a small {name} card beside your pointer instead of the full chat; hold <kbd>fn</kbd> to talk and let go to send. It guides you one step at a time right where you're working.{state && !state.trusted ? <b> Needs Accessibility access (System Settings → Privacy & Security → Accessibility → ShuaCrew) to hear fn in other apps.</b> : null}{clash ? <b> Your Mac's “Press 🌐 key to” setting also {clash}. Set it to “Do Nothing” in System Settings → Keyboard.</b> : null}</>}>
    <Switch label="fn key" on={state?.on ?? true} onChange={(on) => bridge.postMessage({ type: "buddyFnKey", on })} />
  </SettingRow>;
}

function WakeRow({ name, nickname }: { name: string; nickname: string }) {
  const wake = useWakeWord(nickname ? [nickname] : []);
  if (!wake.available) return null;
  const on = !!wake.state?.on;
  return <SettingRow name={`“Hey ${name}”`} detail={`Say “Hey ${name}” (or “Hey Spark”) from anywhere and it opens, ready to listen. Recognised on this Mac with Apple's on-device speech — no audio leaves it. The mic indicator stays on while this listens.${wake.state?.error ? ` ${wake.state.error}` : ""}`} modified={on}>
    <Switch label="Wake word" on={on} onChange={(v) => wake.set(v)} />
  </SettingRow>;
}

function ScreenMemoryRow({ name }: { name: string }) {
  const mem = useScreenMemory();
  if (!mem.available) return null;
  const on = !!mem.state?.on;
  return <SettingRow name="Screen memory" detail={`${name} reads the text on your screen about once a minute so you can ask “what was that error an hour ago?”. Text only, kept 3 days on this Mac; skips password managers, private windows and minutes you're away. See or forget it in Policy & Audit.${mem.state && !mem.state.access ? " Needs Screen Recording permission for ShuaCrew." : ""}`} modified={on}>
    <Switch label="Screen memory" on={on} onChange={(v) => mem.set(v)} />
  </SettingRow>;
}

function TrackRecord({ name }: { name: string }) {
  const log = useSparkLog(), s = summary(log);
  return <div className="spark-record">
    <div className="spark-record-head"><b>Track record</b><span>{s.total ? `${s.ok} of ${s.total} actions worked this week${s.rate !== null ? ` · ${s.rate}%` : ""}` : `Nothing yet — actions ${name} takes show up here with how they went.`}</span></div>
    {log.slice(-8).reverse().map((e) => <div key={e.at + e.label} className={`spark-record-row ${e.ok ? "is-ok" : "is-bad"}`}><i />{e.label}<small>{e.ok ? e.message : e.message || "didn't work"}</small><time>{new Date(e.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></div>)}
  </div>;
}
