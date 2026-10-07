import { describe, expect, it } from "vitest";
import { bigAsk } from "./big-ask";

describe("bigAsk: anything you paste reaches Shua whole", () => {
  const article = Array.from({ length: 400 }, (_, i) => `Paragraph ${i} of a very long report about outages and costs.`).join("\n\n");
  it("leaves normal questions alone", () => {
    expect(bigAsk("What's on my calendar?")).toEqual({ ask: "What's on my calendar?" });
  });
  it("keeps the question you wrote at the end, and attaches all of the text", () => {
    const r = bigAsk(`${article}\n\nSummarize the three biggest risks.`, 5000);
    expect(r.ask.startsWith("Summarize the three biggest risks.")).toBe(true);
    expect(r.ask).toContain("[Pasted text]");
    expect(r.file?.body.length).toBe(`${article}\n\nSummarize the three biggest risks.`.length);
  });
  it("or the question at the start", () => {
    expect(bigAsk(`Is this contract fair to me?\n\n${article}`, 5000).ask.startsWith("Is this contract fair to me?")).toBe(true);
  });
  it("with no clear question, still sends it and says what to do", () => {
    const one = "x".repeat(30_000), r = bigAsk(one);
    expect(r.ask).toMatch(/^Here's something long/); expect(r.file?.body).toBe(one);
  });
  it("says how big it was, so Shua knows it's reading a file", () => {
    expect(bigAsk("y".repeat(40_000)).ask).toContain("40,000 characters");
  });
});
