import "@fontsource-variable/geist";
import "@fontsource-variable/jetbrains-mono";
import "./styles.css";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { applyTheme, connect, useLive } from "./lib/live";
import { router } from "./routes";

applyTheme(useLive.getState().theme);
void connect();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
