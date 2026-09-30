import { useEffect, useRef, useState } from "react";

/**
 * On at once, off only after `ms` of staying off. The notch used to open for 6–58 ms and snap shut between a
 * reply's sentences (measured), so it flickered and clipped its caption mid-animation.
 */
export function lingerNext(state: { on: boolean; offAt: number | null }, wanted: boolean, now: number, ms: number): { on: boolean; offAt: number | null } {
  if (wanted) return { on: true, offAt: null };
  if (!state.on) return state;
  if (state.offAt === null) return { on: true, offAt: now + ms };
  return now >= state.offAt ? { on: false, offAt: null } : state;
}

/** React: `wanted`, held on for `ms` after it goes false. */
export function useLinger(wanted: boolean, ms: number): boolean {
  const [on, setOn] = useState(wanted), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(timer.current);
    if (wanted) setOn(true); else timer.current = setTimeout(() => setOn(false), ms);
    return () => clearTimeout(timer.current);
  }, [wanted, ms]);
  return wanted || on;
}
