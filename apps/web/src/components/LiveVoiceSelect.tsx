import { useState } from "react";
import { LIVE_VOICES, liveVoice, setLiveVoice } from "../lib/live-session";

export function LiveVoiceSelect() {
  const [voice, setVoice] = useState(liveVoice);
  return <select className="setting-input" aria-label="Shua's native voice" value={voice} onChange={event => { setLiveVoice(event.target.value); setVoice(event.target.value); }} title="Native subscription voice. Changes apply to the next connection.">
    {LIVE_VOICES.map(option => <option key={option} value={option}>{option[0]!.toUpperCase() + option.slice(1)}</option>)}
  </select>;
}
