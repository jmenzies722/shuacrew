import { useEffect, useState } from "react";

export function NotchThinking({ understanding = false, detail = false }: { understanding?: boolean; detail?: boolean }) {
  const [started] = useState(Date.now);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [started]);
  return <span className={`notch-thinking ${detail ? "is-detail" : ""}`} role="status" aria-label={understanding ? "Understanding your voice" : "Working on your request"}>
    <span className="notch-thinking-orbit" aria-hidden="true"><i /><b /></span>
    {detail && <span>{understanding ? "Understanding your voice" : elapsed >= 20 ? "Still working on your request" : "Working on your request"}</span>}
    {elapsed >= 2 && <time aria-hidden="true">{elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`}</time>}
  </span>;
}
