import { describe, expect, it } from "vitest";
import { nextSentences, spoken } from "./buddy";
import { prose } from "./plain";

/** Stream `text` in `step`-sized pieces the way the notch does (each piece re-checks from the last cut), then finish. */
function streamed(text: string, step: number): string[] {
  const out: string[] = []; let upto = 0;
  for (let n = step; n < text.length; n += step) { const r = nextSentences(text.slice(0, n), upto); out.push(...r.chunks); upto = r.upto; }
  out.push(...nextSentences(text, upto, true).chunks);
  return out;
}
const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);

/** Replies shaped like the ones Shua really sends (from the event log), plus the awkward ones. */
const REPLIES: Record<string, { text: string; say: string[] }> = {
  "prose after an action block": { text: 'Opening Calendar.\n```do {"type":"open_app","app":"Calendar"}```\nIt\'s open, and your next meeting is at 3.', say: ["Opening Calendar.", "It's open, and your next meeting is at 3."] },
  "prose after a code block": { text: "Run this:\n```bash\nnpm install\n```\nThat installs everything you need.", say: ["Run this:", "That installs everything you need."] },
  "a visual card between paragraphs": { text: 'Here is the flow.\n```visual {"type":"steps","items":["a","b"]}```\nThe API checks the cache first. Then it calls the database.', say: ["Here is the flow.", "The API checks the cache first.", "Then it calls the database."] },
  "a bullet list with no final punctuation": { text: "What should I do with this profile?\n\n- Open it\n- Summarize it\n- Save the link to memory", say: ["What should I do with this profile?", "Open it", "Summarize it", "Save the link to memory"] },
  "next-move chips are never read": { text: 'All set.\n```next ["Play it again","Show the album"]```', say: ["All set."] },
  "a table is read as its cells": { text: "Here's the compare:\n| Plan | Price |\n|---|---|\n| Pro | $20 |\n| Max | $100 |", say: ["Here's the compare:", "Plan, Price", "Pro, $20", "Max, $100"] },
  "links read their words, bare URLs their site": { text: "Read [the AWS guide](https://aws.amazon.com/x) first. Then open https://www.terraform.io/docs/cli?x=1 for the CLI.", say: ["Read the AWS guide first.", "Then open terraform.io for the CLI."] },
  "numbers, prices and times stay whole": { text: "It costs $1.50 an hour, about 3.2x cheaper. Meet at 3:45 pm.", say: ["It costs $1.50 an hour, about 3.2x cheaper.", "Meet at 3:45 pm."] },
  "the written design after --- isn't read twice": { text: "Short summary here.\n---\n## Requirements\nlots of detail", say: ["Short summary here."] },
  "emoji-only and empty say nothing": { text: "🎉 ✨", say: [] },
};

describe("Shua finishes what it says", () => {
  for (const [name, { text, say }] of Object.entries(REPLIES)) {
    it(`${name}: all of it, once`, () => {
      expect(nextSentences(text, 0, true).chunks).toEqual(say);
      // Streamed in any chunk size, the voice says the same thing: nothing lost, nothing twice.
      for (const step of [1, 3, 7, 16, 41]) expect(streamed(text, step).join(" ")).toBe(say.join(" "));
    });
  }
  it("a long run-on sentence starts speaking before it ends, and still says every word", () => {
    const text = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ") + " and that is the end";
    const early = nextSentences(text.slice(0, 400), 0);
    expect(early.chunks.length).toBeGreaterThan(0); // didn't wait for a full stop that never comes
    expect(words(streamed(text, 9).join(" "))).toEqual(words(text));
  });
  it("an unfinished code fence mid-stream is never read, and what follows it is", () => {
    const partial = "Run this:\n```bash\nnpm ins";
    expect(nextSentences(partial, 0).chunks).toEqual(["Run this:"]);
    expect(streamed("Run this:\n```bash\nnpm install\n```\nDone, it worked.", 5)).toEqual(["Run this:", "Done, it worked."]);
  });
  it("speaks every word the notch shows (minus code)", () => {
    for (const { text } of Object.values(REPLIES)) {
      if (text.includes("\n---\n")) continue;
      const shown = words(prose(text).replace(/https?:\/\/\S+/g, "")), said = words(streamed(text, 11).join(" "));
      for (const w of shown) if (!/^(https?|www|com|io|x|1)$/.test(w)) expect(said, `"${w}" in: ${text}`).toContain(w);
    }
  });
  it("spoken() never leaves markdown marks for the voice to read out", () => {
    expect(spoken("**Bold** and _it_ and `code` and ## Heading and > quote")).not.toMatch(/[*_`#>]/);
    expect(spoken("| a | b |")).toBe("a, b");
  });
});
