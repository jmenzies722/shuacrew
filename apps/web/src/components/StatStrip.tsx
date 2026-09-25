import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import "./surfaces.css";

export interface Stat { value: ReactNode; label: string; tone?: "ok" | "wait" | "amber" | "bad"; live?: boolean; to?: string; hash?: string }
/** Live counts under a pane header. A stat with `to` is a link to where that number matters. */
export function StatStrip({ stats }: { stats: Stat[] }) {
  return <div className="stat-strip">{stats.map((s) => {
    const body = <>{s.live && <i aria-hidden="true" />}<strong>{s.value}</strong><span>{s.label}</span></>;
    const cls = `stat-chip ${s.tone ? `is-${s.tone}` : ""}`;
    return s.to ? <Link key={s.label} to={s.to} hash={s.hash} className={cls}>{body}</Link> : <div key={s.label} className={cls}>{body}</div>;
  })}</div>;
}

/** The one empty state: an icon, what this place is for, and the next step. */
export function EmptyHero({ icon, title, children, actions }: { icon: ReactNode; title: string; children: ReactNode; actions?: ReactNode }) {
  return <section className="empty-hero"><span className="empty-orb">{icon}</span><h2>{title}</h2><p>{children}</p>{actions && <div className="empty-actions">{actions}</div>}</section>;
}
