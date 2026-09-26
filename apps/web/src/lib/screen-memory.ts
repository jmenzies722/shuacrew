import { useEffect, useState } from "react";

type Native = { postMessage(m: unknown): void };
const native = () => (window as unknown as { webkit?: { messageHandlers?: { shuacrew?: Native } } }).webkit?.messageHandlers?.shuacrew;

/** Screen memory's switch lives in the Mac app (it does the reading); this asks it and flips it. */
export function useScreenMemory() {
  const [state, setState] = useState<{ on: boolean; access: boolean } | null>(null);
  useEffect(() => {
    const on = (e: Event) => setState((e as CustomEvent<{ on: boolean; access: boolean }>).detail);
    window.addEventListener("shuacrew:screenMemory", on);
    native()?.postMessage({ type: "buddyScreenMemory" });
    return () => window.removeEventListener("shuacrew:screenMemory", on);
  }, []);
  return { state, available: !!native(), set: (on: boolean) => native()?.postMessage({ type: "buddyScreenMemory", on }) };
}

/** Does this question reach back in time to something on screen? ("what was that error an hour ago") */
export function asksAboutEarlier(q: string) {
  return /\b(earlier|ago|before|this morning|yesterday|last (hour|time)|a (minute|while) back|what was (that|the)|remind me what|(i|we) (saw|had|looked at)|was on (my|the) screen)\b/i.test(q);
}

export interface Recollection { at: number; app: string; window: string; excerpt: string }
/** Search screen memory and phrase the hits as context for Spark (empty when nothing matches). */
export async function recall(q: string): Promise<string> {
  try {
    const r = await fetch(`/api/screen-memory/search?q=${encodeURIComponent(q)}`);
    const { results = [] } = await r.json() as { results?: Recollection[] };
    if (!results.length) return "";
    const when = (at: number) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return ["SCREEN MEMORY (text the user had on screen earlier, newest-relevant first; quote it exactly, say when and in which app):",
      ...results.map((m) => `- ${when(m.at)} · ${m.app}${m.window ? ` — ${m.window}` : ""}:\n${m.excerpt}`)].join("\n");
  } catch { return ""; }
}

/** "Hey Spark": the switch lives in the Mac app (it listens on-device); names are what wake it besides "Spark". */
export function useWakeWord(names: string[]) {
  const [state, setState] = useState<{ on: boolean; error?: string } | null>(null);
  const key = names.join("|");
  useEffect(() => {
    const on = (e: Event) => setState((e as CustomEvent<{ on: boolean; error?: string }>).detail);
    window.addEventListener("shuacrew:wakeWord", on);
    native()?.postMessage({ type: "buddyWake", names });
    return () => window.removeEventListener("shuacrew:wakeWord", on);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { state, available: !!native(), set: (on: boolean) => native()?.postMessage({ type: "buddyWake", on, names }) };
}
