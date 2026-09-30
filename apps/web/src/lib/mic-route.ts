/**
 * Which microphone Spark listens through. Bluetooth headphones (AirPods, Beats…) drop to a muffled call mode the
 * moment their own mic opens — right as Spark's start sound plays. So when the Mac says sound is going to Bluetooth,
 * Spark listens through the Mac's built-in mic and the headphones stay high quality. The Mac app sends the route
 * each time fn goes down (window.buddy.audioRoute).
 */
let route: { bluetooth: boolean; mic: string } = { bluetooth: false, mic: "" };
export function setMicRoute(r: { bluetooth?: boolean; mic?: string }) { route = { bluetooth: !!r.bluetooth, mic: typeof r.mic === "string" ? r.mic : "" }; }

/** getUserMedia audio constraints, pinned to the built-in mic when the headphones are Bluetooth. */
export async function micConstraints(base: MediaTrackConstraints): Promise<MediaTrackConstraints> {
  if (!route.bluetooth || !route.mic) return base;
  try {
    const mic = (await navigator.mediaDevices.enumerateDevices()).find((d) => d.kind === "audioinput" && d.label === route.mic);
    return mic ? { ...base, deviceId: { exact: mic.deviceId } } : base;
  } catch { return base; }
}
