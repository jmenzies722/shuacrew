import "@fontsource-variable/geist";
import "@fontsource-variable/jetbrains-mono";
import "./styles.css";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { applyTheme, connect, useLive } from "./lib/live";
import { folderPicked } from "./lib/native";
import { router } from "./routes";

applyTheme(useLive.getState().theme);

// The Mac app drives the page from its menus (⌘N, ⌘K, ⌘1…) through this bridge.
declare global {
  interface Window {
    shuacrew?: { navigate(to: string): void; launch(): void; palette(): void; terminal(): void; folderPicked(path: string | null): void };
  }
}
window.shuacrew = {
  navigate: (to) => void router.navigate({ to }),
  launch: () => void router.navigate({ to: "/" }).then(() => window.dispatchEvent(new Event("shuacrew:compose"))),
  folderPicked,
  terminal: () => window.dispatchEvent(new Event("shuacrew:terminal")),
  palette: () => useLive.getState().setPalette(true),
};
void connect();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
