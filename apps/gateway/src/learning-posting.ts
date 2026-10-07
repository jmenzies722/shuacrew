/**
 * Paste a job link and Shua reads it: the posting's role, company, location and description, so a job is one paste
 * and the fit check has the real posting to read. Most hiring sites (Greenhouse, Lever, Ashby, Workday, LinkedIn's
 * public pages…) embed the posting as schema.org JobPosting data; anything else falls back to the page's own title and
 * text. Links can come from Shua as well as from you, so only public web pages are ever fetched — never this Mac, its
 * network or the tailnet — and every redirect is checked the same way.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export interface Posting { url: string; company: string; role: string; location: string; description: string }

/** An address on this Mac, its network, the tailnet (100.64/10) or link-local: never fetched. */
export function privateAddress(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return privateAddress(v.slice(7));
  if (v.includes(":")) return v === "::1" || v === "::" || /^f[cd]/.test(v) || v.startsWith("fe80");
  const [a = -1, b = -1] = v.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

/** The link as a public web page, or why not (in words). */
export async function publicUrl(raw: string, resolve: (host: string) => Promise<string[]> = async (h) => (await lookup(h, { all: true })).map((a) => a.address)): Promise<URL | string> {
  let u: URL; try { u = new URL(raw.trim()); } catch { return "That isn't a link."; }
  if (!/^https?:$/.test(u.protocol)) return "Only web links (https://…).";
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|.+\.local|.+\.internal|.+\.ts\.net)$/i.test(host)) return "That link points at this network, not the web.";
  let addrs: string[]; try { addrs = isIP(host) ? [host] : await resolve(host); } catch { return "Couldn't find that site."; }
  if (!addrs.length || addrs.some(privateAddress)) return "That link points at this network, not the web.";
  return u;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", bull: "•" };
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => e[0] === "#" ? String.fromCodePoint(e[1]?.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e.toLowerCase()] ?? m);

/** Readable text from HTML: no scripts or styles, line breaks where blocks end, entities decoded, spaces tidied. */
export function textOf(html: string, max = 20_000): string {
  return decode(html.replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|section|article|ul|ol)>/gi, "\n").replace(/<li[^>]*>/gi, "\n• ").replace(/<[^>]+>/g, " "))
    .replace(/[ \t\f\r]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
}

const meta = (html: string, key: string) => decode(html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, "i"))?.[1]
  ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, "i"))?.[1] ?? "").trim();

/** The company from a hiring site's own URL (boards.greenhouse.io/acme, jobs.lever.co/acme…), else the site's name. */
function companyFromUrl(u: URL): string {
  const seg = u.pathname.split("/").filter(Boolean)[0] ?? "";
  if (/(greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|smartrecruiters\.com|recruitee\.com)$/i.test(u.hostname) && seg) return seg.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const parts = u.hostname.replace(/^www\.|^(jobs|careers|boards|apply)\./i, "").split(".");
  const name = parts.length > 1 ? parts.at(-2)! : parts[0]!;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** The posting in a page: schema.org JobPosting first, the page's title and text otherwise. */
export function parsePosting(html: string, url: URL): Posting {
  const nodes: Array<Record<string, unknown>> = [];
  const walk = (v: unknown) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") { const o = v as Record<string, unknown>; nodes.push(o); if (o["@graph"]) walk(o["@graph"]); } };
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) { try { walk(JSON.parse(m[1]!)); } catch { /* a broken block: try the next */ } }
  const job = nodes.find((n) => [n["@type"]].flat().includes("JobPosting"));
  const s = (v: unknown) => (typeof v === "string" ? decode(v).trim() : "");
  if (job) {
    const org = job.hiringOrganization as { name?: unknown } | undefined;
    const place = [job.jobLocation].flat()[0] as { address?: { addressLocality?: unknown; addressRegion?: unknown; addressCountry?: unknown } } | undefined;
    const remote = s(job.jobLocationType) === "TELECOMMUTE" ? "Remote" : "";
    const location = [s(place?.address?.addressLocality), s(place?.address?.addressRegion)].filter(Boolean).join(", ") || remote;
    return { url: url.href, company: s(org?.name) || companyFromUrl(url), role: s(job.title), location, description: textOf(s(job.description) || html) };
  }
  const site = meta(html, "og:site_name"), company = site || companyFromUrl(url);
  const rawTitle = meta(html, "og:title") || decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();
  // "Senior Engineer - Acme | Careers" → "Senior Engineer"
  const role = rawTitle.split(/\s+[|–—-]\s+|\s+at\s+/i)[0]!.replace(/^job application for\s+/i, "").trim();
  return { url: url.href, company, role: role === company ? "" : role, location: "", description: textOf(html.match(/<body[\s\S]*<\/body>/i)?.[0] ?? html) };
}

/** Fetch and read a posting (public pages only, redirects checked, 8 s, 3 MB). */
export async function readPosting(raw: string, deps: { fetch?: typeof fetch; resolve?: (host: string) => Promise<string[]> } = {}): Promise<Posting | string> {
  const get = deps.fetch ?? fetch;
  let target = await publicUrl(raw, deps.resolve);
  for (let hop = 0; hop < 4; hop++) {
    if (typeof target === "string") return target;
    let res: Response;
    try { res = await get(target, { redirect: "manual", signal: AbortSignal.timeout(8000), headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15", accept: "text/html,application/xhtml+xml" } }); }
    catch { return "The page didn't load. Paste the description instead."; }
    if (res.status >= 300 && res.status < 400) { const to = res.headers.get("location"); if (!to) return "The page didn't load. Paste the description instead."; target = await publicUrl(new URL(to, target).href, deps.resolve); continue; }
    if (!res.ok) return res.status === 403 || res.status === 999 ? "That site doesn't let apps read its postings. Paste the description instead." : `The page answered ${res.status}. Paste the description instead.`;
    const html = (await res.text()).slice(0, 3_000_000);
    const posting = parsePosting(html, target);
    if (posting.description.length < 120) return "There's no posting on that page that Shua can read. Paste the description instead.";
    return posting;
  }
  return "Too many redirects. Paste the description instead.";
}
