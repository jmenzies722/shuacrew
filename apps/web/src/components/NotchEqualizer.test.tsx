import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NotchEqualizer } from "./NotchEqualizer";
it("keeps an idle instrument visible without claiming microphone capture", () => {
  const html = renderToStaticMarkup(<NotchEqualizer compact state="idle" />);
  expect(html).toContain("Ready · microphone inactive");
  expect(html).toContain("is-compact");
  expect(html.match(/<i /g)).toHaveLength(5);
});
it("distinguishes real audio, work, observation and permission states", () => {
  for (const [state, label] of [["listening", "Live microphone level"], ["speaking", "Live voice level"], ["acting", "Working indicator"], ["watching", "Watching your demonstration"], ["awaiting-approval", "Needs your attention"]]) {
    expect(renderToStaticMarkup(<NotchEqualizer state={state!} readLevel={() => .3} />)).toContain(label);
  }
});
