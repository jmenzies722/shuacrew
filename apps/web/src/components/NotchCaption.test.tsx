import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HeardReply, SpokenReply } from "./NotchCaption";

const text = "Pick one task, set a timer, and silence notifications.";

it("a live reply appears as it's heard: said, now, and the rest unseen until spoken — whole when the voice is off", () => {
  const mid = renderToStaticMarkup(<HeardReply text={text} heard="Pick one task," speaking />);
  expect((mid.match(/is-said/g) ?? []).length).toBe(3);
  expect(mid).toMatch(/class="is-now">set</);
  expect((mid.match(/is-unsaid/g) ?? []).length).toBe(5); // ahead of the voice: there, but not seen
  expect(renderToStaticMarkup(<HeardReply text={text} heard="" speaking={false} />)).toMatch(/is-waiting/); // about to speak
  const muted = renderToStaticMarkup(<HeardReply text={text} heard="" speaking={false} voiced={false} />);
  expect(muted).not.toMatch(/is-unsaid|is-now|is-waiting/);
});

it("a reply Shua is about to say waits for the voice instead of running ahead of it", () => {
  const written = renderToStaticMarkup(<SpokenReply text={text} line={null} streaming voiceLed />);
  expect(written).toMatch(/is-waiting/);
  expect(written).not.toMatch(/notifications/);
  // Voice off: it streams as written, as before.
  const silent = renderToStaticMarkup(<SpokenReply text={text} line={null} streaming />);
  expect(silent).toMatch(/notifications/);
  expect(silent).not.toMatch(/is-unsaid|is-waiting/);
});
