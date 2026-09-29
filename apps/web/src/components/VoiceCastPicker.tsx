import { VOICE_CAST, currentVoice } from "../lib/voices";
import type { MemberVoice } from "@shuacrew/core/voice";
export function VoiceCastPicker({ value, onChange, disabled = false }: { value: MemberVoice; onChange: (value: MemberVoice) => void; disabled?: boolean }) {
  return <div className="grid grid-cols-3 gap-3 max-[600px]:grid-cols-1">
    <label className="field"><span>Voice</span><select disabled={disabled} value={currentVoice(value.voiceId)} onChange={e => onChange({ ...value, voiceId: e.target.value })}>{VOICE_CAST.map(v => <option key={v.id} value={v.id}>{v.name} · {v.accent}, {v.about}</option>)}</select></label>
    <label className="field"><span>Personality</span><select disabled={disabled} value={value.personality} onChange={e => onChange({ ...value, personality: e.target.value as MemberVoice["personality"] })}>{["calm", "warm", "direct", "energetic"].map(p => <option value={p} key={p}>{p[0]!.toUpperCase() + p.slice(1)}</option>)}</select></label>
    <label className="field"><span>Playback pace</span><select disabled={disabled} value={value.speed} onChange={e => onChange({ ...value, speed: Number(e.target.value) })}>{[.8, .9, 1, 1.1, 1.2].map(speed => <option value={speed} key={speed}>{speed}×{speed === 1 ? " · Natural" : ""}</option>)}</select></label>
  </div>;
}
