import { useScreenMemory, useWakeWord } from "../lib/screen-memory";
import { SPARK_FINISHES, sparkVars, stops } from "../lib/spark-color";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { api } from "../lib/api";
import { saveBuddyVoice, useBuddyVoice } from "../lib/buddy-voice";
import { parseCompanion, saveCompanion, SPARK_CHARACTERS, SPARK_HOTKEYS, useCompanion, type CompanionPreferences, type SparkHotkey } from "../lib/companion";
import { CHARACTER_INFO, SparkCharacter, type Mood } from "./SparkCharacter";
import { Segmented, SettingRow, Switch } from "./SettingControls";
import "./spark-settings.css";
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
export function SparkSettings() {
  const prefs = useCompanion(), voice = useBuddyVoice();
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
        <div className="spark-moods" role="group" aria-label="Try a mood">{(["idle", "thinking", "speaking", "happy"] as Mood[]).map((m) => <button key={m} type="button" aria-pressed={mood === m} onClick={() => setMood(m)}>{m}</button>)}</div>
      </div>
      <div className="spark-identity">
        <label className="spark-name"><small>Name</small><input value={prefs.nickname} maxLength={24} onChange={(e) => set({ nickname: e.target.value })} aria-label="Your buddy's name" placeholder="Spark" /></label>
        <p>{name} lives on your desktop, over every app. {native() ? "Click it or press " : "In the Mac app, press "}<kbd>{SPARK_HOTKEYS[prefs.hotkey]}</kbd> to ask, and drag it anywhere.</p>
        <div className="spark-toggle"><span>On your desktop</span><Switch label="Show on the desktop" on={desktop} onChange={toggleDesktop} /></div>
      </div>
    </section>

    <section className="settings-card batch-pad">
      <h4 className="spark-h">Character</h4>
      <div className="spark-gallery">{SPARK_CHARACTERS.map((id) => <button key={id} type="button" className={prefs.character === id ? "is-on" : ""} aria-pressed={prefs.character === id} onClick={() => set({ character: id })} style={sparkVars(prefs.color)}>
        <SparkCharacter preferences={{ ...prefs, character: id }} size={64} /><strong>{CHARACTER_INFO[id].name}</strong><small>{CHARACTER_INFO[id].blurb}</small>{prefs.character === id && <i><Check size={11} /></i>}
      </button>)}</div>
      <SettingRow name="Finish" detail="A colour, true black, or a gradient. Tints the character, its chat, and the cursor and spotlight when it shows you something.">
        <div className="spark-swatches">{SPARK_FINISHES.map((f) => <button key={f.id} type="button" title={f.name} aria-label={f.name} aria-pressed={prefs.color === f.id} style={{ background: swatchBg(f.id) }} onClick={() => set({ color: f.id })} />)}
          <label className="spark-custom" title="Any colour"><input type="color" value={stops(prefs.color).from} onChange={(e) => set({ color: e.target.value })} aria-label="Custom colour" /></label></div>
      </SettingRow>
      <SettingRow name="Brain" detail={`Auto: ${name} thinks with Claude, and when Claude is out of usage it switches to a model running on this Mac — no limits, works offline, nothing leaves the Mac. Always on this Mac: private all the time.`} modified={prefs.brain !== "auto"}><Segmented label="Brain" value={prefs.brain} onChange={(brain) => set({ brain })} options={[["auto", "Auto"], ["local", "Always on this Mac"]]} /></SettingRow>
      <SettingRow name="Model on this Mac" detail="Smart (gpt-oss 20B) answers more precisely, first word in about a second. Fast (Llama 3.2 3B) answers almost instantly. Both run through Ollama." modified={prefs.localModel !== "gpt-oss:20b"}><Segmented label="Local model" value={prefs.localModel} onChange={(localModel) => set({ localModel })} options={[["gpt-oss:20b", "Smart"], ["llama3.2:3b", "Fast"]]} /></SettingRow>
      <SettingRow name="Language" detail={`English is fastest and shows live captions. Any language: speak whatever you like — Whisper detects it on this Mac and ${name} answers in it (captions pause).`} modified={prefs.language !== "en"}><Segmented label="Language" value={prefs.language} onChange={(language) => set({ language })} options={[["en", "English"], ["auto", "Any language"]]} /></SettingRow>
      <WakeRow name={name} nickname={prefs.nickname} />
      <ScreenMemoryRow name={name} />
      <SettingRow name="Radio DJ" detail={`${name} introduces each new track or station in a line or two, with the occasional crew update. The music dips under the voice.`} modified={prefs.dj}><Switch label="Radio DJ" on={prefs.dj} onChange={(dj) => set({ dj })} /></SettingRow>
      <SettingRow name="Stay on top" detail={`Off: ${name} sits on your desktop like any window — it won't cover your work, and comes forward when you call it, when it talks, and while it's teaching. Drag it anywhere; it stays there.`} modified={prefs.onTop}><Switch label="Stay on top" on={prefs.onTop} onChange={(onTop) => set({ onTop })} /></SettingRow>
      <SparkReach name={name} />
      <ChromeRow name={name} />
      <SettingRow name="Keep going on its own" detail={`Say “agent:” and a task (or let ${name} hand work to the crew) and it becomes a mission: ${name} stays with it, tells the crew to keep going when it stops early to ask or hits a failure (up to 3 times), and tells you when it's done. It never approves anything for you.`} modified={!prefs.persist}><Switch label="Keep going on its own" on={prefs.persist} onChange={(persist) => set({ persist })} /></SettingRow>
      <SettingRow name="Size on the desktop" modified={prefs.size !== "m"}><Segmented label="Size" value={prefs.size} onChange={(size) => set({ size })} options={[["s", "Small"], ["m", "Medium"], ["l", "Large"]]} /></SettingRow>
      {prefs.character === "spark" && <>
        <SettingRow name="Expression"><Segmented label="Expression" value={prefs.face} onChange={(face) => set({ face })} options={[["calm", "Calm"], ["curious", "Curious"], ["bright", "Bright"]]} /></SettingRow>
        <SettingRow name="Accessory"><select className="setting-input" value={prefs.accessory} onChange={(e) => set({ accessory: e.target.value as CompanionPreferences["accessory"] })} aria-label="Accessory">{["none", "cap", "headphones", "scarf", "glasses", "antenna", "badge"].map((a) => <option key={a} value={a}>{a[0]!.toUpperCase() + a.slice(1)}</option>)}</select></SettingRow>
      </>}
    </section>

    <section className="settings-card batch-pad">
      <h4 className="spark-h">Personality &amp; voice</h4>
      <SettingRow name="Personality" detail="How it talks to you. Your instructions to the crew are unchanged." modified={prefs.tone !== "cheerful"}>
        <Segmented label="Personality" value={prefs.tone} onChange={(tone) => set({ tone })} options={[["cheerful", "Cheerful"], ["chill", "Chill"], ["direct", "Direct"], ["coach", "Coach"]]} />
      </SettingRow>
      <SettingRow name="Answers" modified={prefs.length !== "brief"}><Segmented label="Answer length" value={prefs.length} onChange={(length) => set({ length })} options={[["brief", "Brief"], ["detailed", "Detailed"]]} /></SettingRow>
      <SettingRow name={`${name} talks`} detail="Spoken as the answer streams in, with a local neural voice. Nothing leaves this Mac." modified={!voice.on}><Switch label="Talks" on={voice.on} onChange={(on) => saveBuddyVoice({ on })} /></SettingRow>
      <SettingRow name="Conversation" detail={`Open mic while ${name}'s card is open: just talk, no buttons. It hears when you stop, answers out loud, and listens again. Transcribed on this Mac.`} modified={prefs.conversation}>
        <Switch label="Conversation" on={prefs.conversation} onChange={(conversation) => set({ conversation })} />
      </SettingRow>
      {prefs.conversation && <SettingRow name="Talk over to interrupt" detail={`Start speaking while ${name} talks and it stops to listen.`} modified={!prefs.interrupt}><Switch label="Interrupt" on={prefs.interrupt} onChange={(interrupt) => set({ interrupt })} /></SettingRow>}
      <SettingRow name="Change me by asking" detail={`Say “talk faster”, “use Ryan's voice”, “be more direct”, “call yourself Nova”, “be the fox”, “make yourself purple”, “stop clicking things”: ${name} updates these settings itself.`} />
      {voice.on && <SettingRow name="Voice" detail={voices.length ? undefined : "Install local speech in Settings → Shua voice."}>
        <select className="setting-input" value={voice.id} onChange={(e) => saveBuddyVoice({ id: e.target.value })} aria-label="Voice">{(voices.length ? voices : [{ id: voice.id, name: voice.id }]).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
        <Segmented label="Speed" value={String(voice.speed) as "0.9" | "1" | "1.15"} onChange={(v) => saveBuddyVoice({ speed: Number(v) })} options={[["0.9", "Calm"], ["1", "Normal"], ["1.15", "Quick"]]} />
      </SettingRow>}
    </section>

    <section className="settings-card batch-pad">
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
      <SettingRow name="Looking at your screen" detail={screen === false ? "Settings can show this on while the grant is ignored — usually an unsigned build. Allow ShuaCrew once, then quit the app once. After that it stays on." : "Only when you ask with the eye on: one screenshot of the display it's on (itself left out), attached to that question. Never recorded, never in the background."}>
        {native() && (screen === true ? <span className="spark-screen-ok">On</span> : screen === false
          ? <button type="button" className="tb-btn" onClick={() => native()?.postMessage({ type: "buddyScreenAccess", request: true, openSettings: true })}>Allow in System Settings</button>
          : <button type="button" className="tb-btn" onClick={() => native()?.postMessage({ type: "buddyScreenAccess" })}>Check</button>)}
      </SettingRow>
      <SettingRow name="Doing things" detail="Opens apps, websites, and files or folders in your home folder; starts focus timers; adds to your note; hands big jobs to the crew. The Mac app checks every action. It never clicks or types for you: it shows you." />
      <TrackRecord name={name} />
      <div className="spark-foot"><button type="button" className="tb-btn" onClick={() => { resetWelcome(); window.dispatchEvent(new Event("shuacrew:welcome")); }}>Replay welcome</button><button type="button" className="tb-btn" onClick={() => saveCompanion({ ...parseCompanion(null), enabled: prefs.enabled })}>Reset {name}</button></div>
    </section>
  </div>;
}

/** How Spark has actually done for you: every action it took, and whether it worked. */
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
