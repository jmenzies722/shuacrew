import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { VoiceComparison } from "./VoiceComparison";
it("keeps unavailable voices disabled and cloud unconfigured", () => {
  const markup = renderToStaticMarkup(<VoiceComparison voices={[]} />);
  expect(markup).toContain("Compare narration voices");
  expect(markup).toContain("Cloud voice is not configured");
  expect(markup).toContain("disabled");
});
it("does not offer manifest voices when the engine is unavailable", () => {
  const markup = renderToStaticMarkup(<VoiceComparison voices={[{ id: "michael", name: "Michael" }]} ready={false} engine="Kokoro" error="Models missing" />);
  expect(markup).toContain("Models missing");
  expect(markup).not.toContain("Hear Michael");
});
