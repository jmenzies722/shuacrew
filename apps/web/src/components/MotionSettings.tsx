import { useState } from "react";
import { Sparkles } from "lucide-react";
import { saveLook, useLook } from "../lib/look";
import { Segmented, SettingRow } from "./SettingControls";

export function MotionSettings() {
  const look = useLook();
  const [replay, setReplay] = useState(0);
  return <>
    <SettingRow name="Motion character" detail="Calm keeps things still. Responsive adds gentle movement. Expressive gives entrances and interactions more energy. Reduced motion takes priority.">
      <Segmented label="Motion character" value={look.motionStyle} options={[["calm", "Calm"], ["responsive", "Responsive"], ["expressive", "Expressive"]]} onChange={(motionStyle) => saveLook({ motionStyle })} />
    </SettingRow>
    <button type="button" className="motion-preview" onClick={() => setReplay((n) => n + 1)} aria-label="Replay motion preview">
      <span className="motion-preview-orbit" key={`${look.motionStyle}-${replay}`}><Sparkles size={22} /></span>
      <span><strong>Find your rhythm</strong><small>Click to replay · your theme, your pace</small></span>
      <span aria-hidden="true">↻</span>
    </button>
  </>;
}
