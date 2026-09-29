import { useEffect } from "react";
import { usePower } from "../lib/power";
import { addFocusMinute } from "../lib/focus-stats";
import { tickSchedule } from "../lib/modes";

/** Background helpers with no UI: the mode scheduler and the Flow minute counter. */
export function AutomationsHost() {
  const { flow } = usePower();
  useEffect(() => { void tickSchedule(); const t = setInterval(() => void tickSchedule(), 30_000); return () => clearInterval(t); }, []);
  useEffect(() => { if (!flow) return; const t = setInterval(() => { if (document.visibilityState === "visible") addFocusMinute(); }, 60_000); return () => clearInterval(t); }, [flow]);
  return null;
}
