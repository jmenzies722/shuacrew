/// <reference types="node" />
import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { ProviderStrip, providerState } from "../screens/Observability";
import { AreaChart, Readouts, RhythmMap, Treemap } from "../components/ControlRoom";

const xs = [Date.UTC(2026, 8, 24), Date.UTC(2026, 8, 25), Date.UTC(2026, 8, 26)];
const chart = (values: number[], known?: boolean[]) => renderToStaticMarkup(
  <AreaChart width={600} xs={xs} series={[{ id: "codex", label: "Codex", color: "var(--amber)", values }]} label="Tokens per day" known={known}
    formatX={(t) => new Date(t).toISOString().slice(0, 10)} tick={(_, i, n) => (i === n - 1 ? "Today" : "day")} formatValue={(v) => String(Math.round(v))} />);

it("draws a labelled, keyboard-reachable chart with a zero baseline and no NaN", () => {
  const html = chart([100, 0, 25]);
  expect(html).toContain("<svg"); expect(html).toContain("<path");
  expect(html).toContain('aria-label="Tokens per day"'); expect(html).toContain('tabindex="0"');
  expect(html).toContain("cr-base"); expect(html).toContain("Today");
  expect(html).not.toContain("NaN");
});

it("colours charts with the app's theme tokens through style, so the theme resolves them", () => {
  const html = chart([1, 2, 3]);
  expect(html).toContain("stroke:var(--amber)");
  expect(html).not.toContain("var(--green)"); expect(html).not.toContain("var(--accent)");
  const css = readFileSync(new URL("../components/control-room.css", import.meta.url), "utf8");
  expect(css).not.toContain("var(--accent)");
});

it("draws nothing until it knows its width, and nothing for no data", () => {
  expect(renderToStaticMarkup(<AreaChart xs={xs} series={[]} label="x" formatX={String} tick={() => null} formatValue={String} />)).not.toContain("<svg");
  expect(renderToStaticMarkup(<AreaChart width={400} xs={[]} series={[]} label="x" formatX={String} tick={() => null} formatValue={String} />)).not.toContain("<svg");
});

it("keeps readouts and tiles readable", () => {
  const html = renderToStaticMarkup(<Readouts items={[{ label: "Today", value: "12k", sub: "of 1M", tone: "wait" }]} />);
  expect(html).toContain("<dt>Today</dt>"); expect(html).toContain("is-wait");
  const tiles = renderToStaticMarkup(<Treemap width={600} tiles={[{ id: "a", label: "Big session", value: 9, color: "#7aa2ff" }, { id: "b", label: "Small", value: 1, color: "#e8916b" }]} formatValue={String} />);
  expect(tiles).toContain("Big session"); expect(tiles).not.toContain("NaN");
  expect(renderToStaticMarkup(<RhythmMap grid={Array.from({ length: 7 }, () => new Array(24).fill(0))} formatValue={String} />)).toContain("Mon");
});

it("does not claim a provider connection when sign-in is unknown", () => {
  const p = { id: "codex", label: "Codex", authMode: "subscription", limitedUntil: null, status: { installed: true, signedIn: null, overridingKeys: [] } };
  const html = renderToStaticMarkup(<ProviderStrip providers={[p]} />);
  expect(html).toContain("Connection unverified"); expect(html).not.toContain("Connected");
  expect(providerState({ ...p, status: { ...p.status, signedIn: true } }).text).toBe("Connected");
  expect(providerState({ ...p, status: { ...p.status, signedIn: true }, limitedUntil: Date.now() + 60_000 }).tone).toBe("wait");
});
