import { Kbd, StatusGlyph } from "@shuacrew/ui";
import { Link, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { decideApproval } from "../lib/api";
import { useLive } from "../lib/live";
import { policyLine } from "../lib/crew";
import { describe } from "./CommandPalette";

const RISK_COLOR: Record<string, string> = { low: "var(--text-3)", medium: "var(--wait)", high: "var(--amber)", critical: "var(--bad)" };

/**
 * Approvals follow you: whatever screen you're on, a waiting approval shows here with the exact
 * command and its risk. A approves, D denies, E expands the explanation — for the newest one.
 */
export function ApprovalToasts() {
  const approvals = useLive((s) => s.crew.approvals);
  const runs = useLive((s) => s.crew.runs);
  const list = useMemo(() => Object.values(approvals).sort((a, b) => a.seq - b.seq), [approvals]);
  const [explained, setExplained] = useState<string | null>(null);
  const [confirmCritical, setConfirmCritical] = useState<string | null>(null);
  const [spread, setSpread] = useState(false);
  // On the sessions screens approvals live in the thread, the Needs-you group and the bell;
  // a floating toast there would only cover the composer.
  const path = useRouterState({ select: (r) => r.location.pathname });
  // Sessions and the crew floor answer approvals in place; a toast there would only cover things.
  const onSessions = path === "/" || path.startsWith("/sessions") || path === "/floor";
  const top = onSessions ? undefined : list[list.length - 1];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!top) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "a") allow(top.id, top.risk);
      if (key === "d") void decideApproval(top.id, false);
      if (key === "e") setExplained((current) => (current === top.id ? null : top.id));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Critical actions (terraform apply, production clusters) take a second, deliberate confirmation.
  const allow = (id: string, risk: string) => {
    if (risk === "critical" && confirmCritical !== id) {
      setConfirmCritical(id);
      return;
    }
    setConfirmCritical(null);
    void decideApproval(id, true);
  };

  if (onSessions) return null;
  // One card at a time: the newest in front, the rest stacked behind it. Hover (or focus) fans them out.
  const shown = list.slice(-4);
  const stacked = !spread && shown.length > 1;
  return (
    <div className={`approval-stack pointer-events-none fixed bottom-4 right-4 z-40 flex w-[380px] max-w-[92vw] flex-col gap-2 ${stacked ? "is-stacked" : ""}`} aria-live="polite" aria-label="Approvals"
      onMouseEnter={() => setSpread(true)} onMouseLeave={() => setSpread(false)} onFocus={() => setSpread(true)} onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setSpread(false)}>
      {stacked && <span className="approval-more">{list.length - 1} more waiting · hover to see all</span>}
      <AnimatePresence initial={false}>
        {shown.map((a, i) => {
          const run = a.run ? runs[a.run] : undefined;
          const isTop = a.id === top?.id;
          const depth = shown.length - 1 - i, behind = stacked && depth > 0;
          return (
            <motion.div
              key={a.id}
              layout
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={behind ? { opacity: depth > 2 ? 0 : 1 - depth * 0.3, y: -depth * 10, scale: 1 - depth * 0.05 } : { opacity: 1, x: 0, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, transition: { duration: 0.14 } }}
              transition={{ type: "spring", stiffness: 520, damping: 38 }}
              className={`approval-toast pointer-events-auto rounded-[var(--radius-l)] border border-line-strong p-3 backdrop-blur-xl ${behind ? "is-behind" : ""}`}
              style={{ background: "var(--glass)", boxShadow: "0 16px 48px rgba(0,0,0,.4)", zIndex: shown.length - depth, transformOrigin: "50% 100%" }}
              role="alertdialog"
              aria-hidden={behind || undefined}
              inert={behind || undefined}
              aria-label={`Approval needed: ${a.tool}`}
            >
              <div className="flex items-center gap-2 text-[12px]">
                <StatusGlyph tone="wait" />
                <span className="font-medium text-fg">Needs your approval</span>
                <span className="ml-auto rounded-full px-1.5 text-[10.5px] font-semibold uppercase" style={{ color: RISK_COLOR[a.risk], background: `color-mix(in srgb, ${RISK_COLOR[a.risk]} 14%, transparent)` }}>
                  {a.risk}
                </span>
              </div>
              {run && (
                <Link to="/sessions/$id" params={{ id: run.id }} className="mt-1 block truncate text-[11.5px] text-fg-3 hover:text-fg-2">
                  {run.title}
                </Link>
              )}
              <pre className="mono mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-all rounded-[var(--radius-m)] border border-line bg-sunken p-2 text-[11.5px] text-fg">
                {a.tool}: {describe(a.input) || JSON.stringify(a.input)}
              </pre>
              <p className="mono mt-2 text-[11.5px] text-fg-2">{policyLine("ask", a.rule, a.layer)}</p>
              {explained === a.id && (
                <p className="mt-1.5 text-[12px] leading-relaxed text-fg-2">
                  {a.reason}. Allowing runs it once; <em>Always</em> makes it a standing rule for this command.
                </p>
              )}
              {confirmCritical === a.id && <p className="mt-2 text-[12px] text-bad">Critical: press Allow again to confirm.</p>}
              <div className="mt-2.5 flex items-center gap-1.5">
                <button onClick={() => allow(a.id, a.risk)} className="h-7 rounded-[var(--radius-s)] bg-amber px-2.5 text-[12px] font-semibold text-[var(--on-accent)]">
                  Allow {isTop && <Kbd>A</Kbd>}
                </button>
                <button onClick={() => void decideApproval(a.id, true, { always: true })} className="h-7 rounded-[var(--radius-s)] border border-line-strong px-2.5 text-[12px] text-fg">
                  Always
                </button>
                <button onClick={() => void decideApproval(a.id, false)} className="h-7 rounded-[var(--radius-s)] border border-line-strong px-2.5 text-[12px] text-bad">
                  Deny {isTop && <Kbd>D</Kbd>}
                </button>
                <button onClick={() => setExplained((c) => (c === a.id ? null : a.id))} className="ml-auto h-7 px-1.5 text-[12px] text-fg-3 hover:text-fg">
                  Why? {isTop && <Kbd>E</Kbd>}
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
