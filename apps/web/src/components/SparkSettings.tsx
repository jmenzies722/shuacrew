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
const swatchBg = (f: string) => { const s = stops(f); return s.gradient ? `linear-gradient(135deg, ${s.from}, ${s.to})` : s.from; };

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
function TrackRecord({ name }: { name: string }) {
  const log = useSparkLog(), s = summary(log);
  return <div className="spark-record">
    <div className="spark-record-head"><b>Track record</b><span>{s.total ? `${s.ok} of ${s.total} actions worked this week${s.rate !== null ? ` · ${s.rate}%` : ""}` : `Nothing yet — actions ${name} takes show up here with how they went.`}</span></div>
    {log.slice(-8).reverse().map((e) => <div key={e.at + e.label} className={`spark-record-row ${e.ok ? "is-ok" : "is-bad"}`}><i />{e.label}<small>{e.ok ? e.message : e.message || "didn't work"}</small><time>{new Date(e.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></div>)}
  </div>;
}
