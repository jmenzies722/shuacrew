/**
 * ShuaCrew's primitives: the few building blocks every screen is made of.
 *
 * Status is never colour alone — every status pairs a colour with an icon-shape and a word, so it
 * reads for colour-blind people and in the light theme alike. Motion presets are springs, and all
 * of them collapse to fades when the person prefers reduced motion.
 */
import type { ReactNode } from "react";

export const spring = { type: "spring", stiffness: 500, damping: 40 } as const;
export const quick = { duration: 0.16, ease: [0.2, 0.8, 0.2, 1] } as const;

export type Tone = "live" | "ok" | "bad" | "wait" | "idle";

const TONE_VAR: Record<Tone, string> = {
  live: "var(--amber)",
  ok: "var(--ok)",
  bad: "var(--bad)",
  wait: "var(--wait)",
  idle: "var(--idle)",
};

export function toneOf(status: string): Tone {
  switch (status) {
    case "running":
    case "planning":
      return "live";
    case "awaiting_approval":
      return "wait";
    case "done":
    case "merged":
      return "ok";
    case "failed":
      return "bad";
    case "reviewing":
      return "wait";
    default:
      return "idle";
  }
}

const LABEL: Record<string, string> = {
  queued: "Queued",
  planning: "Planning",
  running: "Running",
  awaiting_approval: "Needs you",
  paused: "Paused",
  reviewing: "In review",
  merged: "Merged",
  done: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

/** A status with its colour, its shape and its word. */
export function StatusPill({ status, reason }: { status: string; reason?: string }) {
  const tone = toneOf(status);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ color: TONE_VAR[tone], background: `color-mix(in srgb, ${TONE_VAR[tone]} 13%, transparent)` }}
      title={reason}
    >
      <StatusGlyph tone={tone} />
      {LABEL[status] ?? status}
    </span>
  );
}

/** Distinct shapes per tone: a pulsing dot (live), a check (ok), a cross (bad), a diamond (wait). */
export function StatusGlyph({ tone, size = 8 }: { tone: Tone; size?: number }) {
  const color = TONE_VAR[tone];
  if (tone === "live") return <span className="pulse-dot inline-block rounded-full" style={{ width: size, height: size, background: color }} aria-hidden />;
  if (tone === "ok")
    return (
      <svg width={size + 2} height={size + 2} viewBox="0 0 10 10" aria-hidden>
        <path d="M1.5 5.2 4 7.6 8.6 2.6" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (tone === "bad")
    return (
      <svg width={size + 2} height={size + 2} viewBox="0 0 10 10" aria-hidden>
        <path d="M2 2l6 6M8 2 2 8" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  if (tone === "wait")
    return <span className="inline-block rotate-45" style={{ width: size - 1, height: size - 1, background: color, borderRadius: 1.5 }} aria-hidden />;
  return <span className="inline-block rounded-full border" style={{ width: size, height: size, borderColor: color }} aria-hidden />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[18px] items-center justify-center rounded-[5px] border border-[var(--line-strong)] bg-[var(--sunken)] px-1 font-mono text-[10.5px] text-[var(--text-2)]">
      {children}
    </kbd>
  );
}

export function Panel({ children, className = "", as: Tag = "section", ...rest }: { children: ReactNode; className?: string; as?: "section" | "div" | "aside" } & Record<string, unknown>) {
  return (
    <Tag className={`rounded-[var(--radius-l)] border border-[var(--line)] bg-[var(--panel)] ${className}`} style={{ boxShadow: "var(--shadow)" }} {...rest}>
      {children}
    </Tag>
  );
}

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)] ${className}`}>{children}</div>;
}

/** Context-window gauge: how full the agent's working memory is. */
export function Gauge({ used, limit, label = "context" }: { used?: number; limit?: number; label?: string }) {
  if (!used || !limit) return null;
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const color = pct > 85 ? "var(--bad)" : pct > 65 ? "var(--amber)" : "var(--text-3)";
  return (
    <div className="flex items-center gap-2" title={`${used.toLocaleString()} / ${limit.toLocaleString()} tokens of ${label}`}>
      <div className="h-1 w-16 overflow-hidden rounded-full bg-[var(--sunken)]" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="font-mono text-[10.5px] tabular-nums text-[var(--text-3)]">{pct}%</span>
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "quiet",
  size = "m",
  className = "",
  disabled,
  title,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "quiet" | "ghost" | "danger";
  size?: "s" | "m";
  className?: string;
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit";
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-m)] font-medium transition-[background,border-color,opacity,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--amber)]";
  const sizes = size === "s" ? "h-7 px-2.5 text-[12px]" : "h-8.5 px-3.5 text-[13px]";
  const variants = {
    primary: "bg-[var(--amber)] text-[#1a1204] hover:brightness-110",
    quiet: "border border-[var(--line-strong)] bg-[var(--raised)] text-[var(--text)] hover:border-[var(--text-3)]",
    ghost: "text-[var(--text-2)] hover:bg-[var(--raised)] hover:text-[var(--text)]",
    danger: "border border-[color-mix(in_srgb,var(--bad)_40%,transparent)] text-[var(--bad)] hover:bg-[color-mix(in_srgb,var(--bad)_10%,transparent)]",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} className={`${base} ${sizes} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

export function Chip({ children, tone, mono, title }: { children: ReactNode; tone?: Tone; mono?: boolean; title?: string }) {
  const color = tone ? TONE_VAR[tone] : "var(--text-2)";
  return (
    <span
      title={title}
      className={`inline-flex max-w-full items-center gap-1 truncate rounded-[var(--radius-s)] border border-[var(--line)] bg-[var(--raised)] px-1.5 py-0.5 text-[11px] ${mono ? "font-mono" : ""}`}
      style={{ color }}
    >
      {children}
    </span>
  );
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function since(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
