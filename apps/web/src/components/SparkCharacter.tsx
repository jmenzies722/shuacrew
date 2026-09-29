import { luminance, mix, stops } from "../lib/spark-color";
import { createContext, useContext, useId, type CSSProperties } from "react";
import type { CompanionPreferences, SparkCharacterId } from "../lib/companion";
import { RobotCharacter } from "./RobotCharacter";
import { SparkArt } from "./Companion";
import "./spark-character.css";

export type Mood = "idle" | "thinking" | "speaking" | "happy" | "concerned" | "sleepy";

export const CHARACTER_INFO: Record<SparkCharacterId, { name: string; blurb: string }> = {
  spark: { name: "Spark", blurb: "The original robot. Faces and accessories." },
  scout: { name: "Scout", blurb: "Pocket explorer. Big curiosity, tiny boots." },
  atlas: { name: "Atlas", blurb: "Your sturdy builder. Ready for the big ideas." },
  nova: { name: "Nova", blurb: "A floating co-pilot with a cosmic streak." },
  orb: { name: "Orb", blurb: "A calm ball of light with a little orbit." },
  byte: { name: "Byte", blurb: "A friendly pixel ghost that floats about." },
  kit: { name: "Kit", blurb: "A clever fox who notices everything." },
  blob: { name: "Blob", blurb: "Squishy, bouncy, always delighted." },
};

/** Real colours, not CSS variables: WebKit doesn't resolve variables inside SVG gradient stops. */
function shade(hex: string, toward: number, amount: number) {
  const v = parseInt(hex.slice(1), 16), mix = (c: number) => Math.round(c + (toward - c) * amount);
  return `#${[v >> 16 & 255, v >> 8 & 255, v & 255].map((c) => mix(c).toString(16).padStart(2, "0")).join("")}`;
}
interface Palette { base: string; light: string; deep: string; id: string }
const Pal = createContext<Palette>({ base: "#f5b544", light: "#fad9a1", deep: "#ab7f30", id: "c" });

/** Eyes and a mouth every character shares, so moods read the same whoever you pick. */
function Face({ cx, cy, gap = 12, eye = 5, mouthY = 12 }: { cx: number; cy: number; gap?: number; eye?: number; mouthY?: number }) {
  return <g className="ch-face">
    <g className="ch-eyes"><ellipse cx={cx - gap} cy={cy} rx={eye * 0.8} ry={eye} /><ellipse cx={cx + gap} cy={cy} rx={eye * 0.8} ry={eye} />
      <circle className="ch-glint" cx={cx - gap + 1.4} cy={cy - 1.8} r={1.3} /><circle className="ch-glint" cx={cx + gap + 1.4} cy={cy - 1.8} r={1.3} /></g>
    <path className="ch-smile" d={`M${cx - 6} ${cy + mouthY - 2} Q${cx} ${cy + mouthY + 4} ${cx + 6} ${cy + mouthY - 2}`} />
    <ellipse className="ch-mouth" cx={cx} cy={cy + mouthY} rx={4.5} ry={3.5} />
  </g>;
}

function Orb() {
  const c = useContext(Pal);
  return <svg viewBox="0 0 100 100">
    <defs><radialGradient id={`orb-g-${c.id}`} cx="38%" cy="32%" r="70%"><stop offset="0" stopColor="#fff" stopOpacity=".95" /><stop offset=".25" stopColor={c.base} /><stop offset="1" stopColor={c.deep} /></radialGradient></defs>
    <circle className="ch-aura" cx="50" cy="50" r="40" />
    <ellipse className="ch-orbit" cx="50" cy="52" rx="44" ry="12" />
    <circle cx="50" cy="50" r="31" fill={`url(#orb-g-${c.id})`} />
    <Face cx={50} cy={50} gap={11} eye={5} mouthY={11} />
    <circle className="ch-moon" cx="92" cy="52" r="4" />
  </svg>;
}
function Byte() {
  const c = useContext(Pal);
  return <svg viewBox="0 0 100 100">
    <defs><linearGradient id={`byte-g-${c.id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c.light} /><stop offset="1" stopColor={c.base} /></linearGradient></defs>
    <path className="ch-body" fill={`url(#byte-g-${c.id})`} d="M20 52 C20 26 34 14 50 14 C66 14 80 26 80 52 L80 84 L72 78 L64 86 L56 78 L50 86 L44 78 L36 86 L28 78 L20 84 Z" />
    <rect x="30" y="22" width="6" height="6" rx="1" fill="#fff" opacity=".45" />
    <Face cx={50} cy={48} gap={12} eye={6} mouthY={13} />
  </svg>;
}
function Kit() {
  const c = useContext(Pal);
  return <svg viewBox="0 0 100 100">
    <defs><linearGradient id={`kit-g-${c.id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c.light} /><stop offset="1" stopColor={c.base} /></linearGradient></defs>
    <path className="ch-ear" d="M22 44 L26 12 L44 32 Z" fill={c.base} /><path className="ch-ear r" d="M78 44 L74 12 L56 32 Z" fill={c.base} />
    <path d="M27 38 L29 20 L39 32 Z M73 38 L71 20 L61 32 Z" fill="#fff" opacity=".35" />
    <path fill={`url(#kit-g-${c.id})`} d="M18 50 C18 30 32 26 50 26 C68 26 82 30 82 50 C82 70 66 84 50 86 C34 84 18 70 18 50 Z" />
    <path d="M30 62 C38 74 62 74 70 62 C64 80 36 80 30 62 Z" fill="#fff" opacity=".85" />
    <Face cx={50} cy={52} gap={13} eye={5} mouthY={14} />
    <ellipse cx="50" cy="61" rx="3.2" ry="2.3" fill="#1b1b1f" />
  </svg>;
}
function Blob() {
  const c = useContext(Pal);
  return <svg viewBox="0 0 100 100">
    <defs><radialGradient id={`blob-g-${c.id}`} cx="40%" cy="30%" r="80%"><stop offset="0" stopColor={c.light} /><stop offset="1" stopColor={c.deep} /></radialGradient></defs>
    <path className="ch-jelly" fill={`url(#blob-g-${c.id})`} d="M50 18 C72 18 86 36 86 58 C86 76 72 86 50 86 C28 86 14 76 14 58 C14 36 28 18 50 18 Z" />
    <ellipse cx="36" cy="32" rx="8" ry="5" fill="#fff" opacity=".45" transform="rotate(-25 36 32)" />
    <Face cx={50} cy={54} gap={13} eye={6} mouthY={13} />
    <circle cx="30" cy="64" r="5" fill="#ff6b8a" opacity=".35" /><circle cx="70" cy="64" r="5" fill="#ff6b8a" opacity=".35" />
  </svg>;
}

/** Whoever you picked, in your colour and mood. `size` is in CSS pixels. `portrait` is the head-and-shoulders crop for chat avatars. */
export function SparkCharacter({ preferences, mood = "idle", size, crop = "full" }: { preferences: CompanionPreferences; mood?: Mood; size?: number; crop?: "full" | "portrait" }) {
  const id = useId().replace(/:/g, "");
  // A finish is a solid or a gradient; either way the body shades from light to deep. Dark bodies get light eyes.
  const { from, to, gradient } = stops(preferences.color);
  const base = gradient ? mix(from, to, 0.5) : from;
  const palette: Palette = gradient ? { base, light: shade(from, 255, 0.2), deep: to, id } : { base, light: shade(base, 255, luminance(base) < 0.02 ? 0.22 : 0.45), deep: shade(base, 0, 0.35), id };
  const dark = luminance(base) < 0.06;
  const style = { "--ch": palette.base, "--ch-light": palette.light, "--ch-deep": palette.deep, "--ch-face": dark ? "#f4f4f5" : "#15151a", "--ch-glint": dark ? "#0b0b0d" : "#ffffff", width: size, height: size } as CSSProperties;
  const robot = ["scout", "atlas", "nova"].includes(preferences.character);
  const art = robot ? <RobotCharacter preferences={preferences} palette={palette} crop={crop} /> : preferences.character === "orb" ? <Orb /> : preferences.character === "byte" ? <Byte /> : preferences.character === "kit" ? <Kit /> : preferences.character === "blob" ? <Blob /> : <SparkArt preferences={preferences} crop={crop} />;
  return <Pal.Provider value={palette}><span className={`spark-character ch-${preferences.character} mood-${mood} ${crop === "portrait" ? "is-portrait" : ""}`} style={style} aria-hidden="true">{art}</span></Pal.Provider>;
}
