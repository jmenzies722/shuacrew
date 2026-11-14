/**
 * The review pass: a second agent reads a session's finished change and either passes it or lists what must be fixed.
 * It is the Reviewer role (roles.ts) at work, and the "Review" in Build → Verify → Review → Merge.
 *
 * The reviewer is given the diff as text and no repository, so it cannot alter the work it is judging. Its reply has
 * a fixed first line (`VERDICT: PASS` or `VERDICT: CHANGES`) so the gateway can act on it without guessing; a reply
 * that doesn't follow the shape is "unclear" and is shown to you rather than acted on.
 */
export const REVIEW_BY = "review";
export type ReviewState = "passed" | "changes" | "unclear";
/** How much of a diff a reviewer is shown. Past this it sees the start and is told the rest was cut. */
export const REVIEW_DIFF_MAX = 60_000;

export function clipDiff(diff: string, max = REVIEW_DIFF_MAX): { text: string; clipped: boolean } {
  if (diff.length <= max) return { text: diff, clipped: false };
  const cut = diff.lastIndexOf("\n", max);
  return { text: diff.slice(0, cut > max / 2 ? cut : max), clipped: true };
}

export function reviewAsk(input: { ask: string; base: string; diff: string; proof: string }): string {
  const { text, clipped } = clipDiff(input.diff);
  return [
    "You are reviewing a change another agent made. You cannot edit anything: your job is to find what is wrong before a person merges it.",
    `What was asked:\n${input.ask.trim().slice(0, 4000)}`,
    `Proof so far: ${input.proof}`,
    `The change (git diff against ${input.base})${clipped ? ", cut short because it is long; say so if what you need is missing" : ""}:\n\`\`\`diff\n${text}\n\`\`\``,
    [
      "Reply in exactly this shape.",
      "First line: `VERDICT: PASS` or `VERDICT: CHANGES`.",
      "Then, only for CHANGES: a numbered list of the problems that must be fixed, seven at most. For each: the file and line, what is wrong, and what to do instead.",
      "List only real defects: wrong behaviour, a broken or missing case the ask requires, a security or data-loss risk, a test that does not test what it claims. Do not list style, naming, things you would merely do differently, or praise. If you are unsure something is a defect, say what would confirm it.",
    ].join("\n"),
  ].join("\n\n");
}

/** Read a reviewer's reply. The verdict line may be preceded by a blank line or wrapped in backticks or bold. */
export function parseReview(text: string): { state: ReviewState; findings: string } {
  const match = /^[\s`*_>#-]*VERDICT:\s*[`*_]*\s*(PASS|CHANGES)\b[^\n]*\n?/im.exec(text);
  if (!match) return { state: "unclear", findings: text.trim() };
  const findings = text.slice(match.index + match[0].length).trim();
  if (match[1]!.toUpperCase() === "PASS") return { state: "passed", findings: "" };
  // "CHANGES" with nothing listed is not something a builder can act on.
  return findings ? { state: "changes", findings } : { state: "unclear", findings: "" };
}

/** What the session that made the change is told when the reviewer asks for fixes. */
export function reviewFollowUp(reviewer: string, findings: string): string {
  return `A reviewer (${reviewer}) read your change and asked for these fixes:\n\n${findings}\n\nFix what is right. For anything you disagree with, say why in a line instead of changing it. Then run the checks again.`;
}
