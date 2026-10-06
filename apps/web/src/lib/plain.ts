import { noEmoji } from "./no-emoji";
/** One line of agent text for a card or list: markdown marks and emoji removed, words kept. */
export function plain(text: string | undefined): string {
  if (!text) return "";
  return noEmoji(text).replace(/```[\s\S]*?```/g, " ").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2").replace(/(^|\s)[*_](\S[^*_]*?)[*_](?=\s|$)/g, "$1$2").replace(/^\s*(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/\s+/g, " ").trim();
}

/**
 * Markdown as flowing speech-like prose, for the notch: no stars, hashes, backticks or bullets — lists become
 * sentences, headings become lead-ins, tables become "a · b", links keep their words. Safe mid-stream: a half-arrived
 * "**bol" or an unclosed code fence never shows its marks.
 */
export function prose(text: string | undefined): string {
  if (!text) return "";
  let t = noEmoji(text).replace(/```[\s\S]*?(```|$)/g, " ").replace(/\[([^\]]+)\]\([^)]*\)?/g, "$1").replace(/`+/g, "");
  const lines = t.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^[-|:\s]{3,}$/.test(l)).map((l) => {
    const heading = /^#{1,6}\s+/.test(l), item = /^([-*+•]|\d+[.)])\s+/.test(l);
    l = l.replace(/^#{1,6}\s+/, "").replace(/^>\s*/, "").replace(/^([-*+•]|\d+[.)])\s+/, "");
    if (l.includes("|")) l = l.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()).filter(Boolean).join(" · ");
    if ((heading || item) && !/[.!?:;,]$/.test(l)) l += heading ? ":" : ".";
    return l;
  });
  t = lines.join(" ")
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, "$2")       // **bold**, __bold__
    .replace(/(^|[\s(])[*_](?=\S)([^*_]*?\S)[*_](?=[\s).,!?:;]|$)/g, "$1$2") // *italic*, _italic_
    .replace(/\*+|(^|\s)_{1,2}(?=\S)|~~/g, "$1")           // whatever's left half-typed
    .replace(/\s+([.,!?:;])/g, "$1").replace(/\s+/g, " ");
  return t.trim();
}
