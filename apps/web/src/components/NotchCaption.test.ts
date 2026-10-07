import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SpokenReply, fitTimes, revealTimes, sentenceStart } from "./NotchCaption";

it("re-times words to the sentence's real length, so the last word lands just before it ends", () => {
  const text = "Kokoro speaks a little faster than the guess", t = revealTimes(text);
  expect(fitTimes(t, text, 1)).toEqual(t); // length not known yet: keep the estimate
  const fast = fitTimes(t, text, 1, 1500), slow = fitTimes(t, text, 1, 6000);
  expect(fast.at(-1)!).toBeLessThan(t.at(-1)!);
  expect(slow.at(-1)!).toBeGreaterThan(t.at(-1)!);
  expect(fast.at(-1)!).toBeLessThan(1500);
  expect(fast[0]).toBe(0);
});

it("reveals words at speaking pace, pausing after punctuation, faster at a faster voice", () => {
  const t = revealTimes("Hi there, friend. Next up");
  expect(t).toHaveLength(5);
  expect(t[0]).toBe(0);
  expect(t.every((v, i) => i === 0 || v > t[i - 1]!)).toBe(true);
  // the gap after "friend." includes a sentence beat; after "there," a shorter comma beat
  expect(t[3]! - t[2]!).toBeGreaterThan(t[2]! - t[1]!);
  expect(revealTimes("one two three", 1.25)[2]).toBeLessThan(revealTimes("one two three", 1)[2]!);
  expect(revealTimes("   ")).toEqual([]);
});

const words = "Sure. Your crew finished the upload fix, and 42 tests pass. Want me to open it?".split(" ");

it("finds where each spoken sentence starts in the streamed reply, so speaking brightens words in place", () => {
  expect(sentenceStart(words, ["Sure."], 0)).toBe(0);
  expect(sentenceStart(words, ["Your", "crew", "finished"], 1)).toBe(1);
  expect(sentenceStart(words, ["Want", "me", "to", "open", "it?"], 3)).toBe(11);
});
it("ignores punctuation and case, and never looks behind where speech already is", () => {
  expect(sentenceStart(words, ["your", "CREW"], 0)).toBe(1);
  expect(sentenceStart(words, ["Sure."], 2)).toBe(-1);
});
it("reports a line that isn't part of this reply (a notification), so the plain caption takes over", () => {
  expect(sentenceStart(words, ["Your", "timer", "is", "done."], 0)).toBe(-1);
  expect(sentenceStart(words, [], 0)).toBe(-1);
});

describe("SpokenReply shows the whole reply", () => {
  const reply = "I still can't see your calendar, so I don't have three priorities to give you. The quickest fix is to paste your to-do list. Then I'll give you the top three in one line each.";
  it("every word, in order, nothing cut with an ellipsis", () => {
    const html = renderToStaticMarkup(createElement(SpokenReply, { text: reply, line: null, lines: 6 }));
    const shown = [...html.matchAll(/<span data-i="\d+" class="[^"]+">([^<]+)<\/span>/g)].map((m) => m[1]).join(" ");
    expect(shown.replace(/&#x27;/g, "'")).toBe(reply);
    expect(html).not.toContain("…");
    expect(html).toContain('style="--lines:6"');
  });
  it("not speaking: all of it reads as said; speaking: the voice's word is lit and the rest wait", () => {
    expect(renderToStaticMarkup(createElement(SpokenReply, { text: reply, line: null }))).not.toMatch(/is-next|is-now/);
    const speaking = renderToStaticMarkup(createElement(SpokenReply, { text: reply, line: { key: 1, text: "I still can't see your calendar, so I don't have three priorities to give you.", speed: 1 } }));
    expect(speaking).toMatch(/data-i="0" class="is-now"/);
    expect(speaking).toMatch(/data-i="1" class="is-next"/);
  });
  it("a caret only while it's still being written", () => {
    expect(renderToStaticMarkup(createElement(SpokenReply, { text: "Working on", line: null, streaming: true }))).toContain("notch-caret");
    expect(renderToStaticMarkup(createElement(SpokenReply, { text: "Done.", line: null }))).not.toContain("notch-caret");
  });
});
