/** Exact demonstration requests only; quoted or negated phrases remain normal chat. */
export function demonstrationIntent(text: string): "start" | "stop" | null {
  const value = text.trim().replace(/[.!?]+$/, "").toLowerCase();
  if (/^(?:please )?(?:watch me(?: (?:do this|work|and learn|do this task))?|record (?:this|a|my) (?:task|demonstration)|learn (?:this|from me))$/.test(value)) return "start";
  if (/^(?:please )?(?:stop watching(?: me)?|stop recording|finish (?:the )?demonstration|i(?:'m| am) done teaching)$/.test(value)) return "stop";
  return null;
}

export function replayIntent(text:string):string|null {const value=text.trim().replace(/[.!?]+$/,"");if(/^(?:please )?replay (?:my |the )?last workflow$/i.test(value))return "last";return /^(?:please )?replay (?:my )?workflow (.+)$/i.exec(value)?.[1]?.trim() || null;}
