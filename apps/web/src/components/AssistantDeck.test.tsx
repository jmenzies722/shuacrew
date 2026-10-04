import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AssistantDeck } from "./AssistantDeck";
import { beginAssistant } from "../lib/assistant-state";
it("shows honest connectivity, scoped permissions, and explicit task starters", () => {
  const html = renderToStaticMarkup(<AssistantDeck state={beginAssistant("t", 1)} connection="offline" screenEnabled={false} control="ask" trusted={false} background={[]} onAsk={() => {}} onStop={() => {}} onAccess={() => {}} />);
  expect(html).toContain("Offline"); expect(html).toContain("OpenAI only");
  expect(html).toContain("Shortcuts &amp; tasks"); expect(html).not.toContain("Focus session"); expect(html).toContain("Screen off");
  expect(html).not.toContain("All systems online");
});
it("keeps waiting approval visible above task starters", () => {
  const html = renderToStaticMarkup(<AssistantDeck state={{ ...beginAssistant("t", 1), phase: "awaiting-approval", label: "Open Music?" }} connection="live" screenEnabled trusted control="ask" background={[]} onAsk={() => {}} onStop={() => {}} onAccess={() => {}} />);
  expect(html).toContain("Needs your approval"); expect(html).toContain("Open Music?"); expect(html).toContain("Stop task");
  expect(html).not.toContain("Focus session");
});
