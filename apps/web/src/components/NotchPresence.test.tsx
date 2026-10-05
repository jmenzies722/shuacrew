import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NotchPresence } from "./NotchPresence";
it("does not present readiness or working animation when a decision is needed", () => {
  const html = renderToStaticMarkup(<NotchPresence state="awaiting-approval" watching={false} onExpand={() => {}} />);
  expect(html).toContain("Waiting for your decision");
  expect(html).toContain("is-attention");
  expect(html).not.toContain("What’s on your mind?");
});
it("uses actual capture context and labels unavailable context honestly", () => {
  const render = (app?: string) => renderToStaticMarkup(<NotchPresence state="idle" watching app={app} onExpand={() => {}} />);
  expect(render("TextEdit")).toContain("TextEdit");
  expect(render()).toContain("Switch to your task app");
  expect(render()).toContain('aria-label="Expand conversation"');
});
