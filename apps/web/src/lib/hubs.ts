/**
 * The app's map: four sections — Home, then what Shua knows (Intelligence), what runs without you (Autopilot) and who
 * does the work (Crew) — and everything else folded under More. Every screen lives in exactly one hub.
 */
export interface HubTab { to: string; label: string; also?: string[] }
export interface Hub { id: "home" | "intelligence" | "autopilot" | "crew" | "system"; label: string; hint: string; tabs: HubTab[] }

export const HUBS: Hub[] = [
  { id: "home", label: "Home", hint: "Your sessions and your day", tabs: [{ to: "/", label: "Sessions", also: ["/sessions"] }, { to: "/activity", label: "Today" }] },
  { id: "intelligence", label: "Intelligence", hint: "What Shua knows, and how well it works", tabs: [{ to: "/memory", label: "Memory" }, { to: "/library", label: "Library" }, { to: "/observability", label: "Insights", also: ["/developer", "/insights"] }] },
  { id: "autopilot", label: "Autopilot", hint: "What runs without you", tabs: [{ to: "/schedules", label: "Schedules" }, { to: "/playbooks", label: "Playbooks", also: ["/plays"] }, { to: "/board", label: "Board", also: ["/review", "/runs"] }] },
  { id: "crew", label: "Crew", hint: "Your studio, live", tabs: [{ to: "/floor", label: "Studio floor" }, { to: "/crew", label: "Agents" }, { to: "/rooms", label: "Rooms" }] },
  { id: "system", label: "More", hint: "Projects, tools and the numbers", tabs: [{ to: "/ventures", label: "Projects" }, { to: "/specs", label: "Specs" }, { to: "/studio", label: "Creative studio" }, { to: "/integrations", label: "Tools & Skills" }, { to: "/policy", label: "Policy & Audit" }, { to: "/usage", label: "Usage" }, { to: "/terminal", label: "Terminal" }] },
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
