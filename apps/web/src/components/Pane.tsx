import type { ComponentType, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { appRoute, paneAnnouncement, type PaneStateKind } from "../lib/pane-model";
import "./pane.css";

/** The one page header: eyebrow (the rail group it lives in), title, what the page is for, and its actions. */
export function PaneHeader({ title, description, actions, eyebrow, icon: Icon, children }: {
  title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: string; icon?: ComponentType<{ size?: number }>; children?: ReactNode;
}) {
  return <header className="pane-header"><div>{eyebrow && <span className="pane-eyebrow">{Icon && <Icon size={12} />}{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}{children}</div>{actions && <div className="pane-actions">{actions}</div>}</header>;
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
