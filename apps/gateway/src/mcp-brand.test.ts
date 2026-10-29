import { expect, it } from "vitest";
import { resolveMcpBrand } from "./mcp-brand.js";
const catalog = [{ assetId: "github", origins: ["https://api.githubcopilot.com"], packages: ["@modelcontextprotocol/server-github"], communityPackages: ["@modelcontextprotocol/server-github"] }];
it("does not trust display names or deceptive origins", () => {
  expect(resolveMcpBrand({ name: "GitHub" }, [])).toEqual({ assetId: null, publisher: "unknown" });
  expect(resolveMcpBrand({ name: "GitHub", url: "https://api.githubcopilot.com.evil.example/mcp" }, catalog)).toEqual({ assetId: null, publisher: "unknown" });
  expect(resolveMcpBrand({ name: "Any", url: "https://api.githubcopilot.com/mcp/" }, catalog)).toEqual({ assetId: "github", publisher: "official" });
  expect(resolveMcpBrand({ name: "Any", packageId: "@modelcontextprotocol/server-github" }, catalog)).toEqual({ assetId: "github", publisher: "community" });
  expect(resolveMcpBrand({ name: "Any", url: "https://secret@api.githubcopilot.com/mcp" }, catalog)).toEqual({ assetId: null, publisher: "unknown" });
});
it("brands every featured server that has a reviewed asset, and only via exact identity", async () => {
  const { FEATURED } = await import("./catalog.js"), { MCP_BRANDS, mcpPackage } = await import("./mcp-brand.js");
  const fs = await import("node:fs"), manifest = JSON.parse(fs.readFileSync(new URL("../../web/public/brands/manifest.json", import.meta.url), "utf8"));
  const assets = new Map<string, { light: { file: string }; dark: { file: string } }>(manifest.assets.map((a: { id: string }) => [a.id, a]));
  for (const brand of MCP_BRANDS) {
    const asset = assets.get(brand.assetId); expect(asset, brand.assetId).toBeTruthy();
    for (const f of [asset!.light.file, asset!.dark.file]) expect(fs.existsSync(new URL(`../../web/public/brands/${f}`, import.meta.url)), f).toBe(true);
  }
  const branded = FEATURED.filter(f => resolveMcpBrand({ name: f.name, url: f.url, packageId: mcpPackage(f.command, f.args ?? []) }).assetId).map(f => f.id);
  expect(branded.sort()).toEqual(["atlassian", "chrome-devtools", "cloudflare", "github", "linear", "neon", "notion", "paypal", "posthog", "sentry", "stripe", "supabase", "vercel"]);
  expect(resolveMcpBrand({ name: "stripe", url: "https://mcp.stripe.com.attacker.dev" })).toEqual({ assetId: null, publisher: "unknown" });
  expect(resolveMcpBrand({ name: "chrome-devtools", packageId: "chrome-devtools-mcp-evil" })).toEqual({ assetId: null, publisher: "unknown" });
});
