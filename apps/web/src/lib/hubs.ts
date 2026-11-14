/**
 * The app's map: Home (your sessions and your day), Knowledge (what the crew has learned and made), Autopilot (what
 * runs without you) and Crew (who is working, live) — with the few system pages folded under More. Every screen lives
 * in exactly one hub. The Board and the Agents page are still routes (deep links and the command palette reach them)
 * but are no longer places in the sidebar: Home filters sessions by status, and agents are being redesigned.
 */
export interface HubTab { to: string; label: string; also?: string[] }
export interface Hub { id: "home" | "knowledge" | "autopilot" | "crew" | "system"; label: string; hint: string; tabs: HubTab[] }

export const HUBS: Hub[] = [
  { id: "home", label: "Home", hint: "Your sessions and your day", tabs: [{ to: "/", label: "Sessions", also: ["/sessions", "/board", "/review", "/runs"] }, { to: "/inbox", label: "Inbox" }, { to: "/activity", label: "Today" }] },
  { id: "knowledge", label: "Knowledge", hint: "What the crew has learned and made", tabs: [{ to: "/profile", label: "About you" }, { to: "/memory", label: "Memory" }, { to: "/library", label: "Library" }] },
  { id: "autopilot", label: "Autopilot", hint: "What runs without you", tabs: [{ to: "/schedules", label: "Schedules" }] },
  { id: "crew", label: "Crew", hint: "Who is working, and on what", tabs: [{ to: "/floor", label: "Live", also: ["/crew"] }] },
  { id: "system", label: "More", hint: "Tools, guardrails and the numbers", tabs: [{ to: "/observability", label: "Insights", also: ["/developer", "/insights"] }, { to: "/usage", label: "Usage" }, { to: "/integrations", label: "Tools & Skills" }, { to: "/policy", label: "Policy & Audit" }, { to: "/specs", label: "Specs" }, { to: "/terminal", label: "Terminal" }] },
];
export const PRIMARY_HUBS = HUBS.filter(hub => hub.id !== "system");

const matches = (path: string, prefix: string) => (prefix === "/" ? path === "/" : path === prefix || path.startsWith(`${prefix}/`));

/** Which hub and tab a path belongs to (Settings and unknown paths belong to none). */
export function locate(path: string): { hub: Hub; tab: HubTab } | null {
  for (const hub of HUBS) for (const tab of hub.tabs) if ([tab.to, ...(tab.also ?? [])].some((p) => matches(path, p))) return { hub, tab };
  return null;
}

/** Where a hub opens: the tab you last used in it, else its first. */
export function hubEntry(hub: Hub, last: Record<string, string>) {
  const remembered = last[hub.id];
  return remembered && locate(remembered)?.hub.id === hub.id ? remembered : hub.tabs[0]!.to;
}
