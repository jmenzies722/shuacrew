import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AssistantDeck } from "./AssistantDeck";
import { beginAssistant } from "../lib/assistant-state";
it("shows honest connectivity, scoped permissions, and explicit task starters", () => {
  const html = renderToStaticMarkup(<AssistantDeck state={beginAssistant("t", 1)} connection="offline" screenEnabled={false} control="ask" trusted={false} background={[]} onAsk={() => {}} onStop={() => {}} onAccess={() => {}} />);
  expect(html).toContain("Offline");
  // More is opened on purpose: controls and starters show at once, each tile saying its state.
  expect(html).toContain("Look with me"); expect(html).toContain("Screen off · tap to allow"); expect(html).toContain("Needs Accessibility");
  expect(html).toContain("Focus 25m"); expect(html).not.toContain("OpenAI · Codex");
  expect(html).not.toContain("All systems online");
});
it("keeps waiting approval visible above task starters", () => {
  const html = renderToStaticMarkup(<AssistantDeck state={{ ...beginAssistant("t", 1), phase: "awaiting-approval", label: "Open Music?" }} connection="live" screenEnabled trusted control="ask" background={[]} onAsk={() => {}} onStop={() => {}} onAccess={() => {}} />);
  expect(html).toContain("Needs your approval"); expect(html).toContain("Open Music?"); expect(html).toContain("Stop task");
  expect(html).not.toContain("Focus session");
});
it("names the brain that actually answers, and why when it fell back", () => {
  const html = renderToStaticMarkup(<AssistantDeck state={beginAssistant("t", 1)} connection="live" screenEnabled trusted control="ask" background={[]} onAsk={() => {}} onStop={() => {}} onAccess={() => {}}
    brain={{ label: "Claude · claude-haiku-4-5", note: "Codex is at its usage limit until Sun 3:38 PM" }} />);
  expect(html).toContain("Claude · claude-haiku-4-5"); expect(html).toContain("is-fallback"); expect(html).toContain("usage limit");
});
