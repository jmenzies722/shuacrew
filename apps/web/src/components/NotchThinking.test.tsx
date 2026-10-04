import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NotchThinking } from "./NotchThinking";

it("reserves the timer slot from the first frame without showing a zero-second counter", () => {
  const markup = renderToStaticMarkup(<NotchThinking />);
  expect(markup).toContain('<time');
  expect(markup).toContain('visibility:hidden');
  expect(markup).toContain('aria-label="Working on your request"');
});
