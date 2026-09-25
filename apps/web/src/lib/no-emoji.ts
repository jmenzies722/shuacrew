/**
 * ShuaCrew shows no emoji: icons carry meaning, words carry the rest. Strips pictographs a model writes
 * (and the joiners and variation selectors that glue them), keeping text symbols like → © ✓ and code intact.
 */
const EMOJI = /(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}️)(?:‍(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}️?))*[\u{1F3FB}-\u{1F3FF}]?️?/gu;
export function noEmoji(text: string): string {
  if (!text) return text;
  return text.replace(EMOJI, "").replace(/[️‍]/g, "").replace(/[ \t]{2,}/g, " ");
}
