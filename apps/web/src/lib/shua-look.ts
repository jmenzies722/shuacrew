/**
 * Publishes Shua's mark for the iPhone: this window renders the same drawing the Mac uses (components/Mark.tsx) and
 * sends the markup and its CSS to the gateway whenever the name, accent or voice changes. The phone shows that very
 * drawing, so there's one Shua, not a lookalike.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SparkCharacter } from "../components/SparkCharacter";
import markCss from "../components/mark.css?raw";
import { api } from "./api";
import { getBuddyVoice } from "./buddy-voice";
import { getCompanion } from "./companion";
import { themeAccent } from "./spark-color";

/** The phone has none of the app's theme tokens, so the mark's colours are spelled out for it: the app icon's ink tile and white S. */
const css = `${markCss}\n.shua-mark { --mark-tile: #191919; --mark-glyph: #ffffff; --mark-live: #2383e2; }`;

/** The mark as one self-contained piece of markup, idle; the phone swaps the tone class. */
export function shuaLook(): { name: string; markup: string; css: string; accent: string; voiceId: string; voiceSpeed: number } {
  const prefs = getCompanion();
  const markup = renderToStaticMarkup(createElement(SparkCharacter, { preferences: prefs, mood: "idle" }));
  const accent = /^#[0-9a-f]{6}$/i.test(themeAccent()) ? themeAccent() : "#2383e2";
  // Its voice too, so the iPhone speaks with the same one (through ShuaCrew's own voice engine on this Mac).
  const voice = getBuddyVoice();
  return { name: prefs.nickname || "Shua", markup, css, accent, voiceId: voice.id, voiceSpeed: voice.speed };
}

let last = "";
async function publish() {
  try {
    const look = shuaLook(), key = JSON.stringify(look);
    if (key === last) return;
    await api("/api/shua/look", { body: look });
    last = key;
  } catch { /* the gateway may be restarting: the next check sends it */ }
}

/** The main window keeps the phone's Shua current: at start, when it changes here or in another window, and every 30 s. */
export function startShuaLook() {
  if (typeof window === "undefined" || location.pathname.startsWith("/buddy")) return;
  setTimeout(() => void publish(), 2_000);
  window.addEventListener("storage", (e) => { if (e.key?.startsWith("shuacrew.companion") || e.key?.startsWith("shuacrew.appearance") || e.key === "shuacrew.buddy.voice") void publish(); });
  setInterval(() => void publish(), 30_000);
}
