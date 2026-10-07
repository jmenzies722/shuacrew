import "@fontsource-variable/geist";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "./styles.css";
import "./workspace.css";
import "./pristine.css";
import "./craft.css";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { applyTheme, connect, useLive } from "./lib/live";
import { folderPicked } from "./lib/native";
import { startShuaLook } from "./lib/shua-look";
import { startShuaRemote } from "./lib/shua-remote";

startShuaLook(); // the iPhone shows the Shua you designed here
startShuaRemote(); // and what you ask on the iPhone, the notch's Shua does
import { router } from "./routes";
import { Buddy } from "./screens/Buddy";
import { protectKeyboardDelivery } from "./lib/keyboard-delivery";

if (document.documentElement.dataset.shell === "mac") protectKeyboardDelivery(window);
// A page that breaks quietly (the notch: buttons, voice and hands all dead at once) must say so: every uncaught error
// goes to ~/.shuacrew/spark-selftest.log through the Mac app, at most 20 a load so a loop can't flood it.
{
  const handler = (window as unknown as { webkit?: { messageHandlers?: { shuacrew?: { postMessage(m: unknown): void } } } }).webkit?.messageHandlers?.shuacrew;
  let sent = 0;
  const report = (kind: string, message: string, stack?: string) => {
    if (!handler || sent++ >= 20) return;
    try { handler.postMessage({ type: "buddySelfTest", ok: false, message: `JS ${kind} ${location.pathname}: ${message}`.slice(0, 400), output: (stack ?? "").slice(0, 1200) }); } catch { /* the bridge itself is gone */ }
  };
  window.addEventListener("error", (e) => report("error", e.message || String(e.error), (e.error as Error | undefined)?.stack));
  window.addEventListener("unhandledrejection", (e) => { const r = e.reason as Error | undefined; report("rejection", r?.message ?? String(e.reason), r?.stack); });
}

applyTheme(useLive.getState().theme);
// While ShuaCrew isn't the app in front, its purely decorative motion rests (see alive.css); it resumes on return.
// The Mac app says when ShuaCrew itself is active (the notch panel never takes focus, so it can't tell on its own).
let appActive: boolean | null = null;
(window as unknown as { __appActive: (on: boolean) => void }).__appActive = (on) => { appActive = on; idle(); };
const idle = () => {
  const rest = !((appActive ?? document.hasFocus()) && document.visibilityState === "visible"), root = document.documentElement;
  if (rest === (root.dataset.idle !== undefined)) return; // unchanged: no attribute write, no style recalc
  if (rest) root.dataset.idle = ""; else delete root.dataset.idle;
};
window.addEventListener("focus", idle); window.addEventListener("blur", idle); document.addEventListener("visibilitychange", idle); idle();
// Resolve the preferred landing page once. Explicit links keep their destination.
if (location.pathname === "/" && !location.search && !location.hash) {
  const start = useLive.getState().appearance.startPage;
  if (start !== "/") window.history.replaceState(window.history.state, "", start);
}

// The Mac app drives the page from its menus (⌘N, ⌘K, ⌘1…) through this bridge.
declare global {
  interface Window {
    shuacrew?: { navigate(to: string): void; launch(): void; compose(): void; shortcuts(): void; fullscreen(active: boolean): void; palette(): void; terminal(): void; folderPicked(path: string | null): void };
  }
}
window.shuacrew = {
  compose: () => window.dispatchEvent(new Event("shuacrew:compose")),
  shortcuts: () => useLive.getState().setKeymap(true),
  fullscreen: (active) => { if (active) document.documentElement.dataset.fullscreen = "1"; else delete document.documentElement.dataset.fullscreen; },
  navigate: (to) => void router.navigate({ to }),
  launch: () => void router.navigate({ to: "/" }).then(() => window.dispatchEvent(new Event("shuacrew:compose"))),
  folderPicked,
  terminal: () => window.dispatchEvent(new Event("shuacrew:terminal")),
  palette: () => useLive.getState().setPalette(true),
};
void connect();

// The Mac app's desktop buddy panel loads /buddy: just Spark, no workspace chrome.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {location.pathname === "/buddy" ? <Buddy /> : <RouterProvider router={router} />}
  </StrictMode>,
);
