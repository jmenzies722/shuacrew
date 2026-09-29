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
import { router } from "./routes";
import { Buddy } from "./screens/Buddy";

applyTheme(useLive.getState().theme);
// While ShuaCrew isn't the app in front, its purely decorative motion rests (see alive.css); it resumes on return.
// The Mac app says when ShuaCrew itself is active (the notch panel never takes focus, so it can't tell on its own).
let appActive: boolean | null = null;
(window as unknown as { __appActive: (on: boolean) => void }).__appActive = (on) => { appActive = on; idle(); };
const idle = () => { if ((appActive ?? document.hasFocus()) && document.visibilityState === "visible") delete document.documentElement.dataset.idle; else document.documentElement.dataset.idle = ""; };
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
