/**
 * "Paste this into Terminal": when Shua tells you to paste something, the exact text is already on your clipboard.
 * Pure detection here; the notch copies natively (NSPasteboard via the Mac app) and shows "⌘V to paste".
 */
export type PasteHint = { text: string; where?: string };

const ASKS_TO_PASTE = /\b(paste|copy[- ]and[- ]paste|copy[- ]paste|⌘\s?v|cmd\s?\+\s?v|command[- ]v)\b/i;
// Where it goes: "paste it into Terminal", "paste this in your .zshrc", "into the search bar".
// Case-sensitive on purpose: only Capitalised words extend the name ("Visual Studio Code", not "and save").
const WHERE = /\b[Pp]aste\b[^.\n]{0,40}?\b(?:in|into|onto)\s+(?:the\s+|your\s+|a\s+|an\s+)?([\w.\-~/]+(?:\s+[A-Z][\w-]*){0,2}(?:\s+(?:bar|box|field|window|tab|file|app))?)/;

export function pasteTarget(reply: string): PasteHint | null {
  if (!ASKS_TO_PASTE.test(reply)) return null;
  const fences = [...reply.matchAll(/```[^\n`]*\n([\s\S]*?)```/g)].map((m) => ({ text: m[1]!.replace(/\n$/, ""), at: m.index! }));
  const where = WHERE.exec(reply)?.[1]?.replace(/[,;:]$/, "");
  const ask = reply.search(ASKS_TO_PASTE);
  // The block the instruction is about: the first one after the word "paste", else the last one before it.
  const block = fences.find((f) => f.at > ask) ?? [...fences].reverse().find((f) => f.at < ask);
  if (block?.text.trim()) return { text: block.text, ...(where ? { where } : {}) };
  // No code block: an inline `command` or "quoted text" in the same sentence as "paste".
  const sentence = reply.slice(Math.max(0, reply.lastIndexOf(".", ask) + 1), Math.min(reply.length, (reply.indexOf(".", ask + 1) + 1 || reply.length) + 200));
  const inline = /`([^`\n]{2,500})`/.exec(sentence)?.[1] ?? /[“"]([^”"\n]{2,500})[”"]/.exec(sentence)?.[1];
  return inline?.trim() ? { text: inline, ...(where ? { where } : {}) } : null;
}

/** Copies natively when inside the Mac app (works while the notch isn't focused), else via the browser. */
export function copyForPaste(hint: PasteHint, post?: (m: Record<string, unknown>) => void) {
  if (post) post({ type: "buddyCopy", text: hint.text });
  else void navigator.clipboard?.writeText(hint.text).catch(() => undefined);
  window.dispatchEvent(new CustomEvent("shuacrew:copied", { detail: hint }));
}
