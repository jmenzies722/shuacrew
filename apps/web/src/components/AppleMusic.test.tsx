import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("../screens/spark/bridge", () => ({ native: () => undefined, post: vi.fn() }));
vi.mock("../screens/spark/actions", () => ({ perform: vi.fn() }));
import { AppleMusic } from "./AppleMusic";

it("explains the native player requirement without claiming a connection", () => {
  const markup = renderToStaticMarkup(<AppleMusic />);
  expect(markup).toContain("Apple Music");
  expect(markup).toContain("ShuaCrew Mac app");
  expect(markup).not.toContain("Connected");
});
