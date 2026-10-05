/** The app's map: six sections and secondary tools, each a small set of tabs. Every screen lives in exactly one hub. */
export interface HubTab { to: string; label: string; also?: string[] }
export interface Hub { id: "home" | "crew" | "build" | "know" | "automations" | "library" | "system"; label: string; hint: string; tabs: HubTab[] }

export const HUBS: Hub[] = [
  { id: "home", label: "Today", hint: "Your next move", tabs: [{ to: "/activity", label: "Overview" }, { to: "/", label: "Sessions", also: ["/sessions"] }] },
  { id: "build", label: "Projects", hint: "From idea to shipped", tabs: [{ to: "/ventures", label: "Projects" }, { to: "/board", label: "Board", also: ["/review", "/runs"] }, { to: "/specs", label: "Specs" }, { to: "/studio", label: "Creative studio" }] },
  { id: "crew", label: "Crew", hint: "Your studio, live", tabs: [{ to: "/floor", label: "Studio floor" }, { to: "/crew", label: "Agents" }, { to: "/rooms", label: "Rooms" }] },
  { id: "know", label: "Learning", hint: "Understand, practice, retain", tabs: [{ to: "/learn", label: "Learning path" }, { to: "/teach", label: "Visual workspace" }] },
  { id: "automations", label: "Automations", hint: "Teach once, reuse carefully", tabs: [{ to: "/playbooks", label: "Playbooks", also: ["/plays"] }, { to: "/schedules", label: "Schedules" }] },
  { id: "library", label: "Library", hint: "Everything worth keeping", tabs: [{ to: "/library", label: "Artifacts & knowledge" }, { to: "/memory", label: "Memory" }] },
  { id: "system", label: "All tools", hint: "Connections and controls", tabs: [{ to: "/integrations", label: "Tools & Skills" }, { to: "/policy", label: "Policy & Audit" }, { to: "/observability", label: "Insights", also: ["/usage", "/developer", "/insights"] }, { to: "/terminal", label: "Terminal" }] },
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
