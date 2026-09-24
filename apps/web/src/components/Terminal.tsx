/**
 * A read-only replay of every shell command the run executed, with its output — in a real
 * terminal renderer (xterm.js), loaded only when the tab is opened.
 */
import "@xterm/xterm/css/xterm.css";
import { Terminal as XTerm } from "@xterm/xterm";
import { useEffect, useRef } from "react";

export interface ShellStep {
  command: string;
  output?: string;
  ok?: boolean;
}

export default function Terminal({ steps }: { steps: ShellStep[] }) {
  const host = useRef<HTMLDivElement>(null);
  const term = useRef<XTerm | null>(null);
  const written = useRef(0);

  useEffect(() => {
    if (!host.current) return;
    const style = getComputedStyle(document.documentElement);
    const color = (name: string) => style.getPropertyValue(name).trim() || undefined;
    const t = new XTerm({
      disableStdin: true,
      convertEol: true,
      cursorBlink: false,
      fontFamily: color("--font-mono") ?? "monospace",
      fontSize: 12,
      lineHeight: 1.35,
      scrollback: 100_000,
      theme: { background: color("--sunken"), foreground: color("--text"), cursor: color("--sunken"), selectionBackground: "rgba(255,176,32,.25)" },
    });
    t.open(host.current);
    term.current = t;
    written.current = 0;
    return () => t.dispose();
  }, []);

  useEffect(() => {
    const t = term.current;
    if (!t) return;
    // Append only what's new, so a live run streams into the terminal instead of redrawing it.
    for (const step of steps.slice(written.current)) {
      t.writeln(`\x1b[38;2;255;176;32m$\x1b[0m ${step.command}`);
      if (step.output) t.writeln(step.output.replace(/\n$/, ""));
      if (step.ok === false) t.writeln("\x1b[38;2;255;92;92m✗ exited non-zero\x1b[0m");
      t.writeln("");
    }
    written.current = steps.length;
  }, [steps]);

  return <div ref={host} className="h-[520px] overflow-hidden rounded-[var(--radius-m)] border border-line bg-sunken p-2" aria-label="Command replay" />;
}
