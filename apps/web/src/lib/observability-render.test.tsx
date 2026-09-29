/// <reference types="node" />
import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { UsageChart, ProviderStrip } from "../screens/Observability";
it("uses defined theme colors for every usage series", () => {
  const html = renderToStaticMarkup(<UsageChart rows={[{ id: "2026-09-24", inputTokens: 100, outputTokens: 25, cacheTokens: 0, reportedCostUsd: null, records: 1 }]} />);
  expect(html).not.toContain("var(--green)"); expect(html).toContain("var(--ok)");
});
it("uses the application's defined accent token so input bars remain visible", () => {
  const css = readFileSync(new URL("../screens/observability.css", import.meta.url), "utf8");
  expect(css).not.toContain("var(--accent)");
  expect(css).toContain(".obs-input { background: var(--amber)");
});
it("renders exact accessible values beside the zero-baseline chart", () => {
  const html = renderToStaticMarkup(<UsageChart rows={[{ id: "2026-09-24", inputTokens: 100, outputTokens: 25, cacheTokens: 40, reportedCostUsd: null, records: 1 }]} />);
  expect(html).toContain("Zero baseline"); expect(html).toContain("Exact daily values");
  expect(html).toContain("<td>100</td>"); expect(html).toContain("<td>25</td>"); expect(html).toContain("<td>40</td>");
  expect(html).not.toContain("NaN");
  expect(html).toContain("<svg");
  expect(html).toContain("<path");
  expect(renderToStaticMarkup(<UsageChart rows={[]} />)).toContain("No observations");
});
it("does not draw measured zero usage for days without usage records", () => {
  const html = renderToStaticMarkup(<UsageChart rows={[{ id: "2026-09-24", inputTokens: 0, outputTokens: 0, cacheTokens: 0, reportedCostUsd: null, records: 0 }]} />);
  expect(html).toContain("No measured observations");
  expect(html).not.toContain("<path");
});
it("does not claim a provider connection when sign-in is unknown", () => {
  const html = renderToStaticMarkup(<ProviderStrip providers={[{ id: "codex", label: "Codex", authMode: "subscription", limitedUntil: null, status: { installed: true, signedIn: null, overridingKeys: [] } }]} />);
  expect(html).toContain("Connection unverified"); expect(html).not.toContain("Connected");
});
