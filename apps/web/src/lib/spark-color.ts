import type { CSSProperties } from "react";

/** A companion's finish: a solid colour ("#8b7cf6") or a gradient ("grad:#from:#to"). */
export const SPARK_FINISHES: Array<{ id: string; name: string }> = [
  { id: "#8b7cf6", name: "Iris" }, { id: "#111114", name: "Onyx" }, { id: "#f5b544", name: "Amber" }, { id: "#ff7a59", name: "Coral" }, { id: "#f472b6", name: "Pink" },
  { id: "#60a5fa", name: "Blue" }, { id: "#34d399", name: "Mint" }, { id: "#e5e7eb", name: "Pearl" },
  { id: "grad:#a78bfa:#60a5fa", name: "Aurora" }, { id: "grad:#f472b6:#f59e0b", name: "Sunset" }, { id: "grad:#22d3ee:#6366f1", name: "Ocean" },
  { id: "grad:#34d399:#0ea5e9", name: "Lagoon" }, { id: "grad:#18181b:#7c3aed", name: "Nebula" }, { id: "grad:#050506:#52525b", name: "Obsidian" },
];

const HEX = /^#[0-9a-f]{6}$/i;
export function validFinish(v: unknown): v is string {
  if (typeof v !== "string") return false;
  if (HEX.test(v)) return true;
  const m = /^grad:(#[0-9a-f]{6}):(#[0-9a-f]{6})$/i.exec(v);
  return Boolean(m);
}

export function stops(finish: string): { from: string; to: string; gradient: boolean } {
  const m = /^grad:(#[0-9a-f]{6}):(#[0-9a-f]{6})$/i.exec(finish);
  if (m) return { from: m[1]!.toLowerCase(), to: m[2]!.toLowerCase(), gradient: true };
  const c = HEX.test(finish) ? finish.toLowerCase() : "#8b7cf6";
  return { from: c, to: c, gradient: false };
}

export function mix(a: string, b: string, t: number) {
  const n = (h: string) => parseInt(h.slice(1), 16), x = n(a), y = n(b);
  const ch = (s: number) => Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("")}`;
}
export function luminance(hex: string) {
  const v = parseInt(hex.slice(1), 16), c = [16, 8, 0].map((s) => { const x = ((v >> s) & 255) / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

/**
 * The one solid colour the interface uses for this finish (rings, the cursor, text accents): a gradient's brighter
 * end, and for near-black finishes a soft silver, so a black companion never means black-on-black buttons.
 */
export function accentOf(finish: string) {
  const { from, to } = stops(finish);
  const brightest = luminance(from) >= luminance(to) ? from : to;
  return luminance(brightest) < 0.05 ? "#d4d4d8" : brightest;
}

/** CSS variables for anything tinted by the companion: `--spark-color` (solid) and `--spark-fill` (may be a gradient). */
export function sparkVars(finish: string): CSSProperties {
  const { from, to, gradient } = stops(finish), accent = accentOf(finish);
  const dark = luminance(mix(from, to, 0.5)) < 0.05;
  return { "--spark-color": accent, "--spark-fill": gradient ? `linear-gradient(135deg, ${from}, ${to})` : dark ? `linear-gradient(135deg, #2a2a30, #0c0c0e)` : accent, "--spark-on": luminance(accent) > 0.45 ? "#0b0b0d" : "#ffffff" } as CSSProperties;
}
