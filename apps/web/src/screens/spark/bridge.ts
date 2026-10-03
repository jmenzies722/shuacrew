/**
 * Spark's bridge to the Mac app: the native message channel, which Spark surface is speaking, and the things it asks
 * the Mac for — a screenshot (remembered for snapping highlights), what's playing, personal context, and exact
 * page elements in Chrome through Spark for Chrome.
 */
import { api } from "../../lib/api";
import { logSense } from "../../lib/spark-log";
import { locate } from "../../lib/snap";
import type { Shape, ScreenContext, ScreenLine } from "../../lib/buddy";
import type { WidgetCtx } from "../../components/TopBarWidgets";

export type Native = { postMessage(m: unknown): void };
export const native = (): Native | undefined => (window as unknown as { webkit?: { messageHandlers?: { shuacrew?: Native } } }).webkit?.messageHandlers?.shuacrew;
export const post = (m: Record<string, unknown>) => native()?.postMessage(m);
export const KEY = "shuacrew.buddy";
export const SEE = "shuacrew.buddy.see";
export const readSee = () => { try { return localStorage.getItem(SEE) !== "0"; } catch { return true; } };
/** Which Spark surface (desktop panel or app side panel) asked last: only it speaks, points and acts on the answer. */
const OWNER = "shuacrew.buddy.owner";
const ME = Math.random().toString(36).slice(2);
export const claim = () => { try { localStorage.setItem(OWNER, ME); } catch { /* ignore */ } };
export const mine = () => { try { const o = localStorage.getItem(OWNER); return !o || o === ME; } catch { return true; } };
export const ctx: WidgetCtx = { go: (path) => post({ type: "buddyOpen", path }) };

export type NowPlaying = { app: string; playing: boolean; title: string; artist?: string; album?: string; position?: number; duration?: number };
/** The latest answer from the Mac about Music/Spotify, from any ask (the notch polls it while music plays). */
let lastMedia: { at: number; media: NowPlaying | null } | null = null;
if (typeof window !== "undefined") window.addEventListener("shuacrew:media", (e) => { const d = (e as CustomEvent).detail as NowPlaying | undefined; lastMedia = { at: Date.now(), media: d?.title ? d : null }; });
/**
 * What Music or Spotify is playing right now. A fresh answer from the notch counts (it asks every few seconds while
 * music plays); otherwise ask the Mac, and if Music is slow to answer, fall back to the last thing it told us.
 */
export function nowPlayingOnce(): Promise<NowPlaying | null> {
  if (!native()) return Promise.resolve(null);
  if (lastMedia && Date.now() - lastMedia.at < 6_000) return Promise.resolve(lastMedia.media);
  return new Promise((resolve) => {
    const on = (e: Event) => { clearTimeout(t); window.removeEventListener("shuacrew:media", on); const d = (e as CustomEvent).detail; resolve(d?.title ? d : null); };
    const t = setTimeout(() => { window.removeEventListener("shuacrew:media", on); resolve(lastMedia && Date.now() - lastMedia.at < 90_000 ? lastMedia.media : null); }, 2500);
    window.addEventListener("shuacrew:media", on); post({ type: "buddyNowPlaying" });
  });
}
const mmss = (s?: number) => (s && Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "");
/** One line of "what's playing" for every question, so Spark just knows — Music/Spotify and ShuaCrew Radio. */
export async function playingContext(radio: () => Promise<{ playing: boolean; title: string | null; station: string | null }>): Promise<string> {
  const [m, r] = await Promise.all([nowPlayingOnce().catch(() => null), radio().catch(() => null)]);
  const parts: string[] = [];
  if (m?.title) parts.push(`${m.playing ? "Now playing" : "Paused"} in ${m.app}: "${m.title}"${m.artist ? ` by ${m.artist}` : ""}${m.album ? ` (album: ${m.album})` : ""}${m.duration ? `, ${mmss(m.position)} of ${mmss(m.duration)}` : ""}.`);
  if (r?.playing) parts.push(`ShuaCrew Radio is on: ${r.title ?? r.station ?? "lofi"}${r.station && r.title ? ` (${r.station})` : ""}.`);
  return parts.length ? parts.join(" ") : "Nothing is playing right now (Music, Spotify and ShuaCrew Radio are all quiet).";
}
/** A sketch shape, fitted to the real thing it's about: boxes hug the control (in its shape), circles ring it, arrows land on it. */
export function fitShape(sh: Shape): Shape {
  if (sh.shape === "box" && (sh.target || sh.label)) { const r = locate({ x: sh.x, y: sh.y, w: sh.w, h: sh.h, label: sh.label ?? "", target: sh.target }, lastScreen); return r.exact ? { ...sh, x: r.x, y: r.y, w: r.w, h: r.h, corner: r.shape } : sh; }
  if (sh.shape === "circle" && (sh.target || sh.label)) {
    const r = locate({ x: sh.x, y: sh.y, w: sh.r * 2, h: sh.r * 2 * (lastScreen?.aspect ?? 1.6), label: sh.label ?? "", target: sh.target }, lastScreen);
    // r is a fraction of the screen's width: ring the whole thing with a little room.
    return r.exact ? { ...sh, x: r.x, y: r.y, r: Math.min(0.3, (Math.max(r.w, r.h / (lastScreen?.aspect ?? 1.6)) / 2) * 1.25 + 0.004) } : sh;
  }
  // Region marks snap to the real thing's frame, like boxes.
  if ((sh.shape === "spotlight" || sh.shape === "highlight" || sh.shape === "underline") && (sh.target || sh.label)) { const r = locate({ x: sh.x, y: sh.y, w: sh.w, h: sh.h, label: sh.label ?? "", target: sh.target }, lastScreen); return r.exact ? { ...sh, x: r.x, y: r.y, w: r.w, h: r.h } : sh; }
  // Point marks land on the real control's centre; a step also rings it.
  if ((sh.shape === "step" || sh.shape === "check" || sh.shape === "cross" || sh.shape === "card") && sh.target) {
    const r = locate({ x: sh.x, y: sh.y, w: sh.w ?? 0.03, h: sh.h ?? 0.03, label: "", target: sh.target }, lastScreen);
    if (!r.exact) return sh;
    return sh.shape === "step" ? { ...sh, x: r.x, y: r.y, w: r.w, h: r.h } : sh.shape === "card" ? { ...sh, x: r.x, y: r.y, w: r.w, h: r.h } : { ...sh, x: r.x + r.w / 2 + 0.012, y: r.y };
  }
  if (sh.shape === "arrow" && sh.target) { const r = locate({ x: sh.to[0], y: sh.to[1], w: 0.03, h: 0.03, label: sh.label ?? "", target: sh.target }, lastScreen); return { ...sh, to: [r.x, r.y] }; }
  return sh;
}
/**
 * Personal context for every question: where you're working, what's next on your calendar, what's due, what you just
 * worked on, anything that needs attention. Read on this Mac, cached for a minute, and never allowed to slow a reply.
 */
let contextCache: { at: number; text: string } | null = null, contextLoading: Promise<string> | null = null;
/**
 * Stale-while-revalidate: a turn never waits for a fresh read (~0.9 s measured) when there's one from the last 10
 * minutes — it answers with that and refreshes behind it. Only the first ask of a session waits (at most 1.5 s).
 * `macContext.prefetch()` runs when you start talking, so a fresh copy is usually ready as you finish.
 */
export function macContext(): Promise<string> {
  if (!native()) return Promise.resolve("");
  const age = contextCache ? Date.now() - contextCache.at : Infinity;
  if (age < 60_000) return Promise.resolve(contextCache!.text);
  const fresh = readMacContext();
  return age < 10 * 60_000 ? Promise.resolve(contextCache!.text) : fresh;
}
macContext.prefetch = () => { if (native() && (!contextCache || Date.now() - contextCache.at > 20_000)) void readMacContext(); };
function readMacContext(): Promise<string> {
  if (contextLoading) return contextLoading;
  contextLoading = new Promise<string>((resolve) => {
    const id = crypto.randomUUID();
    const t = setTimeout(() => { window.removeEventListener("shuacrew:did", on as EventListener); resolve(contextCache?.text ?? ""); }, 1500);
    const on = (e: CustomEvent<{ id: string; output?: string }>) => {
      if (e.detail.id !== id) return; clearTimeout(t); window.removeEventListener("shuacrew:did", on as EventListener);
      contextCache = { at: Date.now(), text: e.detail.output ?? "" }; resolve(contextCache.text);
    };
    window.addEventListener("shuacrew:did", on as EventListener);
    post({ type: "buddyDo", id, action: { type: "mac", op: "context" } });
  }).finally(() => { contextLoading = null; });
  return contextLoading;
}
/**
 * In Chrome, the page itself knows exactly where things are: ask Spark for Chrome to find, click or type into an
 * element by what it's called. Null when Chrome isn't in front, the extension isn't connected, or nothing matched.
 */
export type WebHit = { found: boolean; name?: string; role?: string; rect?: { x: number; y: number; w: number; h: number } };
const inChrome = () => /chrome/i.test(lastScreen?.context?.app ?? "");
export function webAct(kind: "locate" | "click" | "type", text: string, value?: string): Promise<WebHit | null> {
  if (!inChrome() || !text.trim()) return Promise.resolve(null);
  return api<WebHit>("/api/web/act", { body: { kind, text, ...(value !== undefined ? { value } : {}) } }).then((r) => (r.found ? r : null), () => null);
}
/** The last screen Spark looked at: its exact text lines and controls, for snapping highlights onto the real thing. */
let lastScreen: { text: ScreenLine[]; context?: ScreenContext; aspect?: number; width?: number; height?: number; display?: number; others?: Array<{ n: number; width: number; height: number; display?: number; text?: ScreenLine[] }> } | null = null;
/** Opus/Sonnet 5.5 and newer see screenshots up to 2576 px (older ones 1568): send them the sharper look. */
export const seesHiRes = (model?: string) => !!model && /(opus|sonnet)-5-5|fable|mythos|-[6-9]-/.test(model);
let hiRes = false;
export const setHiRes = (on: boolean) => { hiRes = on; };
/** Every image of a look: the main display's first, then each other display's (the model is told which is which). */
export type Shot = { display?: number; file: File; width: number; height: number; text: ScreenLine[]; context?: ScreenContext; others: Array<{ n: number; file: File; width: number; height: number; display?: number; text?: ScreenLine[] }> };
export const shotFiles = (s: Shot) => [s.file, ...s.others.map((o) => o.file)];
const jpeg = (data: string, name: string) => new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], name, { type: "image/jpeg" });
let capturePending: Promise<Shot> | null = null;
export function capture(): Promise<Shot> {
  return capturePending ??= captureFresh().finally(() => { capturePending = null; });
}
function captureFresh(): Promise<Shot> {
  return new Promise((resolve, reject) => {
    if (!native()) { reject(new Error("Screen questions work in the ShuaCrew Mac app.")); return; }
    const t = setTimeout(() => { window.removeEventListener("shuacrew:capture", on as EventListener); reject(new Error("Screenshot timed out.")); }, 15_000);
    const on = (e: CustomEvent<{ display?: number; data?: string; width?: number; height?: number; text?: ScreenLine[]; context?: ScreenContext; error?: string; others?: Array<{ n: number; data: string; width: number; height: number; display?: number; text?: ScreenLine[] }> }>) => {
      clearTimeout(t); window.removeEventListener("shuacrew:capture", on as EventListener);
      const d = e.detail; if (!d.data) { reject(new Error(d.error ?? "Couldn't capture the screen.")); return; }
      logSense("saw", "Looked at your screen", d.context?.app ? `${d.context.app}${d.context.window ? ` · ${d.context.window}` : ""}` : "");
      const others = (d.others ?? []).filter((o) => o.data && o.width && o.height).map((o) => ({ n: o.n, display: o.display, text: o.text, width: o.width, height: o.height, file: jpeg(o.data, `screen-${o.n}.jpg`) }));
      lastScreen = { display: d.display, text: d.text ?? [], context: d.context, aspect: d.width && d.height ? d.width / d.height : undefined, width: d.width, height: d.height, others: others.map(({ n, width, height, display, text }) => ({ n, width, height, display, text })) };
      resolve({ display: d.display, file: jpeg(d.data, "screen.jpg"), width: d.width ?? 0, height: d.height ?? 0, text: d.text ?? [], context: d.context, others });
    };
    window.addEventListener("shuacrew:capture", on as EventListener);
    post({ type: "buddyCapture", hires: hiRes });
  });
}

/** A region of the last look (fractions) at full resolution, for reading small things exactly. */
export function zoomShot(r: { x: number; y: number; w: number; h: number }): Promise<{ file: File; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    if (!native()) { reject(new Error("Zoom works in the ShuaCrew Mac app.")); return; }
    const t = setTimeout(() => { window.removeEventListener("shuacrew:zoom", on as EventListener); reject(new Error("Zoom timed out.")); }, 8_000);
    const on = (e: CustomEvent<{ data?: string; width?: number; height?: number; error?: string }>) => {
      clearTimeout(t); window.removeEventListener("shuacrew:zoom", on as EventListener);
      const d = e.detail; if (!d.data) { reject(new Error(d.error ?? "Couldn't zoom.")); return; }
      resolve({ file: new File([Uint8Array.from(atob(d.data), (c) => c.charCodeAt(0))], "zoom.jpg", { type: "image/jpeg" }), width: d.width ?? 0, height: d.height ?? 0 });
    };
    window.addEventListener("shuacrew:zoom", on as EventListener);
    post({ type: "buddyZoom", ...r });
  });
}


/** The last screen Spark looked at (text lines, controls, proportions), for snapping highlights onto the real thing. */
export const screenFacts = () => lastScreen;
/** The pixel size of the screenshot Spark last sent the model: its answers' pixel coordinates are in this space. */
export const screenSize = () => (lastScreen?.width && lastScreen.height ? { width: lastScreen.width, height: lastScreen.height, ...(lastScreen.others?.length ? { others: lastScreen.others } : {}) } : null);

/** Select an exact frozen screen area. Only the crop is returned or uploaded. */
export function selectRegion(): Promise<Shot | null> {
  if (!native()) return Promise.reject(new Error("Area selection works in the ShuaCrew Mac app."));
  const request = crypto.randomUUID();
  return new Promise((resolve,reject) => {
    const timer = setTimeout(() => { cleanup(); post({type:"buddyCancelRegion"}); reject(new Error("Area selection timed out.")); }, 120_000);
    const cleanup = () => { clearTimeout(timer); window.removeEventListener("shuacrew:region",on); };
    const on = (event: Event) => {
      const d = (event as CustomEvent).detail;
      if (d?.request !== request) return;
      cleanup();
      if (d.canceled) { resolve(null); return; }
      if (!d.data) { reject(new Error(d.error ?? "Couldn't select an area.")); return; }
      resolve({file:jpeg(d.data,"selected-area.jpg"),width:d.width,height:d.height,text:[],others:[]});
    };
    window.addEventListener("shuacrew:region",on); post({type:"buddySelectRegion",request});
  });
}
