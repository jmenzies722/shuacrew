import { useEffect, useState } from "react";
import { getMicPreference, setMicPreference } from "../lib/mic-route";
import { SettingRow } from "./SettingControls";

export function MicrophoneSettings() {
  const [selected, setSelected] = useState(getMicPreference);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    let active = true;
    const refresh = () => { void navigator.mediaDevices?.enumerateDevices().then(items => { if (active) setDevices(items.filter(item => item.kind === "audioinput" && item.deviceId && item.deviceId !== "default")); }).catch(() => {}); };
    const sync = () => { setSelected(getMicPreference()); refresh(); };
    refresh();
    navigator.mediaDevices?.addEventListener("devicechange", refresh);
    window.addEventListener("shuacrew:mic-route", sync);
    return () => { active = false; navigator.mediaDevices?.removeEventListener("devicechange", refresh); window.removeEventListener("shuacrew:mic-route", sync); };
  }, []);
  return <SettingRow name="Microphone" detail="System default follows your selected input, including AirPods or a USB microphone. For Bluetooth listening with the Mac microphone, choose Built-in. Audio output follows your system output.">
    <select aria-label="Microphone" value={selected} onChange={event => setMicPreference(event.target.value)}>
      <option value="default">System default</option>
      <option value="built-in">Built-in with Bluetooth audio</option>
      {devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}
      {!["default", "built-in"].includes(selected) && !devices.some(device => device.deviceId === selected) && <option value={selected}>Unavailable · using system fallback</option>}
    </select>
  </SettingRow>;
}
