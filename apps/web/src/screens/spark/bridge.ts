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

/** What Music or Spotify is playing right now (asked of the Mac app; null if neither is open or it doesn't answer fast). */
export function nowPlayingOnce(): Promise<{ app: string; playing: boolean; title: string; artist?: string } | null> {
  if (!native()) return Promise.resolve(null);
  return new Promise((resolve) => {
    const on = (e: Event) => { clearTimeout(t); window.removeEventListener("shuacrew:media", on); const d = (e as CustomEvent).detail; resolve(d?.title ? d : null); };
    const t = setTimeout(() => { window.removeEventListener("shuacrew:media", on); resolve(null); }, 900);
    window.addEventListener("shuacrew:media", on); post({ type: "buddyNowPlaying" });
  });
}
/** A sketch shape, fitted to the real thing it's about: boxes hug the control (in its shape), circles ring it, arrows land on it. */
export function fitShape(sh: Shape): Shape {
  if (sh.shape === "box" && (sh.target || sh.label)) { const r = locate({ x: sh.x, y: sh.y, w: sh.w, h: sh.h, label: sh.label ?? "", target: sh.target }, lastScreen); return r.exact ? { ...sh, x: r.x, y: r.y, w: r.w, h: r.h, corner: r.shape } : sh; }
  if (sh.shape === "circle" && (sh.target || sh.label)) {
    const r = locate({ x: sh.x, y: sh.y, w: sh.r * 2, h: sh.r * 2 * (lastScreen?.aspect ?? 1.6), label: sh.label ?? "", target: sh.target }, lastScreen);
    // r is a fraction of the screen's width: ring the whole thing with a little room.
    return r.exact ? { ...sh, x: r.x, y: r.y, r: Math.min(0.3, (Math.max(r.w, r.h / (lastScreen?.aspect ?? 1.6)) / 2) * 1.25 + 0.004) } : sh;
  }
  if (sh.shape === "arrow" && sh.target) { const r = locate({ x: sh.to[0], y: sh.to[1], w: 0.03, h: 0.03, label: sh.label ?? "", target: sh.target }, lastScreen); return { ...sh, to: [r.x, r.y] }; }
  return sh;
}
/**
 * Personal context for every question: where you're working, what's next on your calendar, what's due, what you just
 * worked on, anything that needs attention. Read on this Mac, cached for a minute, and never allowed to slow a reply.
 */
let contextCache: { at: number; text: string } | null = null;
export function macContext(): Promise<string> {
  if (!native()) return Promise.resolve("");
  if (contextCache && Date.now() - contextCache.at < 60_000) return Promise.resolve(contextCache.text);
  return new Promise((resolve) => {
    const id = crypto.randomUUID();
    const t = setTimeout(() => { window.removeEventListener("shuacrew:did", on as EventListener); resolve(contextCache?.text ?? ""); }, 1500);
    const on = (e: CustomEvent<{ id: string; output?: string }>) => {
      if (e.detail.id !== id) return; clearTimeout(t); window.removeEventListener("shuacrew:did", on as EventListener);
      contextCache = { at: Date.now(), text: e.detail.output ?? "" }; resolve(contextCache.text);
    };
    window.addEventListener("shuacrew:did", on as EventListener);
    post({ type: "buddyDo", id, action: { type: "mac", op: "context" } });
  });
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
let lastScreen: { text: ScreenLine[]; context?: ScreenContext; aspect?: number } | null = null;
export function capture(): Promise<{ file: File; width: number; height: number; text: ScreenLine[]; context?: ScreenContext }> {
  return new Promise((resolve, reject) => {
    if (!native()) { reject(new Error("Screen questions work in the ShuaCrew Mac app.")); return; }
    const t = setTimeout(() => { window.removeEventListener("shuacrew:capture", on as EventListener); reject(new Error("Screenshot timed out.")); }, 15_000);
    const on = (e: CustomEvent<{ data?: string; width?: number; height?: number; text?: ScreenLine[]; context?: ScreenContext; error?: string }>) => {
      clearTimeout(t); window.removeEventListener("shuacrew:capture", on as EventListener);
      const d = e.detail; if (!d.data) { reject(new Error(d.error ?? "Couldn't capture the screen.")); return; }
      logSense("saw", "Looked at your screen", d.context?.app ? `${d.context.app}${d.context.window ? ` · ${d.context.window}` : ""}` : "");
      lastScreen = { text: d.text ?? [], context: d.context, aspect: d.width && d.height ? d.width / d.height : undefined };
      const bytes = Uint8Array.from(atob(d.data), (c) => c.charCodeAt(0));
      resolve({ file: new File([bytes], "screen.jpg", { type: "image/jpeg" }), width: d.width ?? 0, height: d.height ?? 0, text: d.text ?? [], context: d.context });
    };
    window.addEventListener("shuacrew:capture", on as EventListener);
    post({ type: "buddyCapture" });
  });
}


/** The last screen Spark looked at (text lines, controls, proportions), for snapping highlights onto the real thing. */
export const screenFacts = () => lastScreen;
