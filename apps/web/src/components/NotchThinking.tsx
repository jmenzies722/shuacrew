import { formatElapsed, STILL_WORKING_AFTER, useElapsed } from "./WorkingFor";

export function NotchThinking({ understanding = false, detail = false }: { understanding?: boolean; detail?: boolean }) {
  const elapsed = useElapsed();
  return <span className={`notch-thinking ${detail ? "is-detail" : ""}`} role="status" aria-label={understanding ? "Understanding your voice" : "Working on your request"}>
    <span className="notch-thinking-orbit" aria-hidden="true"><i /><b /></span>
    {detail && <span>{understanding ? "Understanding your voice" : elapsed >= STILL_WORKING_AFTER ? "Still working on your request" : "Working on your request"}</span>}
    <time aria-hidden="true" style={{ visibility: elapsed >= 2 ? "visible" : "hidden" }}>{formatElapsed(elapsed)}</time>
  </span>;
}
