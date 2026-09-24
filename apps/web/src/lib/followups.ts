/**
 * What you'd probably say next, read from the agent's own last reply — never invented. A reply
 * that ends by offering choices ("1. Push it  2. Open a PR") becomes one pill per choice; one that
 * ends on a yes/no question ("Want me to push it?") becomes "Yes, go ahead" and "Not now".
 */
export function suggestions(reply: string): string[] {
  const text = reply.trim();
  if (!text) return [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // Options: the reply's last run of list items, when a question or "options" line leads into them.
  const tail: string[] = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = /^(?:[-*•]|\d+[.)]|\(?[a-c]\))\s+(.+)$/.exec(lines[i]!);
    if (!m) {
      const lead = lines[i]!;
      if (tail.length >= 2 && tail.length <= 5 && /\?|:$|option|choose|pick|prefer|would you|want me|either/i.test(lead)) {
        return tail.reverse().map(clean).filter((o) => o.length > 1 && o.length <= 90);
      }
      break;
    }
    tail.push(m[1]!);
  }

  // A closing yes/no question.
  const last = lines[lines.length - 1]!;
  const question = last.split(/(?<=[.!])\s+/).pop()!;
  if (/\?$/.test(question) && /\b(want me to|should i|shall i|do you want|would you like|ok to|go ahead|proceed)\b/i.test(question)) {
    return ["Yes, go ahead", "Not now"];
  }
  return [];
}

/** "**Push it** — to the new remote" → "Push it — to the new remote" */
function clean(option: string): string {
  return option
    .replace(/\*\*|__|`/g, "")
    .replace(/\s*\(recommended\)\s*/i, " ")
    .replace(/[.:;]\s*$/, "")
    .trim();
}
