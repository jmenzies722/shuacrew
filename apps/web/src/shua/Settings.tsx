import type { ReactNode } from "react";
import { saveCompanion, useCompanion, type CompanionPreferences } from "../lib/companion";
import { saveBuddyVoice, useBuddyVoice } from "../lib/buddy-voice";
import { useLive } from "../lib/live";
import { openClassic } from "./App";

/** The few settings that change how Shua feels day to day. They're the notch's own (shared storage): change one here
 * and the notch follows at once. Everything else is in the classic settings, one click away. */
export function Settings() {
  const prefs = useCompanion(), voice = useBuddyVoice(), connection = useLive((s) => s.connection);
  const set = (patch: Partial<CompanionPreferences>) => saveCompanion({ ...prefs, ...patch });
  return (
    <div className="page">
      <div className="page-head"><h1>Settings</h1><p>Shared with the notch</p></div>
      <div className="settings">
        <Row title="Shua speaks" hint="Replies are spoken as well as shown."><Switch on={voice.on} onChange={(on) => saveBuddyVoice({ on })} label="Shua speaks" /></Row>
        <Row title="Hands-free" hint="Keep listening after a reply, like a call. Off: tap or hold to talk."><Switch on={prefs.conversation} onChange={(conversation) => set({ conversation })} label="Hands-free" /></Row>
        <Row title="Shua uses your Mac" hint="Clicks, types and opens apps when you ask. Off: it only looks and points.">
          <Switch on={prefs.control !== "off"} onChange={(on) => set({ control: on ? "auto" : "off" })} label="Shua uses your Mac" />
        </Row>
        <Row title="Music in the notch" hint="The song playing, with bars that move to it."><Switch on={prefs.notchMedia} onChange={(notchMedia) => set({ notchMedia })} label="Music in the notch" /></Row>
        <Row title="Captions in the notch" hint="Shua's words under the notch while it talks."><Switch on={prefs.notchCaptions} onChange={(notchCaptions) => set({ notchCaptions })} label="Captions in the notch" /></Row>
        <Row title="Everything else" hint="Voices, sounds, appearance, models, privacy, iPhone…"><button type="button" className="btn" onClick={() => openClassic("/settings")}>Classic settings</button></Row>
        <Row title="Gateway" hint={connection === "live" ? "Connected — your sessions run here, on this Mac." : "Not connected — retrying."}><span className={`dot ${connection === "live" ? "is-live" : "is-off"}`} /></Row>
      </div>
    </div>
  );
}

function Row({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return <div className="setting"><div><b>{title}</b><small>{hint}</small></div>{children}</div>;
}
function Switch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return <button type="button" className="toggle" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />;
}
