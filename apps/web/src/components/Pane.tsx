import type { ComponentType, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { appRoute, paneAnnouncement, type PaneStateKind } from "../lib/pane-model";
import "./pane.css";
import "./control-room.css";

/** The one page header: eyebrow (the rail group it lives in), title, what the page is for, and its actions. */
/**
 * The one page header, in the same language as the Tools hub (Control Room): eyebrow, title, an optional live status
 * line (what's true right now, with a tone dot), what the page is for, its actions, and one sweep of light underneath.
 */
export function PaneHeader({ title, description, actions, eyebrow, icon: Icon, children, status, tone = "ok" }: {
  title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: string; icon?: ComponentType<{ size?: number }>; children?: ReactNode;
  status?: ReactNode; tone?: "ok" | "wait" | "bad" | "idle" | "live";
}) {
  // The hub strip already says where you are; an eyebrow that only repeats the group name is noise. Dates and real context stay.
  const showEyebrow = eyebrow && !/^(work|plan|brain|system|build|know|crew|home|your workspace|the evidence behind your crew)$/i.test(eyebrow.trim());
  return <header className="pane-header cr-head"><div className="cr-head-main">{showEyebrow && <span className="pane-eyebrow">{Icon && <Icon size={12} />}{eyebrow}</span>}<h1>{title}</h1>
    {status && <p className={`cr-status is-${tone}`} role="status"><i aria-hidden="true" />{status}</p>}
    {description && <p className={status ? "pane-desc is-quiet" : "pane-desc"}>{description}</p>}{children}</div>
    {actions && <div className="pane-actions">{actions}</div>}<span className="cr-trace" aria-hidden="true" /></header>;
}
/** The one page frame: scrolls, centres and pads every standard pane the same way. */
export function PaneLayout({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <div className="pane-scroll"><div className={`pane-body${wide ? " pane-body-wide" : ""}`}>{children}</div></div>;
}
export function PaneState({ kind, title, detail, action }: { kind: PaneStateKind; title: string; detail?: string; action?: ReactNode }) {
  return <section className={`pane-state pane-state-${kind}`}><div role={paneAnnouncement(kind)}><h2>{title}</h2>{detail && <p>{detail}</p>}</div>{action && <div className="pane-actions">{action}</div>}</section>;
}
export function SourceLink({ to, label }: { to: string; label: string }) {
  const route = appRoute(to);
  return route ? <Link className="pane-source" to={route}>{label}<span aria-hidden="true"> ↗</span></Link> : <span className="pane-source-unavailable">{label}</span>;
}
