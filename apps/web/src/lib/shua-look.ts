/**
 * Publishes your Shua, exactly as you designed it, for the iPhone: this window renders your character with the same
 * SparkCharacter drawing the Mac uses, and sends the markup and its mood CSS to the gateway whenever your character,
 * name or accent changes. The phone shows that very drawing, so there's one Shua, not a lookalike.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SparkCharacter } from "../components/SparkCharacter";
import css from "../components/spark-character.css?raw";
import { api } from "./api";
import { getCompanion } from "./companion";
import { themeAccent } from "./spark-color";

/** The character as one self-contained piece of markup, idle; the phone swaps the mood class. */
export function shuaLook(): { name: string; markup: string; css: string; accent: string } {
  const prefs = getCompanion();
  const markup = renderToStaticMarkup(createElement(SparkCharacter, { preferences: prefs, mood: "idle" }));
  const accent = /^#[0-9a-f]{6}$/i.test(themeAccent()) ? themeAccent() : "#8e48ff";
  return { name: prefs.nickname || "Shua", markup, css, accent };
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
  window.addEventListener("storage", (e) => { if (e.key?.startsWith("shuacrew.companion") || e.key?.startsWith("shuacrew.appearance")) void publish(); });
  setInterval(() => void publish(), 30_000);
}
