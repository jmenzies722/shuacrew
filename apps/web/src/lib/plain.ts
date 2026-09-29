import { noEmoji } from "./no-emoji";
/** One line of agent text for a card or list: markdown marks and emoji removed, words kept. */
export function plain(text: string | undefined): string {
  if (!text) return "";
  return noEmoji(text).replace(/```[\s\S]*?```/g, " ").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2").replace(/(^|\s)[*_](\S[^*_]*?)[*_](?=\s|$)/g, "$1$2").replace(/^\s*(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/\s+/g, " ").trim();
}
