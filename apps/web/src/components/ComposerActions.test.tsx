import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ComposerActions } from "./ComposerActions";

describe("conversation interruption controls", () => {
  for (const compact of [false, true]) {
    it(`keeps Stop available while composing in ${compact ? "the notch" : "full chat"}`, () => {
      const html = renderToStaticMarkup(<ComposerActions draft="My next question" active onStop={() => {}} compact={compact} />);
      expect(html).toContain('aria-label="Stop"');
      expect(html).toContain('aria-label="Send"');
    });
    it(`offers Stop without an empty Send button in ${compact ? "the notch" : "full chat"}`, () => {
      const html = renderToStaticMarkup(<ComposerActions draft=" " active onStop={() => {}} compact={compact} />);
      expect(html).toContain('aria-label="Stop"');
      expect(html).not.toContain('aria-label="Send"');
    });
  }
  it("disables Send when idle with no message", () => {
    const html = renderToStaticMarkup(<ComposerActions draft="" active={false} onStop={() => {}} />);
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('aria-label="Stop"');
  });
});
