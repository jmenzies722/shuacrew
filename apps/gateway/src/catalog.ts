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
