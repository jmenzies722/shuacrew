import "./mark.css";

/**
 * The ShuaCrew mark: an S drawn as one path of work, and a dot that has just left it. The dot is the only part that
 * ever changes — still at rest, blue and breathing while the crew works, amber when something waits on you — so the
 * logo, the sidebar and the notch all say the same thing the same way. There is no face and no character.
 *
 * `tile` puts it on the ink tile (the app icon); bare, it draws in the text colour. The same geometry is drawn by
 * apps/mac/scripts/make-icon.swift and apps/web/public/icon.svg — change one, change all three.
 */
export type MarkTone = "idle" | "live" | "wait" | "ok" | "bad";
export const MARK_PATH = "M33 17H26.5a7.5 7.5 0 0 0 0 15h8a7.5 7.5 0 0 1 0 15H18.5";
export const MARK_DOT = { cx: 45, cy: 17, r: 4.5 };

export function ShuaMark({ size = 20, tone = "idle", tile = false, title }: { size?: number; tone?: MarkTone; tile?: boolean; title?: string }) {
  return (
    <svg className={`shua-mark is-${tone}${tile ? " is-tile" : ""}`} width={size} height={size} viewBox="0 0 64 64" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} style={{ flex: "none" }}>
      {tile && <rect className="shua-mark-tile" width="64" height="64" rx="15" />}
      <path className="shua-mark-s" d={MARK_PATH} fill="none" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <circle className="shua-mark-dot" cx={MARK_DOT.cx} cy={MARK_DOT.cy} r={MARK_DOT.r} />
    </svg>
  );
}
