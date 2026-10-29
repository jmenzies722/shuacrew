/**
 * The music in the notch: five frequency bands of whatever Music or Spotify is playing, measured on this Mac by the
 * app (a Core Audio tap on those apps only — levels, never recorded) and pushed here every display frame. The notch's
 * equalizer reads them the way it reads Shua's voice. Nothing here re-renders React: the bars read on their own frame.
 */
import { useEffect, useState } from "react";
import { post } from "../screens/spark/bridge";

export type MusicMeterState = "off" | "starting" | "live" | "denied" | "unavailable";

const BANDS = 5;
let bands = new Array<number>(BANDS).fill(0);
let receivedAt = 0;
let state: MusicMeterState = "off";
const listeners = new Set<(s: MusicMeterState) => void>();
const wakers = new Set<() => void>();

/** Called once when the next levels arrive: a resting frame loop sleeps until there's something new to draw. */
export function onNextMusicLevels(wake: () => void) { wakers.add(wake); return () => { wakers.delete(wake); }; }

/** Called by the Mac app with the newest levels (0…1, low → high). */
export function receiveMusicLevels(next: ArrayLike<number>) {
  if (next.length !== BANDS) return;
  for (let i = 0; i < BANDS; i++) { const v = Number(next[i]); bands[i] = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0; }
  receivedAt = performance.now();
  if (wakers.size) { const ready = [...wakers]; wakers.clear(); for (const w of ready) w(); }
}

/** The bands right now, or null when the meter has gone quiet (paused, stopped, or never started). */
export function readMusicBands(now = performance.now()): readonly number[] | null {
  return state === "live" && now - receivedAt < 400 ? bands : null;
}

export function musicMeterState() { return state; }
function setState(next: MusicMeterState) {
  if (next === state) return;
  state = next;
  if (next !== "live") bands = new Array<number>(BANDS).fill(0);
  for (const l of listeners) l(next);
}

if (typeof window !== "undefined") {
  const w = window as unknown as { __musicLevels?: (b: number[]) => void };
  w.__musicLevels = receiveMusicLevels;
  window.addEventListener("shuacrew:musicMeter", (e) => {
    const s = (e as CustomEvent<{ state?: MusicMeterState }>).detail?.state;
    if (s && ["off", "starting", "live", "denied", "unavailable"].includes(s)) setState(s);
  });
}

/**
 * Run the meter while `app` is playing and the notch can show it; stop the moment it can't (paused, another view,
 * the Mac asleep). Returns the meter's state so the notch can fall back honestly when there are no real levels.
 */
export function useMusicMeter(on: boolean, app: string | undefined): MusicMeterState {
  const [current, setCurrent] = useState(state);
  useEffect(() => { listeners.add(setCurrent); return () => { listeners.delete(setCurrent); }; }, []);
  useEffect(() => {
    if (!on || !app) { post({ type: "buddyMusicMeter", on: false }); setState("off"); return; }
    if (state !== "live") setState("starting");
    post({ type: "buddyMusicMeter", on: true, app });
    return () => { post({ type: "buddyMusicMeter", on: false }); };
  }, [on, app]);
  return current;
}

/**
 * The cover's colour, for tinting the bars (like the iPhone's Dynamic Island): the most vivid of its average tones,
 * lifted so it reads on black. Null when the image can't be read (a cross-origin cover without CORS).
 */
export function artTint(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onerror = () => resolve(null);
    img.onload = () => {
      try {
        const size = 12, canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const g = canvas.getContext("2d", { willReadFrequently: true });
        if (!g) return resolve(null);
        g.drawImage(img, 0, 0, size, size);
        resolve(vividTint(g.getImageData(0, 0, size, size).data));
      } catch { resolve(null); }
    };
    img.src = src;
  });
}

/** Pure: RGBA pixels → a bright, saturated CSS colour weighted toward the cover's most colourful pixels. */
export function vividTint(px: ArrayLike<number>): string | null {
  let r = 0, g = 0, b = 0, weight = 0;
  for (let i = 0; i + 3 < px.length; i += 4) {
    const R = px[i]! / 255, G = px[i + 1]! / 255, B = px[i + 2]! / 255;
    const max = Math.max(R, G, B), min = Math.min(R, G, B), sat = max === 0 ? 0 : (max - min) / max;
    // Colourful, not too dark: grey and near-black pixels barely count.
    const w = sat * sat * max + 0.002;
    r += R * w; g += G * w; b += B * w; weight += w;
  }
  if (!weight) return null;
  const [h, s0, l0] = toHsl(r / weight, g / weight, b / weight);
  // A black-and-white cover stays near white rather than getting an invented hue.
  const s = s0 < 0.12 ? 0.08 : Math.max(s0, 0.5), l = Math.min(0.8, Math.max(l0, 0.64));
  return `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
}

function toHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
