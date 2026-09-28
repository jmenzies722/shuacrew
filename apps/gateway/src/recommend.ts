import type { Featured } from "./catalog.js";

/**
 * What would make this ask go better: vetted MCP servers you haven't connected, and skills you haven't installed.
 * Pure and cheap, run on every message: an explicit name ("in Notion") scores high, the kind of work ("deploy",
 * "payments", "why is prod crashing") scores lower, and nothing shows below the bar — no noise on small talk.
 */
const HINTS: Record<string, RegExp> = {
  playwright: /\b(browser automation|scrape|scraping|e2e|end[- ]to[- ]end|test (the|my) (site|web ?app|app) in a browser|click through (the|my) site)\b/,
  "chrome-devtools": /\b(devtools|console errors?|network (tab|requests?)|lighthouse|page (speed|performance)|web vitals)\b/,
  context7: /\b(latest docs|documentation for|api reference|up[- ]to[- ]date docs|which version of)\b/,
  supabase: /\b(postgres|database|sql|migrations?|db schema|row level security)\b/,
  neon: /\b(serverless postgres|database branch(es|ing)?)\b/,
  vercel: /\b(deploy(ment|ing|s)?|hosting|preview (url|deploy)|go live|ship it live)\b/,
  cloudflare: /\b(workers?|dns|domain( name)?s?|cdn)\b/,
  sentry: /\b(crash(es|ing)?|exceptions?|production errors?|errors? in prod|stack traces?|error monitoring)\b/,
  posthog: /\b(analytics|funnels?|feature flags?|a\/b tests?|experiments?|retention|product metrics)\b/,
  stripe: /\b(payments?|billing|subscriptions?|checkout|charge (customers|users)|pricing page)\b/,
  canva: /\b(social (media )?posts?|flyers?|slide deck|presentation design|brand assets?|thumbnails?|posters?)\b/,
  figma: /\b(mockups?|wireframes?|design (file|system)|ui design|match the design)\b/,
  linear: /\b(issues?|tickets?|sprints?|backlog|bug tracker)\b/,
  notion: /\b(wiki|meeting notes|notes? database|knowledge base)\b/,
  atlassian: /\b(jira|confluence)\b/,
  memory: /\b(knowledge graph|remember (people|companies|contacts)|crm)\b/,
  "sequential-thinking": /\b(think (this|it) through|step[- ]by[- ]step reasoning|hard (problem|puzzle))\b/,
};
const STOP = new Set(["about", "their", "there", "these", "which", "would", "could", "should", "using", "skill", "skills", "claude", "when", "with", "from", "that", "this", "your", "into", "them", "what", "have", "make", "help", "files", "file", "user", "users", "things", "other"]);
/** Light stemming so "decks"/"deck" and "presentations"/"presentation" meet. */
const stem = (w: string) => w.replace(/(ations?|ings?|ions?|es|s)$/, "").slice(0, 6);
const words = (s: string) => new Set((s.toLowerCase().match(/[a-z][a-z0-9]{3,}/g) ?? []).filter((w) => !STOP.has(w)).map(stem));

export interface McpRec { kind: "mcp"; id: string; title: string; blurb: string; oauth: boolean; why: string }
export interface SkillRec { kind: "skill"; name: string; description: string; why: string }

export function recommend(ask: string, input: { featured: Featured[]; added: string[]; skills: Array<{ name: string; description?: string }>; installed: string[] }): { mcp: McpRec[]; skills: SkillRec[] } {
  const t = ask.toLowerCase();
  if (t.trim().length < 12) return { mcp: [], skills: [] };
  const mcp = input.featured
    .filter((f) => !input.added.includes(f.name) && f.id !== "filesystem")
    .map((f) => {
      const named = new RegExp(`\\b${f.title.toLowerCase().split(/[\s&]+/)[0]!.replace(/[^a-z0-9]/g, "")}\\b`).test(t) || new RegExp(`\\b${f.name}\\b`).test(t);
      const hint = HINTS[f.id]?.exec(t)?.[0];
      return { f, score: named ? 3 : hint ? 1 : 0, why: named ? `You mentioned ${f.title}` : hint ? `For “${hint}”` : "" };
    })
    .filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 2)
    .map(({ f, why }) => ({ kind: "mcp" as const, id: f.id, title: f.title, blurb: f.blurb, oauth: f.auth === "oauth", why }));
  const askWords = words(t);
  const skills = input.skills
    .filter((s) => !input.installed.includes(s.name))
    .map((s) => {
      const nameHits = s.name.split(/[-_]/).filter((w) => w.length >= 4 && askWords.has(stem(w))).length;
      const descHits = [...words(s.description ?? "")].filter((w) => w.length >= 4 && askWords.has(w)).length;
      return { s, score: nameHits * 2 + (descHits >= 2 ? descHits : 0) };
    })
    .filter((x) => x.score >= 3).sort((a, b) => b.score - a.score).slice(0, 1)
    .map(({ s }) => ({ kind: "skill" as const, name: s.name, description: (s.description ?? "").split(/(?<=\.)\s/)[0]!.slice(0, 140), why: "Matches what you're asking" }));
  return { mcp, skills };
}
