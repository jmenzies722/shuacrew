import { expect, it } from "vitest";
import { boundedIcons, loadMcpIcon } from "./mcp-icons.js";
it("bounds untrusted icon metadata and never fetches it without a safe decoder", async () => {
  expect(boundedIcons([{ src: "https://example.com/icon.png", mimeType: "image/png" }, { src: "file:///secret" }, { src: "data:image/svg+xml,<svg onload='bad()'/>" }])).toEqual([{ src: "https://example.com/icon.png", mimeType: "image/png" }]);
  expect(boundedIcons([{ src: "https://example.com/" + "a".repeat(5000) }])).toEqual([]);
  expect(await loadMcpIcon("server", 0)).toBeNull();
  expect(await loadMcpIcon("https://127.0.0.1/private", 0)).toBeNull();
});
