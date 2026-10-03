let route: { bluetooth: boolean; mic: string } = { bluetooth: false, mic: "" };
export function setMicRoute(r: { bluetooth?: boolean; mic?: string }) { route = { bluetooth: !!r.bluetooth, mic: typeof r.mic === "string" ? r.mic : "" }; }
const KEY = "shuacrew.microphone";
let preference = (() => { try { return localStorage.getItem(KEY) || "default"; } catch { return "default"; } })();
export const getMicPreference = () => preference;
export function setMicPreference(value: string) {
  preference = value;
  try { localStorage.setItem(KEY, value); } catch {}
  if (typeof window !== "undefined") window.dispatchEvent(new Event("shuacrew:mic-route"));
}
if (typeof window !== "undefined") window.addEventListener("storage", event => {
  if (event.key !== KEY) return;
  preference = event.newValue || "default";
  window.dispatchEvent(new Event("shuacrew:mic-route"));
});

export async function micConstraints(base: MediaTrackConstraints): Promise<MediaTrackConstraints> {
  if (preference === "default") return base;
  if (preference !== "built-in") return { ...base, deviceId: { ideal: preference } };
  if (!route.bluetooth || !route.mic) return base;
  try {
    const mic = (await navigator.mediaDevices.enumerateDevices()).find((d) => d.kind === "audioinput" && d.label === route.mic);
    return mic ? { ...base, deviceId: { exact: mic.deviceId } } : base;
  } catch { return base; }
}
