/**
 * The Integrations marketplace. MCP entries come from the official registry
 * (metadata only). Skills come from the public anthropics/skills repo.
 * A remote server with no pasted secret is connected by OAuth. Anything that
 * needs an API key in a header is left out — that is not a sign-in.
 */

const REGISTRY = "https://registry.modelcontextprotocol.io/v0.1/servers";
const SKILLS = "https://api.github.com/repos/anthropics/skills/contents/skills";
const SKILL_RAW = "https://raw.githubusercontent.com/anthropics/skills/main/skills";

export interface CatalogServer {
  id: string;
  title: string;
  description: string;
  kind: "command" | "remote";
  command?: string;
  args: string[];
  url?: string;
  auth: "none" | "oauth";
}

export interface CatalogSkill {
  name: string;
  path: string;
}

interface RegistryServer {
  name?: string;
  title?: string;
  description?: string;
  packages?: Array<{ registryType?: string; identifier?: string }>;
  remotes?: Array<{ url?: string; headers?: Array<{ isSecret?: boolean; value?: string }> }>;
}

/** One installable card, or nothing when the server needs a pasted secret. */
export function catalogServer(server: RegistryServer): CatalogServer | null {
  const id = server.name?.trim();
  if (!id) return null;
  const title = server.title?.trim() || id.split("/").pop() || id;
  const description = (server.description ?? "").replace(/\s+/g, " ").trim().slice(0, 180);
  const npm = server.packages?.find((p) => p.registryType === "npm" && p.identifier);
  if (npm?.identifier) {
    return { id, title, description, kind: "command", command: "npx", args: ["-y", npm.identifier], auth: "none" };
  }
  const remote = server.remotes?.find((r) => r.url && !r.headers?.some((h) => h.isSecret || (h.value ?? "").includes("{")));
  if (!remote?.url) return null;
  return { id, title, description, kind: "remote", args: [], url: remote.url, auth: "oauth" };
}

const catalogCache = new Map<string, { at: number; cards: CatalogServer[] }>();

export async function mcpCatalog(query: string, get: typeof fetch = fetch): Promise<CatalogServer[]> {
  const key = query.trim().toLowerCase();
  const hit = catalogCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.cards;
  const url = new URL(REGISTRY);
  url.searchParams.set("version", "latest");
  url.searchParams.set("limit", "30");
  if (query.trim()) url.searchParams.set("search", query.trim());
  const response = await get(url, { signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error("the MCP registry didn't answer");
  const body = (await response.json()) as { servers?: Array<{ server?: RegistryServer }> };
  const seen = new Set<string>();
  const cards: CatalogServer[] = [];
  for (const row of body.servers ?? []) {
    const card = row.server ? catalogServer(row.server) : null;
    if (!card || seen.has(card.id)) continue;
    seen.add(card.id);
    cards.push(card);
    if (cards.length === 18) break;
  }
  catalogCache.set(key, { at: Date.now(), cards });
  return cards;
}

export async function skillCatalog(get: typeof fetch = fetch): Promise<CatalogSkill[]> {
  const response = await get(SKILLS, { headers: { Accept: "application/vnd.github+json", "User-Agent": "shuacrew" } });
  if (!response.ok) throw new Error("the skills list didn't answer");
  const body = (await response.json()) as Array<{ name?: string; type?: string }>;
  return body.filter((row) => row.type === "dir" && row.name).map((row) => ({ name: row.name!, path: `${SKILL_RAW}/${row.name}/SKILL.md` }));
}

export async function fetchSkill(name: string, get: typeof fetch = fetch): Promise<string> {
  if (!/^[a-z0-9-]+$/i.test(name)) throw new Error("unknown skill");
  const response = await get(`${SKILL_RAW}/${name}/SKILL.md`, { headers: { "User-Agent": "shuacrew" } });
  if (!response.ok) throw new Error("that skill isn't there");
  return response.text();
}

/**
 * Featured servers: ones we checked work with ShuaCrew — remote ones sign in by OAuth with
 * dynamic registration (no keys to paste), local ones run with npx. Grouped by what a solo
 * founder uses them for.
 */
export interface Featured {
  id: string;
  name: string; // the server name agents see (mcp__<name>__tool)
  title: string;
  category: "Build" | "Ship" | "Business" | "Research" | "Work";
  blurb: string;
  url?: string;
  command?: string;
  args?: string[];
  auth: "none" | "oauth" | "gh";
  /** A folder the server works in, asked for when you add it. */
  asksForFolder?: boolean;
}

export const FEATURED: Featured[] = [
  { id: "github", name: "github", title: "GitHub", category: "Build", blurb: "Repos, pull requests, issues and Actions runs. Uses your GitHub CLI login (gh): nothing new to sign in to, no token stored.", url: "https://api.githubcopilot.com/mcp/", auth: "gh" },
  { id: "playwright", name: "playwright", title: "Playwright", category: "Build", blurb: "Drive a real browser: click, type, screenshot, test your app end to end.", command: "npx", args: ["-y", "@playwright/mcp@latest"], auth: "none" },
  { id: "chrome-devtools", name: "chrome-devtools", title: "Chrome DevTools", category: "Build", blurb: "Inspect pages, network, console and performance in Chrome.", command: "npx", args: ["-y", "chrome-devtools-mcp@latest"], auth: "none" },
  { id: "context7", name: "context7", title: "Context7", category: "Build", blurb: "Up-to-date docs and examples for any library, so code matches the current API.", url: "https://mcp.context7.com/mcp", auth: "none" },
  { id: "filesystem", name: "files", title: "Filesystem", category: "Build", blurb: "Read and write files in one folder you choose.", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem"], auth: "none", asksForFolder: true },
  { id: "supabase", name: "supabase", title: "Supabase", category: "Build", blurb: "Your Postgres database, auth and storage: tables, SQL, migrations, logs.", url: "https://mcp.supabase.com/mcp", auth: "oauth" },
  { id: "neon", name: "neon", title: "Neon", category: "Build", blurb: "Serverless Postgres: projects, branches, SQL and migrations.", url: "https://mcp.neon.tech/mcp", auth: "oauth" },
  { id: "vercel", name: "vercel", title: "Vercel", category: "Ship", blurb: "Projects, deployments and build logs.", url: "https://mcp.vercel.com", auth: "oauth" },
  { id: "cloudflare", name: "cloudflare", title: "Cloudflare", category: "Ship", blurb: "Workers, DNS, and your Cloudflare account.", url: "https://mcp.cloudflare.com/mcp", auth: "oauth" },
  { id: "sentry", name: "sentry", title: "Sentry", category: "Ship", blurb: "Errors and issues from production, with stack traces.", url: "https://mcp.sentry.dev/mcp", auth: "oauth" },
  { id: "posthog", name: "posthog", title: "PostHog", category: "Ship", blurb: "Product analytics, funnels, feature flags and experiments.", url: "https://mcp.posthog.com/mcp", auth: "oauth" },
  { id: "stripe", name: "stripe", title: "Stripe", category: "Business", blurb: "Customers, products, prices and payment links. Agents ask before anything that charges.", url: "https://mcp.stripe.com", auth: "oauth" },
  { id: "paypal", name: "paypal", title: "PayPal", category: "Business", blurb: "Invoices, orders and transactions.", url: "https://mcp.paypal.com/mcp", auth: "oauth" },
  { id: "canva", name: "canva", title: "Canva", category: "Business", blurb: "Create and edit designs: social posts, decks, brand assets.", url: "https://mcp.canva.com/mcp", auth: "oauth" },
  { id: "figma", name: "figma", title: "Figma", category: "Build", blurb: "Read designs, components and variables to build UI that matches.", url: "https://mcp.figma.com/mcp", auth: "oauth" },
  { id: "linear", name: "linear", title: "Linear", category: "Work", blurb: "Issues, projects and cycles.", url: "https://mcp.linear.app/mcp", auth: "oauth" },
  { id: "notion", name: "notion", title: "Notion", category: "Work", blurb: "Search, read and write your Notion pages and databases.", url: "https://mcp.notion.com/mcp", auth: "oauth" },
  { id: "atlassian", name: "atlassian", title: "Jira & Confluence", category: "Work", blurb: "Jira issues and Confluence pages.", url: "https://mcp.atlassian.com/v1/sse", auth: "oauth" },
  { id: "memory", name: "memory", title: "Knowledge graph", category: "Research", blurb: "A persistent graph of people, companies and facts the agents build up.", command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"], auth: "none" },
  { id: "sequential-thinking", name: "thinking", title: "Sequential thinking", category: "Research", blurb: "Step-by-step reasoning for hard, multi-part problems.", command: "npx", args: ["-y", "@modelcontextprotocol/server-sequential-thinking"], auth: "none" },
];
