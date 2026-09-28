import type { CSSProperties } from "react";
import { useScreenMemory, useWakeWord } from "../lib/screen-memory";
import { SPARK_FINISHES, sparkVars, stops } from "../lib/spark-color";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { api } from "../lib/api";
import { saveBuddyVoice, useBuddyVoice } from "../lib/buddy-voice";
import { parseCompanion, saveCompanion, ROBOT_CHARACTERS, SPARK_HOTKEYS, useCompanion, type CompanionPreferences, type SparkHotkey } from "../lib/companion";
import { CHARACTER_INFO, SparkCharacter, type Mood } from "./SparkCharacter";
import { Segmented, SettingRow, Switch } from "./SettingControls";
import "./spark-settings.css";
import "../screens/buddy.css";
import "../alive.css";
import { summary, useSparkLog } from "../lib/spark-log";
import { resetWelcome } from "./Welcome";

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
const swatchBg = (f: string) => { if (f === "theme") return "var(--amber)"; const s = stops(f); return s.gradient ? `linear-gradient(135deg, ${s.from}, ${s.to})` : s.from; };

type Native = { postMessage(m: unknown): void };
const native = () => (window as unknown as { webkit?: { messageHandlers?: { shuacrew?: Native } } }).webkit?.messageHandlers?.shuacrew;
const DESKTOP = "shuacrew.buddy.desktop";
const readDesktop = () => { try { return localStorage.getItem(DESKTOP) !== "0"; } catch { return true; } };

/** Spark, made yours: who it is, how it looks, how it sounds and talks, how you call it, how it shows you things. */
export function SparkSettings({ searching = false }: { searching?: boolean }) {
  const prefs = useCompanion(), voice = useBuddyVoice();
  const [category, setCategory] = useState<"character" | "presence" | "voice" | "guidance">("character");
  const [nameDraft, setNameDraft] = useState(prefs.nickname);
  useEffect(() => setNameDraft(prefs.nickname), [prefs.nickname]);
  const set = (patch: Partial<CompanionPreferences>) => saveCompanion({ ...prefs, ...patch });
  const [mood, setMood] = useState<Mood>("idle"), [desktop, setDesktop] = useState(readDesktop);
  const [voices, setVoices] = useState<Array<{ id: string; name: string; description?: string }>>([]);
  const [screen, setScreen] = useState<boolean | null>(null);
  useEffect(() => { void api<{ voices?: Array<{ id: string; name: string; description?: string }> }>("/api/speech/status").then((s) => setVoices(s.voices ?? [])).catch(() => {}); }, []);
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
      {ROBOT_CHARACTERS.some(id => id === prefs.character) && <>
        {prefs.character !== "spark" && <SettingRow name="Eye glow" detail="Give your robot its own little spark."><input type="color" className="spark-eye-color" value={prefs.eyeColor} onChange={e => set({ eyeColor: e.target.value })} aria-label="Robot eye color" /></SettingRow>}
        <SettingRow name="Expression"><Segmented label="Expression" value={prefs.face} onChange={(face) => set({ face })} options={[["calm", "Calm"], ["curious", "Curious"], ["bright", "Bright"]]} /></SettingRow>
        <SettingRow name="Accessory"><select className="setting-input" value={prefs.accessory} onChange={(e) => set({ accessory: e.target.value as CompanionPreferences["accessory"] })} aria-label="Accessory">{["none", "cap", "headphones", "scarf", "glasses", "antenna", "badge"].map((a) => <option key={a} value={a}>{a[0]!.toUpperCase() + a.slice(1)}</option>)}</select></SettingRow>
      </>}
      <SettingRow name="Energy" detail="Choose how lively your companion feels between conversations."><Segmented label="Robot energy" value={prefs.presence} onChange={presence => set({ presence })} options={[["interaction", "When we talk"], ["subtle", "Easygoing"], ["playful", "Playful"]]} /></SettingRow>
      <SettingRow name="Little victories" detail="How your robot celebrates completed crew work."><Segmented label="Celebrations" value={prefs.celebration} onChange={celebration => set({ celebration })} options={[["off", "Quiet"], ["subtle", "A little joy"], ["expressive", "Celebrate"]]} /></SettingRow>
    </section>}
    {(searching || category === "presence") && <section className="settings-card batch-pad"><h4 className="spark-h">Presence &amp; connected intelligence</h4>
      <SettingRow name="Brain" detail={<>Auto uses your connected providers and shared routing preferences, then falls back to a local model when needed. Each subscription keeps its own limits. Always on this Mac keeps model requests local. <a className="spark-link" href="#agents">Manage connected providers →</a></>} modified={prefs.brain !== "auto"}><Segmented label="Brain" value={prefs.brain} onChange={(brain) => set({ brain, modelChoice: "" })} options={[["auto", "Auto · connected providers"], ["local", "Always on this Mac"]]} /></SettingRow>
      <SettingRow name="Model on this Mac" detail="Smart (gpt-oss 20B) answers more precisely, first word in about a second. Fast (Llama 3.2 3B) answers almost instantly. Both run through Ollama." modified={prefs.localModel !== "gpt-oss:20b"}><Segmented label="Local model" value={prefs.localModel} onChange={(localModel) => set({ localModel })} options={[["gpt-oss:20b", "Smart"], ["llama3.2:3b", "Fast"]]} /></SettingRow>
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
      <SparkReach name={name} />
      <ChromeRow name={name} />
      <SettingRow name="Keep going on its own" detail={`Say “agent:” and a task (or let ${name} hand work to the crew) and it becomes a mission: ${name} stays with it, tells the crew to keep going when it stops early to ask or hits a failure (up to 3 times), and tells you when it's done. It never approves anything for you.`} modified={!prefs.persist}><Switch label="Keep going on its own" on={prefs.persist} onChange={(persist) => set({ persist })} /></SettingRow>
      <SettingRow name="Size on the desktop" modified={prefs.size !== "m"}><Segmented label="Size" value={prefs.size} onChange={(size) => set({ size })} options={[["s", "Small"], ["m", "Medium"], ["l", "Large"]]} /></SettingRow>
      <ChatLook prefs={prefs} set={set} name={name} />

    </section>}

    {(searching || category === "voice") && <section className="settings-card batch-pad">
      <h4 className="spark-h">Personality &amp; voice</h4>
      <SettingRow name="Personality" detail="How it talks to you. Your instructions to the crew are unchanged." modified={prefs.tone !== "cheerful"}>
        <Segmented label="Personality" value={prefs.tone} onChange={(tone) => set({ tone })} options={[["cheerful", "Cheerful"], ["chill", "Chill"], ["direct", "Direct"], ["coach", "Coach"]]} />
      </SettingRow>
      <label className="spark-personality"><strong>Make it sound like your sidekick</strong><span>Favorite phrases, a sense of humor, or how you like to be encouraged. Used for future conversations.</span><textarea rows={4} maxLength={1000} value={prefs.personality} onChange={e => set({ personality: e.target.value })} placeholder="A curious co-pilot. Dry humor, clear explanations, and a tiny celebration when a tricky bug is gone." /><small>{prefs.personality.length} / 1000</small></label>
      <SettingRow name="Answers" modified={prefs.length !== "brief"}><Segmented label="Answer length" value={prefs.length} onChange={(length) => set({ length })} options={[["brief", "Brief"], ["detailed", "Detailed"]]} /></SettingRow>
      <SettingRow name={`${name} talks`} detail="Spoken as the answer streams in, with a local neural voice. Nothing leaves this Mac." modified={!voice.on}><Switch label="Talks" on={voice.on} onChange={(on) => saveBuddyVoice({ on })} /></SettingRow>
      <SettingRow name="Conversation" detail={`Open mic while ${name}'s card is open: just talk, no buttons. It hears when you stop, answers out loud, and listens again. Transcribed on this Mac.`} modified={prefs.conversation}>
        <Switch label="Conversation" on={prefs.conversation} onChange={(conversation) => set({ conversation })} />
      </SettingRow>
      {prefs.conversation && <SettingRow name="Talk over to interrupt" detail={`Start speaking while ${name} talks and it stops to listen.`} modified={!prefs.interrupt}><Switch label="Interrupt" on={prefs.interrupt} onChange={(interrupt) => set({ interrupt })} /></SettingRow>}
      <SettingRow name="Change me by asking" detail={`Say “talk faster”, “use Ryan's voice”, “be more direct”, “call yourself Nova”, “make yourself purple”, “stop clicking things”: ${name} updates these settings itself.`} />
      {voice.on && <SettingRow name="Voice" detail={voices.length ? undefined : "Install local speech in Settings → Shua voice."}>
        <select className="setting-input" value={voice.id} onChange={(e) => saveBuddyVoice({ id: e.target.value })} aria-label="Voice">{(voices.length ? voices : [{ id: voice.id, name: voice.id }]).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
        <Segmented label="Speed" value={String(voice.speed) as "0.9" | "1" | "1.15"} onChange={(v) => saveBuddyVoice({ speed: Number(v) })} options={[["0.9", "Calm"], ["1", "Normal"], ["1.15", "Quick"]]} />
      </SettingRow>}
    </section>}

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
    <SettingRow name="Live captions" detail={`While ${name} talks, the notch shows the words as they're said, sentence by sentence, so you can read along when it says a lot.`} modified={!prefs.notchCaptions}><Switch label="Live captions" on={prefs.notchCaptions} onChange={(notchCaptions) => set({ notchCaptions })} /></SettingRow>
    <SettingRow name="Now playing" detail="Music or Spotify in the notch: artwork, title, progress and play, pause and skip. It only reads a player that's already open." modified={!prefs.notchMedia}><Switch label="Now playing" on={prefs.notchMedia} onChange={(notchMedia) => set({ notchMedia })} /></SettingRow>
    <SettingRow name="Mic & screen controls" detail={`Turn the mic and live screen watching on or off right from the notch and the chat's top edge.`} modified={!prefs.notchControls}><Switch label="Mic and screen controls" on={prefs.notchControls} onChange={(notchControls) => set({ notchControls })} /></SettingRow>
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
