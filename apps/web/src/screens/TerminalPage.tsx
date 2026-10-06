import { lazy, Suspense } from "react";
import "./terminal-page.css";

const TerminalDrawer = lazy(() => import("../components/TerminalDrawer"));

/** The terminal as a place of its own: your shells, in tabs, with the crew one line away. It fills the page card edge to edge. */
export function TerminalPage() {
  return (
    <div className="terminal-page h-full">
      <Suspense fallback={<div className="grid h-full place-items-center bg-[var(--term-bg)] text-[12px] text-[var(--term-dim)]">Starting terminal…</div>}>
        <TerminalDrawer scope={{}} onClose={() => undefined} full />
      </Suspense>
    </div>
  );
}
