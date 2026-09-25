/** The app's map: five hubs, each a small set of tabs. Every screen lives in exactly one hub. */
export interface HubTab { to: string; label: string; also?: string[] }
export interface Hub { id: "home" | "crew" | "build" | "know" | "system"; label: string; hint: string; tabs: HubTab[] }

export const HUBS: Hub[] = [
  { id: "home", label: "Home", hint: "Talk to the crew, see your day", tabs: [{ to: "/", label: "Sessions", also: ["/sessions"] }, { to: "/activity", label: "Today" }] },
  { id: "crew", label: "Crew", hint: "Your team, live", tabs: [{ to: "/crew", label: "Team" }, { to: "/rooms", label: "Rooms" }, { to: "/floor", label: "Floor" }, { to: "/studio", label: "Studio" }] },
  { id: "build", label: "Build", hint: "Ventures, plans and the board", tabs: [{ to: "/ventures", label: "Ventures" }, { to: "/playbooks", label: "Playbooks", also: ["/plays"] }, { to: "/specs", label: "Specs" }, { to: "/board", label: "Board", also: ["/review", "/runs"] }, { to: "/schedules", label: "Schedules" }] },
  { id: "know", label: "Know", hint: "Library, memory, learning", tabs: [{ to: "/library", label: "Library" }, { to: "/memory", label: "Memory" }, { to: "/learn", label: "Learning" }] },
  { id: "system", label: "System", hint: "Tools, policy, insights", tabs: [{ to: "/integrations", label: "Tools & Skills" }, { to: "/policy", label: "Policy & Audit" }, { to: "/observability", label: "Insights", also: ["/usage", "/developer", "/insights"] }, { to: "/terminal", label: "Terminal" }] },
];

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
