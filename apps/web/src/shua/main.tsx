/**
 * Shua — the lean app (shua.html). Chat · Work · Tools · Settings on the same gateway and the same Shua as the
 * notch, without the classic app's 31 screens: none of that code or CSS loads here.
 */
import "@fontsource-variable/geist";
import "@fontsource-variable/jetbrains-mono";
import "./shua.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { connect } from "../lib/live";
import { App, CLASSIC_KEY } from "./App";

// You chose this app: the classic one's "/" brings you here from now on (until you pick Classic again).
try { localStorage.setItem(CLASSIC_KEY, "shua"); } catch { /* private mode */ }
void connect();
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
