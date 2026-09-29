export interface McpBrand { assetId: string; origins: string[]; packages: string[]; communityPackages?: string[] }
export const MCP_BRANDS: McpBrand[] = [
  { assetId: "github", origins: ["https://api.githubcopilot.com"], packages: ["@modelcontextprotocol/server-github"], communityPackages: ["@modelcontextprotocol/server-github"] },
  // Exact reviewed endpoint origins / package identities only (see apps/web/public/brands/manifest.json).
  { assetId: "chrome-devtools", origins: [], packages: ["chrome-devtools-mcp"] },
  { assetId: "supabase", origins: ["https://mcp.supabase.com"], packages: [] },
  { assetId: "neon", origins: ["https://mcp.neon.tech"], packages: [] },
  { assetId: "vercel", origins: ["https://mcp.vercel.com"], packages: [] },
  { assetId: "cloudflare", origins: ["https://mcp.cloudflare.com"], packages: [] },
  { assetId: "sentry", origins: ["https://mcp.sentry.dev"], packages: [] },
  { assetId: "posthog", origins: ["https://mcp.posthog.com"], packages: [] },
  { assetId: "stripe", origins: ["https://mcp.stripe.com"], packages: [] },
  { assetId: "paypal", origins: ["https://mcp.paypal.com"], packages: [] },
  { assetId: "figma", origins: ["https://mcp.figma.com"], packages: [] },
  { assetId: "linear", origins: ["https://mcp.linear.app"], packages: [] },
  { assetId: "notion", origins: ["https://mcp.notion.com"], packages: [] },
  { assetId: "atlassian", origins: ["https://mcp.atlassian.com"], packages: [] },
];

export function resolveMcpBrand(input: { url?: string; packageId?: string; name: string }, catalog: McpBrand[] = MCP_BRANDS): { assetId: string | null; publisher: "official" | "community" | "unknown" } {
  let origin: string | undefined;
  if (input.url) { try { const url = new URL(input.url); if (url.protocol !== "https:" || url.username || url.password) return { assetId: null, publisher: "unknown" }; origin = url.origin; } catch { return { assetId: null, publisher: "unknown" }; } }
  for (const brand of catalog) {
    if (origin && brand.origins.includes(origin)) return { assetId: brand.assetId, publisher: "official" };
    if (!input.url && input.packageId && brand.packages.includes(input.packageId)) return { assetId: brand.assetId, publisher: brand.communityPackages?.includes(input.packageId) ? "community" : "official" };
  }
  return { assetId: null, publisher: "unknown" };
}
export function mcpPackage(command: string | undefined, args: string[]): string | undefined {
  if (command !== "npx") return undefined;
  // Do not infer provenance through shell commands, arbitrary executables or later arguments.
  const candidate = args[0] === "-y" ? args[1] : args[0];
  if (!candidate || !/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+(?:@(?:latest|\d[\w.-]*))?$/.test(candidate)) return undefined;
  return candidate.replace(/@(latest|\d[\w.-]*)$/, "");
}
